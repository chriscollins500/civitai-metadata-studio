(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { API_RESPONSE_LIMIT, API_ROOT } = Studio.constants;
  const {
    isPresent,
    normalizeHash,
    positiveIdOrNull,
    sanitizeText,
    selectHash,
    strongestHash
  } = Studio.util;

  const CACHE_TTL = Studio.identityCache.TTL.positive;
  const NEGATIVE_CACHE_TTL = Studio.identityCache.TTL.negative;
  const SEARCH_CACHE_TTL = Studio.identityCache.TTL.search;
  const MODEL_BATCH_SIZE = 20;
  const HASH_BATCH_SIZE = 20;
  const MAX_RATE_LIMIT_COOLDOWN = 5 * 60 * 1000;
  const RETRYABLE_STATUS = new Set([502, 503, 504]);
  const RETRY_DELAYS = [500, 1500, 3000];
  const inflight = new Map();
  let cooldownUntil = 0;

  function rateLimitError(delay = cooldownUntil - Date.now()) {
    const seconds = Math.max(1, Math.ceil(Math.max(0, delay) / 1000));
    const error = new Error(`Civitai rate-limited verification. Try again in about ${seconds} second${seconds === 1 ? "" : "s"}; no additional requests were sent.`);
    error.name = "CivitaiRateLimitError";
    error.retryAfterSeconds = seconds;
    error.retryable = true;
    return error;
  }

  function retryAfterDelay(response, fallback = 1000) {
    const value = response?.headers?.get("retry-after") || "";
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    return fallback;
  }

  function waitForRetry(delay, signal) {
    if (signal?.aborted) return Promise.reject(new DOMException("Verification was cancelled.", "AbortError"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, delay);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Verification was cancelled.", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async function boundedJson(response) {
    if (!response.body) throw new Error("Civitai returned an empty response.");
    const reader = response.body.getReader();
    const parts = [];
    let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > API_RESPONSE_LIMIT) {
          await reader.cancel();
          throw new Error("Civitai response exceeded the local safety limit.");
        }
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error("Civitai returned malformed JSON.");
    }
  }

  function cachedValue(key) {
    return Studio.identityCache.get(key);
  }

  function cacheValue(key, value, {
    negative = value === null,
    ttl = negative ? NEGATIVE_CACHE_TTL : CACHE_TTL,
    groupId
  } = {}) {
    return Studio.identityCache.set(key, value, { negative, ttl, groupId });
  }

  async function clearCache() {
    inflight.clear();
    cooldownUntil = 0;
    await Studio.identityCache.clear();
  }

  function increment(metrics, key) {
    if (metrics && typeof metrics === "object") metrics[key] = Number(metrics[key] || 0) + 1;
  }

  function compactVersionPayload(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const model = value.model && typeof value.model === "object" ? value.model : {};
    return {
      id: value.id,
      modelVersionId: value.modelVersionId,
      modelId: value.modelId,
      name: value.name,
      air: value.air,
      urn: value.urn,
      baseModel: value.baseModel,
      type: value.type,
      modelType: value.modelType,
      trainedWords: Array.isArray(value.trainedWords) ? value.trainedWords.slice(0, 200) : [],
      model: {
        id: model.id,
        name: model.name,
        type: model.type,
        username: model.username,
        creator: model.creator ? { username: model.creator.username } : undefined,
        allowNoCredit: model.allowNoCredit,
        allowCommercialUse: model.allowCommercialUse,
        allowDerivatives: model.allowDerivatives,
        allowDifferentLicense: model.allowDifferentLicense
      },
      files: (Array.isArray(value.files) ? value.files : []).slice(0, 200).map((file) => ({
        id: file?.id,
        name: file?.name,
        primary: file?.primary,
        type: file?.type,
        format: file?.format ?? file?.metadata?.format,
        metadata: file?.metadata?.format ? { format: file.metadata.format } : undefined,
        hashes: file?.hashes && typeof file.hashes === "object" ? file.hashes : {}
      }))
    };
  }

  function compactModelPayload(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return {
      id: value.id,
      name: value.name,
      type: value.type,
      creator: value.creator ? { username: value.creator.username } : undefined,
      username: value.username,
      allowNoCredit: value.allowNoCredit,
      allowCommercialUse: value.allowCommercialUse,
      allowDerivatives: value.allowDerivatives,
      allowDifferentLicense: value.allowDifferentLicense
    };
  }

  function compactSearchPayload(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.items)) return value;
    return {
      items: value.items.slice(0, 10).map((model) => ({
        ...compactModelPayload(model),
        modelVersions: (Array.isArray(model.modelVersions) ? model.modelVersions : [])
          .slice(0, 10)
          .map(compactVersionPayload)
      }))
    };
  }

  function requestIdentity(method, path, body) {
    return `${method}:${path}:${body || ""}`;
  }

  async function performRequest(path, {
    signal,
    cacheKey,
    cacheTtl,
    compact,
    method,
    body,
    headers,
    metrics,
    batch
  }) {
    const remainingCooldown = cooldownUntil - Date.now();
    if (remainingCooldown > 0) throw rateLimitError(remainingCooldown);

    let response;
    let transientAttempt = 0;
    while (true) {
      try {
        increment(metrics, "networkCalls");
        if (batch) increment(metrics, "batchCalls");
        response = await fetch(`${API_ROOT}${path}`, {
          method,
          headers: {
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...headers
          },
          body,
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal
        });
      } catch (error) {
        if (error.name === "AbortError") throw error;
        if (transientAttempt >= RETRY_DELAYS.length) {
          throw new Error("Civitai could not be reached. Check the connection or turn automatic verification off.");
        }
        await waitForRetry(RETRY_DELAYS[transientAttempt], signal);
        transientAttempt += 1;
        continue;
      }

      if (response.status === 429) {
        const delay = Math.min(MAX_RATE_LIMIT_COOLDOWN, Math.max(1000, retryAfterDelay(response)));
        cooldownUntil = Math.max(cooldownUntil, Date.now() + delay);
        await response.body?.cancel().catch(() => {});
        throw rateLimitError(delay);
      }

      if (RETRYABLE_STATUS.has(response.status) && transientAttempt < RETRY_DELAYS.length) {
        await response.body?.cancel().catch(() => {});
        await waitForRetry(retryAfterDelay(response, RETRY_DELAYS[transientAttempt]), signal);
        transientAttempt += 1;
        continue;
      }
      break;
    }

    if (response.status === 404) {
      if (cacheKey) await cacheValue(cacheKey, null, { negative: true, ttl: NEGATIVE_CACHE_TTL });
      return null;
    }
    if (!response.ok) throw new Error(`Civitai verification failed with HTTP ${response.status}.`);
    const value = await boundedJson(response);
    if (cacheKey) await cacheValue(cacheKey, compact(value), { ttl: cacheTtl });
    return value;
  }

  async function request(path, {
    signal,
    cacheKey,
    cacheTtl = CACHE_TTL,
    compact = compactVersionPayload,
    method = "GET",
    body,
    headers,
    metrics,
    batch = false
  } = {}) {
    const cached = await cachedValue(cacheKey, cacheTtl);
    if (cached.hit) {
      increment(metrics, "cacheHits");
      return cached.value;
    }

    const identity = requestIdentity(method, path, body);
    if (inflight.has(identity)) {
      increment(metrics, "coalesced");
      return inflight.get(identity);
    }
    const pending = performRequest(path, {
      signal,
      cacheKey,
      cacheTtl,
      compact,
      method,
      body,
      headers,
      metrics,
      batch
    });
    inflight.set(identity, pending);
    try {
      return await pending;
    } finally {
      if (inflight.get(identity) === pending) inflight.delete(identity);
    }
  }

  function hashEntries(files) {
    const entries = [];
    for (const file of Array.isArray(files) ? files : []) {
      for (const [algorithm, value] of Object.entries(file?.hashes || {})) {
        const hash = normalizeHash(value);
        if (hash) entries.push({ algorithm: canonicalHashAlgorithm(algorithm), hash, file });
      }
    }
    return entries;
  }

  function canonicalHashAlgorithm(value) {
    const compact = String(value || "").toLowerCase().replace(/[^a-z0-9]/gu, "");
    return Studio.constants.HASH_PRIORITY.find((algorithm) =>
      algorithm.toLowerCase().replace(/[^a-z0-9]/gu, "") === compact
    ) || sanitizeText(value || "hash", 32).replace(/[^A-Za-z0-9]/gu, "") || "hash";
  }

  function hashCandidateKey(algorithm, value) {
    const hash = normalizeHash(value);
    return hash ? `hash-candidates:${canonicalHashAlgorithm(algorithm)}:${hash}` : "";
  }

  function hashCandidateKeys(value, algorithm = "") {
    const hash = normalizeHash(value);
    if (!hash) return [];
    const algorithms = algorithm
      ? [canonicalHashAlgorithm(algorithm)]
      : Studio.constants.HASH_PRIORITY.filter((candidate) =>
          Number(Studio.constants.HASH_LENGTHS[candidate]) === hash.length
        );
    return algorithms.map((candidate) => hashCandidateKey(candidate, hash));
  }

  async function cachedHashCandidates(value, algorithm = "") {
    const keys = hashCandidateKeys(value, algorithm);
    const records = await Studio.identityCache.getMany(keys);
    for (const key of keys) {
      const record = records.get(key);
      if (record?.hit) {
        return {
          ...record,
          value: Array.isArray(record.value?.candidates) ? record.value.candidates : []
        };
      }
    }
    return { hit: false, value: null };
  }

  function versionCacheRecords(value) {
    const compact = compactVersionPayload(value);
    const versionId = positiveIdOrNull(compact?.id ?? compact?.modelVersionId);
    if (!versionId) return [];
    const groupId = `version:${versionId}`;
    const modelId = positiveIdOrNull(compact.modelId ?? compact.model?.id);
    const records = [{
      key: groupId,
      value: compact,
      ttl: CACHE_TTL,
      groupId
    }];
    if (modelId && compact.model) {
      records.push({
        key: `model:${modelId}`,
        value: compactModelPayload(compact.model),
        ttl: CACHE_TTL,
        groupId: `model:${modelId}`
      });
    }
    return records;
  }

  function candidateDescriptor(value, entry) {
    const versionId = positiveIdOrNull(value?.id ?? value?.modelVersionId);
    if (!versionId) return null;
    return {
      modelId: positiveIdOrNull(value?.modelId ?? value?.model?.id),
      modelVersionId: versionId,
      fileId: positiveIdOrNull(entry?.file?.id),
      fileType: Studio.civitaiContract.normalizeModelFileType(entry?.file?.type),
      filePrimary: typeof entry?.file?.primary === "boolean" ? entry.file.primary : null,
      format: Studio.civitaiContract.normalizeModelFileFormat(
        entry?.file?.format ?? entry?.file?.metadata?.format
      )
    };
  }

  function candidateIdentity(candidate) {
    return [
      positiveIdOrNull(candidate?.modelVersionId) || "",
      positiveIdOrNull(candidate?.fileId) || "",
      sanitizeText(candidate?.fileType || "", 80),
      sanitizeText(candidate?.format || "", 40)
    ].join(":");
  }

  async function mergeHashCandidateRecords(descriptors) {
    const grouped = new Map();
    for (const descriptor of descriptors) {
      if (!descriptor?.key || !descriptor?.candidate) continue;
      const group = grouped.get(descriptor.key) || {
        algorithm: descriptor.algorithm,
        hash: descriptor.hash,
        candidates: []
      };
      group.candidates.push(descriptor.candidate);
      grouped.set(descriptor.key, group);
    }
    if (!grouped.size) return;
    const existing = await Studio.identityCache.getMany([...grouped.keys()]);
    const records = [];
    for (const [key, value] of grouped) {
      const candidates = [
        ...(Array.isArray(existing.get(key)?.value?.candidates)
          ? existing.get(key).value.candidates
          : []),
        ...value.candidates
      ];
      const unique = [...new Map(candidates.map((candidate) => [candidateIdentity(candidate), candidate])).values()];
      records.push({
        key,
        value: { algorithm: value.algorithm, hash: value.hash, candidates: unique },
        ttl: CACHE_TTL,
        groupId: key
      });
    }
    await Studio.identityCache.setMany(records);
  }

  async function cacheVersionPayload(value) {
    const compact = compactVersionPayload(value);
    await Studio.identityCache.setMany(versionCacheRecords(compact));
    const descriptors = [];
    for (const entry of hashEntries(compact?.files)) {
      const candidate = candidateDescriptor(compact, entry);
      if (!candidate) continue;
      descriptors.push({
        key: hashCandidateKey(entry.algorithm, entry.hash),
        algorithm: entry.algorithm,
        hash: entry.hash,
        candidate
      });
    }
    await mergeHashCandidateRecords(descriptors);
  }

  function matchingEvidence(data, resource) {
    const local = selectHash(resource.hashes);
    if (!local.value) return null;
    const remote = hashEntries(data.files);
    const localAlgorithm = canonicalHashAlgorithm(local.algorithm);
    const match = remote.find((right) =>
      right.hash === local.value
      && (localAlgorithm === "hash" || canonicalHashAlgorithm(right.algorithm) === localAlgorithm)
    );
    return match
      ? {
          localAlgorithm: local.algorithm,
          remoteAlgorithm: match.algorithm,
          hash: local.value,
          file: match.file
        }
      : null;
  }

  function licenseSummary(model) {
    if (!model || typeof model !== "object") return "";
    const parts = [];
    if (isPresent(model.allowNoCredit)) parts.push(model.allowNoCredit ? "credit optional" : "credit required");
    if (isPresent(model.allowCommercialUse)) {
      const commercial = sanitizeText(model.allowCommercialUse, 512)
        .trim()
        .replace(/^\{(.*)\}$/u, "$1")
        .replace(/^\[(.*)\]$/u, "$1")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .join(", ");
      parts.push(`commercial: ${commercial || "none"}`);
    }
    if (isPresent(model.allowDerivatives)) parts.push(model.allowDerivatives ? "derivatives allowed" : "no derivatives");
    if (isPresent(model.allowDifferentLicense)) parts.push(model.allowDifferentLicense ? "different license allowed" : "same license");
    return parts.join(" · ");
  }

  function roleFromType(value) {
    const type = String(value || "").toLowerCase();
    if (type.includes("lora") || type.includes("lycoris")) return "lora";
    if (type.includes("vae")) return "vae";
    if (type.includes("textual") || type.includes("embedding")) return "embedding";
    if (type.includes("control")) return "controlnet";
    if (type.includes("upscal")) return "upscaler";
    if (type.includes("hyper")) return "hypernetwork";
    if (type.includes("checkpoint")) return "checkpoint";
    return "other";
  }

  function normalizeVersion(data, matchedFile = null) {
    if (!data || typeof data !== "object") return null;
    const model = data.model && typeof data.model === "object" ? data.model : {};
    const file = matchedFile || (Array.isArray(data.files) ? data.files.find((item) => item?.primary) || data.files[0] : null) || {};
    const airValue = file.air || data.air || data.urn || "";
    let parsedAir = Studio.air.parseAir(airValue);
    const fileId = positiveIdOrNull(file.id);
    const filePrimary = typeof file.primary === "boolean" ? file.primary : null;
    const format = Studio.civitaiContract.normalizeModelFileFormat(file.format ?? file.metadata?.format);
    if (parsedAir.valid && fileId && (parsedAir.fileId || filePrimary !== true)) {
      const attached = Studio.air.attachFile(parsedAir.rawAir, {
        fileId: String(fileId),
        format,
        qualify: true
      });
      if (attached.valid) parsedAir = attached;
    }
    const modelType = sanitizeText(model.type || data.type || data.modelType || "Other", 80);
    return {
      name: sanitizeText(model.name || data.modelName || data.name || "Civitai resource", 512),
      versionName: sanitizeText(data.name || "", 512),
      baseModel: sanitizeText(data.baseModel || "", 160),
      type: modelType,
      resourceType: parsedAir.valid
        ? parsedAir.type
        : Studio.civitaiContract.modelTypeToResourceType(modelType),
      canonicalAir: parsedAir.canonicalAir,
      rawAir: parsedAir.rawAir,
      modelId: positiveIdOrNull(data.modelId ?? model.id ?? (parsedAir.source === "civitai" ? parsedAir.id : null)),
      modelVersionId: positiveIdOrNull(data.id ?? data.modelVersionId ?? (parsedAir.source === "civitai" ? parsedAir.version : null)),
      fileId,
      fileType: Studio.civitaiContract.normalizeModelFileType(file.type) || "",
      filePrimary,
      format: parsedAir.format || format || "",
      identityScope: fileId && filePrimary !== true ? "exact_file" : "model_version",
      filename: Studio.util.basename(file.name || ""),
      hashes: Object.fromEntries(
        Object.entries(file.hashes || {}).map(([key, value]) => [key, normalizeHash(value)]).filter(([, value]) => value)
      ),
      trainedWords: Array.isArray(data.trainedWords) ? data.trainedWords.map((word) => sanitizeText(word, 512)) : [],
      creator: sanitizeText(model.creator?.username || model.username || "", 512),
      license: licenseSummary(model),
      sourceUrl: positiveIdOrNull(data.modelId ?? model.id)
        ? `https://civitai.com/models/${positiveIdOrNull(data.modelId ?? model.id)}?modelVersionId=${positiveIdOrNull(data.id ?? data.modelVersionId) || ""}`
        : ""
    };
  }

  async function enrichVersionModel(data, { signal, metrics } = {}) {
    const modelId = positiveIdOrNull(data?.modelId ?? data?.model?.id);
    if (!modelId) return data;
    const embedded = data.model && typeof data.model === "object" ? data.model : {};
    const hasCreator = Boolean(embedded.creator?.username || embedded.username);
    const hasLicense = ["allowNoCredit", "allowCommercialUse", "allowDerivatives", "allowDifferentLicense"]
      .every((key) => isPresent(embedded[key]));
    if (hasCreator && hasLicense) return data;

    let model;
    try {
      model = await request(`/models/${modelId}`, {
        signal,
        metrics,
        cacheKey: `model:${modelId}`,
        compact: compactModelPayload
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      return data;
    }
    if (!model) return data;
    if (positiveIdOrNull(model.id) !== modelId) {
      throw new Error("Civitai returned a different model ID while enriching a model version.");
    }
    return {
      ...data,
      model: {
        ...model,
        ...embedded,
        id: modelId
      }
    };
  }

  function validateIdentityConsistency(identity) {
    const air = Studio.air.parseAir(identity.rawAir || identity.canonicalAir || "");
    if (!air.valid || air.source !== "civitai") return;
    if (identity.modelId && air.id && Number(identity.modelId) !== Number(air.id)) {
      throw new Error("Civitai returned an AIR whose model ID conflicts with its response model ID.");
    }
    if (identity.modelVersionId && air.version && Number(identity.modelVersionId) !== Number(air.version)) {
      throw new Error("Civitai returned an AIR whose version ID conflicts with its response version ID.");
    }
  }

  async function lookupByVersion(modelVersionId, options = {}) {
    const id = positiveIdOrNull(modelVersionId);
    if (!id) return null;
    const response = await request(`/model-versions/${id}`, { ...options, cacheKey: `version:${id}` });
    if (!response) return null;
    if (positiveIdOrNull(response.id ?? response.modelVersionId) !== id) {
      throw new Error("Civitai returned a different model version ID.");
    }
    const data = await enrichVersionModel(response, options);
    await cacheVersionPayload(data);
    const identity = normalizeVersion(data);
    validateIdentityConsistency(identity);
    return { data, identity, evidence: { kind: "modelVersionId", value: id } };
  }

  function payloadVersions(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.results)) return value.results;
    return value && typeof value === "object" ? [value] : [];
  }

  function resultIdentityKey(result) {
    return [
      positiveIdOrNull(result?.identity?.modelVersionId) || "",
      positiveIdOrNull(result?.identity?.fileId) || "",
      sanitizeText(result?.identity?.resourceType || result?.identity?.type || "", 80).toLowerCase()
    ].join(":");
  }

  async function hashResultsFromPayload(value, hash, algorithm, options = {}) {
    const results = [];
    for (const candidate of payloadVersions(value).slice(0, 200)) {
      if (!candidate || typeof candidate !== "object") continue;
      const matches = hashEntries(candidate.files).filter((entry) =>
        entry.hash === hash
        && (!algorithm || canonicalHashAlgorithm(entry.algorithm) === algorithm)
      );
      if (!matches.length) continue;
      const data = await enrichVersionModel(candidate, options);
      await cacheVersionPayload(data);
      for (const match of matches) {
        const identity = normalizeVersion(data, match.file);
        if (!identity?.modelVersionId) continue;
        validateIdentityConsistency(identity);
        results.push({
          data,
          identity,
          evidence: {
            kind: "hash",
            value: hash,
            algorithm: match.algorithm,
            fileId: positiveIdOrNull(match.file?.id)
          }
        });
      }
    }
    return [...new Map(results.map((result) => [resultIdentityKey(result), result])).values()];
  }

  async function hashResultsFromCandidateCache(candidates, hash, algorithm, options = {}) {
    const results = [];
    for (const candidate of candidates.slice(0, 200)) {
      const versionId = positiveIdOrNull(candidate?.modelVersionId);
      if (!versionId) continue;
      const result = await lookupByVersion(versionId, options);
      if (!result) continue;
      const file = (Array.isArray(result.data?.files) ? result.data.files : []).find((item) =>
        positiveIdOrNull(item?.id) === positiveIdOrNull(candidate.fileId)
      );
      const evidence = file
        ? hashEntries([file]).find((entry) =>
            entry.hash === hash
            && (!algorithm || canonicalHashAlgorithm(entry.algorithm) === algorithm)
          )
        : matchingEvidence(result.data, { hashes: { [algorithm || "hash"]: hash } });
      if (!evidence) continue;
      result.identity = normalizeVersion(result.data, evidence.file);
      result.evidence = {
        kind: "hash",
        value: hash,
        algorithm: evidence.algorithm || evidence.remoteAlgorithm || algorithm,
        fileId: positiveIdOrNull(evidence.file?.id)
      };
      results.push(result);
    }
    return [...new Map(results.map((result) => [resultIdentityKey(result), result])).values()];
  }

  async function lookupHashCandidates(value, options = {}) {
    const hash = normalizeHash(value);
    if (!/^[A-F0-9]{8,128}$/.test(hash)) return [];
    const algorithm = options.hashAlgorithm ? canonicalHashAlgorithm(options.hashAlgorithm) : "";
    const cached = await cachedHashCandidates(hash, algorithm);
    if (cached.hit) {
      if (cached.negative) return [];
      const results = await hashResultsFromCandidateCache(cached.value, hash, algorithm, options);
      if (results.length) return results;
    }
    if ((await cachedValue(`hash-miss:${algorithm || "hash"}:${hash}`)).hit) return [];
    const useRoleAwarePost = algorithm === "SHA256" && hash.length === 64;
    const response = await request(
      useRoleAwarePost
        ? "/model-versions/by-hash"
        : `/model-versions/by-hash/${encodeURIComponent(hash)}`,
      {
        ...options,
        method: useRoleAwarePost ? "POST" : "GET",
        body: useRoleAwarePost ? JSON.stringify([hash]) : undefined,
        compact: (data) => data,
        batch: useRoleAwarePost
      }
    );
    if (!response) {
      await cacheValue(`hash-miss:${algorithm || "hash"}:${hash}`, null, { negative: true });
      await Studio.identityCache.setMany([{
        key: hashCandidateKey(algorithm || "hash", hash),
        value: null,
        negative: true,
        ttl: NEGATIVE_CACHE_TTL,
        groupId: `hash-miss:${algorithm || "hash"}:${hash}`
      }]);
      return [];
    }
    const results = await hashResultsFromPayload(response, hash, algorithm, options);
    if (!results.length) {
      const emptyCandidates = (Array.isArray(response) && response.length === 0)
        || (Array.isArray(response?.items) && response.items.length === 0)
        || (Array.isArray(response?.results) && response.results.length === 0);
      if (!emptyCandidates) throw new Error("Civitai's response did not contain the hash that was queried.");
      await cacheValue(`hash-miss:${algorithm || "hash"}:${hash}`, null, { negative: true });
      await Studio.identityCache.setMany([{
        key: hashCandidateKey(algorithm || "hash", hash),
        value: null,
        negative: true,
        ttl: NEGATIVE_CACHE_TTL,
        groupId: `hash-miss:${algorithm || "hash"}:${hash}`
      }]);
      return [];
    }
    return results;
  }

  function chooseHashCandidate(results, resource = null) {
    const unique = [...new Map(results.map((result) => [resultIdentityKey(result), result])).values()];
    if (!resource) {
      return {
        result: unique.length === 1 ? unique[0] : null,
        candidateCount: unique.length,
        compatibleCount: unique.length,
        reason: unique.length > 1 ? "multiple_compatible_candidates_conflict" : null
      };
    }
    let compatible = unique.filter((result) =>
      Studio.civitaiContract.identityMatchesRole(resource.role, result.identity, {
        allowAmbiguous: true,
        allowFileEvidence: true
      })
    );
    const exactFileId = positiveIdOrNull(resource.fileId);
    if (exactFileId) {
      const exact = compatible.filter((result) => positiveIdOrNull(result.identity.fileId) === exactFileId);
      if (exact.length) compatible = exact;
    } else {
      const filename = Studio.util.basename(resource.filename || "").toLowerCase();
      if (filename) {
        const exact = compatible.filter((result) =>
          Studio.util.basename(result.identity.filename || "").toLowerCase() === filename
        );
        if (exact.length) compatible = exact;
      }
    }
    const strict = compatible.filter((result) =>
      Studio.civitaiContract.identityMatchesRole(resource.role, result.identity, {
        allowAmbiguous: false,
        allowFileEvidence: true
      })
    );
    if (strict.length) compatible = strict;
    const deduped = [...new Map(compatible.map((result) => [resultIdentityKey(result), result])).values()];
    return {
      result: deduped.length === 1 ? deduped[0] : null,
      candidateCount: unique.length,
      compatibleCount: deduped.length,
      reason: deduped.length > 1
        ? "multiple_compatible_candidates_conflict"
        : unique.length && !deduped.length
          ? "no_role_compatible_shared_hash_candidate"
          : null
    };
  }

  async function lookupByHash(value, options = {}) {
    const results = await lookupHashCandidates(value, options);
    if (!results.length) return null;
    const selected = chooseHashCandidate(results, options.resource || null);
    if (selected.result) {
      selected.result.diagnostics = {
        candidateCount: selected.candidateCount,
        compatibleCandidateCount: selected.compatibleCount,
        reason: selected.reason
      };
      return selected.result;
    }
    throw new Error(
      selected.reason === "no_role_compatible_shared_hash_candidate"
        ? "The hash exists on Civitai, but none of its candidates match this resource role."
        : "The hash matches multiple compatible Civitai resources, so no identity was selected."
    );
  }

  function chunks(values, size) {
    const output = [];
    for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
    return output;
  }

  async function prefetchHashCandidates(hashes, { signal, metrics } = {}) {
    const versionIds = new Set();
    for (const group of chunks(hashes, HASH_BATCH_SIZE)) {
      const data = await request("/model-versions/by-hash", {
        signal,
        metrics,
        method: "POST",
        body: JSON.stringify(group),
        compact: (value) => value,
        batch: true
      });
      const requested = new Set(group);
      for (const row of payloadVersions(data).slice(0, 500)) {
        const matchingHashes = hashEntries(row?.files)
          .filter((entry) =>
            canonicalHashAlgorithm(entry.algorithm) === "SHA256"
            && requested.has(entry.hash)
          );
        if (!matchingHashes.length) continue;
        const versionId = positiveIdOrNull(row?.id ?? row?.modelVersionId);
        if (versionId) versionIds.add(versionId);
        await cacheVersionPayload(row);
      }
    }
    return versionIds;
  }

  async function prefetchVersions(versionIds, { signal, metrics } = {}) {
    const unique = [...new Set(versionIds.map(positiveIdOrNull).filter(Boolean))];
    const cached = await Studio.identityCache.getMany(unique.map((id) => `version:${id}`));
    const needed = unique.filter((id) => !cached.get(`version:${id}`)?.hit);
    for (const group of chunks(needed, MODEL_BATCH_SIZE)) {
      const data = await request(`/models?limit=100&modelVersionIds=${group.join(",")}`, {
        signal,
        metrics,
        compact: (value) => value,
        batch: true
      });
      const expected = new Set(group);
      const matched = new Set();
      const records = [];
      for (const model of Array.isArray(data?.items) ? data.items : []) {
        const compactModel = compactModelPayload(model);
        for (const version of Array.isArray(model?.modelVersions) ? model.modelVersions : []) {
          const id = positiveIdOrNull(version?.id ?? version?.modelVersionId);
          if (!id || !expected.has(id)) continue;
          records.push(...versionCacheRecords({
            ...version,
            id,
            modelId: positiveIdOrNull(version.modelId) || positiveIdOrNull(model.id),
            model: compactModel
          }));
          matched.add(id);
        }
      }
      await Studio.identityCache.setMany(records);
    }
  }

  async function prefetchResources(resources, { signal, metrics } = {}) {
    const versionIds = new Set();
    const sha256Hashes = new Set();
    for (const resource of resources) {
      const versionId = positiveIdOrNull(resource.modelVersionId);
      if (versionId) versionIds.add(versionId);
      if (versionId) continue;
      const sha256 = normalizeHash(resource.hashes?.SHA256 ?? resource.hashes?.sha256);
      if (!/^[A-F0-9]{64}$/.test(sha256)) continue;
      sha256Hashes.add(sha256);
    }
    const hashKeys = [...sha256Hashes].flatMap((hash) => hashCandidateKeys(hash, "SHA256"));
    const cachedHashes = await Studio.identityCache.getMany(hashKeys);
    const missingHashes = [];
    for (const sha256 of sha256Hashes) {
      const cachedMapping = hashCandidateKeys(sha256, "SHA256")
        .map((key) => cachedHashes.get(key))
        .find((entry) => entry?.hit);
      if (cachedMapping?.hit) {
        for (const candidate of Array.isArray(cachedMapping.value?.candidates) ? cachedMapping.value.candidates : []) {
          const cachedId = positiveIdOrNull(candidate?.modelVersionId);
          if (cachedId) versionIds.add(cachedId);
        }
      } else {
        missingHashes.push(sha256);
      }
    }

    if (missingHashes.length) {
      try {
        const mapped = await prefetchHashCandidates(missingHashes, { signal, metrics });
        for (const id of mapped) versionIds.add(id);
      } catch (error) {
        if (error.name === "AbortError") throw error;
        increment(metrics, "batchFallbacks");
      }
    }
    if (versionIds.size) {
      try {
        await prefetchVersions([...versionIds], { signal, metrics });
      } catch (error) {
        if (error.name === "AbortError") throw error;
        increment(metrics, "batchFallbacks");
      }
    }
  }

  function identityConflict(resource, identity, evidence) {
    const conflicts = [];
    if (resource.modelId && identity.modelId && Number(resource.modelId) !== Number(identity.modelId)) {
      conflicts.push(`model ID ${resource.modelId} conflicts with API model ID ${identity.modelId}`);
    }
    if (resource.modelVersionId && identity.modelVersionId && Number(resource.modelVersionId) !== Number(identity.modelVersionId)) {
      conflicts.push(`version ID ${resource.modelVersionId} conflicts with API version ID ${identity.modelVersionId}`);
    }
    if (resource.fileId && identity.fileId && Number(resource.fileId) !== Number(identity.fileId)) {
      conflicts.push(`file ID ${resource.fileId} conflicts with API file ID ${identity.fileId}`);
    }
    if (
      resource.role
      && resource.role !== "other"
      && !Studio.civitaiContract.identityMatchesRole(resource.role, identity, {
        allowAmbiguous: true,
        allowFileEvidence: true
      })
    ) {
      conflicts.push(`the API resource type does not match the declared ${resource.role} role`);
    }
    if (evidence?.kind === "modelVersionId" && strongestHash(resource.hashes)) {
      const match = matchingEvidence({ files: [{ hashes: identity.hashes }] }, resource);
      if (!match) conflicts.push("the claimed hash does not occur on the requested API model version file");
    }
    return conflicts;
  }

  function updateProjectionDiagnostics(resource) {
    const decision = Studio.civitaiContract.parserResourceDecision(resource);
    resource.identityScope = decision.identityScope;
    resource.parserFacing = decision.parserFacing;
    resource.parserExclusionReason = decision.reason;
  }

  function applyIdentity(resource, result) {
    const identity = result.identity;
    const conflicts = identityConflict(resource, identity, result.evidence);
    if (conflicts.length) {
      resource.verification = "conflict";
      resource.verificationMessage = conflicts.join("; ");
      resource.apiCandidate = identity;
      resource.lookupDiagnostics = {
        ...(resource.lookupDiagnostics || {}),
        candidateCount: result.diagnostics?.candidateCount ?? null,
        compatibleCandidateCount: result.diagnostics?.compatibleCandidateCount ?? null,
        reason: "hash_identity_conflict"
      };
      updateProjectionDiagnostics(resource);
      return { status: "conflict", conflicts };
    }
    for (const key of [
      "versionName",
      "baseModel",
      "canonicalAir",
      "rawAir",
      "modelId",
      "modelVersionId",
      "fileId",
      "fileType",
      "filePrimary",
      "format",
      "identityScope",
      "filename"
    ]) {
      if (!isPresent(resource[key]) && isPresent(identity[key])) resource[key] = identity[key];
    }
    if (identity.identityScope === "exact_file" && identity.canonicalAir) {
      resource.canonicalAir = identity.canonicalAir;
    }
    if ((!resource.name || ["Unidentified resource", "Primary model", "New resource"].includes(resource.name)) && identity.name) {
      resource.name = identity.name;
    }
    if ((!resource.type || resource.type === "Other") && identity.type) resource.type = identity.type;
    if ((!resource.role || resource.role === "other") && identity.type) resource.role = roleFromType(identity.type);
    resource.hashes = { ...resource.hashes, ...identity.hashes };
    resource.trainedWords = identity.trainedWords;
    resource.creator = identity.creator;
    resource.license = identity.license;
    resource.sourceUrl = identity.sourceUrl;
    resource.identitySource = "api_exact";
    resource.verification = "verified";
    resource.verificationEvidence = {
      kind: sanitizeText(result.evidence?.kind || "", 40),
      algorithm: sanitizeText(result.evidence?.algorithm || "", 40),
      value: sanitizeText(result.evidence?.value ?? "", 160),
      fileId: positiveIdOrNull(result.evidence?.fileId),
      claimedModelVersionId: positiveIdOrNull(result.evidence?.claimedModelVersionId)
    };
    resource.verificationMessage = result.evidence.kind === "hash"
      ? `Exact ${result.evidence.algorithm || "hash"} match`
      : `Exact model version ID ${result.evidence.value}`;
    resource.lookupDiagnostics = {
      attemptedHashTypes: result.diagnostics?.attemptedHashTypes || [],
      candidateCount: result.diagnostics?.candidateCount ?? (result.evidence.kind === "hash" ? 1 : null),
      compatibleCandidateCount: result.diagnostics?.compatibleCandidateCount ?? (result.evidence.kind === "hash" ? 1 : null),
      reason: result.diagnostics?.reason || null,
      status: "resolved"
    };
    resource.apiCandidate = null;
    resource.apiReference = identity;
    updateProjectionDiagnostics(resource);
    return { status: "verified" };
  }

  function availableHashAttempts(resource) {
    const output = [];
    const seen = new Set();
    for (const algorithm of Studio.constants.HASH_PRIORITY) {
      const value = normalizeHash(
        resource.hashes?.[algorithm]
        ?? Object.entries(resource.hashes || {}).find(([key]) =>
          canonicalHashAlgorithm(key) === algorithm
        )?.[1]
      );
      if (!value || seen.has(`${algorithm}:${value}`)) continue;
      const expected = Number(Studio.constants.HASH_LENGTHS[algorithm]);
      if (expected && value.length !== expected) continue;
      seen.add(`${algorithm}:${value}`);
      output.push({ algorithm, value });
    }
    return output;
  }

  async function verifyResource(resource, { signal, metrics } = {}) {
    let result = null;
    const attempts = availableHashAttempts(resource);
    const diagnostics = {
      attemptedHashTypes: [],
      candidateCount: null,
      compatibleCandidateCount: null,
      reason: null,
      status: "not_attempted"
    };
    if (resource.modelVersionId) {
      result = await lookupByVersion(resource.modelVersionId, { signal, metrics });
      if (result && attempts.length) {
        const [attempt] = attempts;
        diagnostics.attemptedHashTypes.push(attempt.algorithm);
        const evidence = matchingEvidence(result.data, { hashes: { [attempt.algorithm]: attempt.value } });
        if (!evidence) {
          resource.verification = "conflict";
          resource.verificationMessage = "The local hash does not match any file on the claimed Civitai model version.";
          resource.apiCandidate = result.identity;
          resource.lookupDiagnostics = { ...diagnostics, status: "conflict", reason: "hash_identity_conflict" };
          updateProjectionDiagnostics(resource);
          return { status: "conflict" };
        }
        result.identity = normalizeVersion(result.data, evidence.file);
        result.evidence = {
          kind: "hash",
          value: evidence.hash,
          algorithm: evidence.remoteAlgorithm || evidence.localAlgorithm,
          fileId: positiveIdOrNull(evidence.file?.id),
          claimedModelVersionId: resource.modelVersionId
        };
      }
    } else {
      for (const attempt of attempts) {
        diagnostics.attemptedHashTypes.push(attempt.algorithm);
        const candidates = await lookupHashCandidates(attempt.value, {
          signal,
          metrics,
          hashAlgorithm: attempt.algorithm
        });
        if (!candidates.length) continue;
        const selected = chooseHashCandidate(candidates, resource);
        diagnostics.candidateCount = selected.candidateCount;
        diagnostics.compatibleCandidateCount = selected.compatibleCount;
        diagnostics.reason = selected.reason;
        if (!selected.result) break;
        result = selected.result;
        result.diagnostics = {
          ...diagnostics,
          compatibleCandidateCount: selected.compatibleCount
        };
        break;
      }
    }
    if (!result) {
      const conflict = diagnostics.reason === "multiple_compatible_candidates_conflict";
      resource.verification = conflict ? "conflict" : "unresolved";
      resource.verificationMessage = conflict
        ? "The strongest available hash matches multiple compatible Civitai identities. Add an exact file ID, AIR, or model version ID."
        : diagnostics.reason === "no_role_compatible_shared_hash_candidate"
          ? "Civitai has this hash, but none of its candidates match the declared resource role."
          : resource.modelVersionId || attempts.length
            ? "Civitai returned no exact compatible match."
            : "Add an exact hash, model version ID, AIR, or local model file to verify.";
      resource.lookupDiagnostics = {
        ...diagnostics,
        status: conflict ? "conflict" : "unresolved"
      };
      updateProjectionDiagnostics(resource);
      return { status: resource.verification };
    }
    result.diagnostics ||= diagnostics;
    return applyIdentity(resource, result);
  }

  async function verifyRecord(record, {
    signal,
    onProgress,
    skipPrefetch = false,
    sharedBatch = null
  } = {}) {
    const resources = record.resources.filter((resource) => !resource.removed);
    const metrics = {
      status: "checking",
      checked: 0,
      verified: 0,
      unresolved: 0,
      errors: [],
      networkCalls: 0,
      batchCalls: 0,
      cacheHits: 0,
      coalesced: 0,
      batchFallbacks: 0
    };
    if (sharedBatch) metrics.sharedBatch = sharedBatch;
    record.verification = metrics;
    onProgress?.(record.verification);
    if (!skipPrefetch) await prefetchResources(resources, { signal, metrics });
    onProgress?.(record.verification);
    for (const resource of resources) {
      if (signal?.aborted) throw new DOMException("Verification was cancelled.", "AbortError");
      try {
        const result = await verifyResource(resource, { signal, metrics });
        if (result.status === "verified") record.verification.verified += 1;
        else record.verification.unresolved += 1;
      } catch (error) {
        if (error.name === "AbortError") throw error;
        if (error.name === "CivitaiRateLimitError") throw error;
        resource.verification = "error";
        resource.verificationMessage = error.message;
        record.verification.unresolved += 1;
        record.verification.errors.push(`${resource.name}: ${error.message}`);
      }
      record.verification.checked += 1;
      onProgress?.(record.verification);
    }
    const conflicts = resources.filter((resource) => resource.verification === "conflict").length;
    record.verification.status = record.verification.errors.length
      ? "warning"
      : conflicts
        ? "conflict"
        : record.verification.unresolved
          ? "partial"
          : resources.length
            ? "verified"
            : "no-resources";
    record.dirty = true;
    onProgress?.(record.verification);
    return record.verification;
  }

  function parseCivitaiImageId(value) {
    const raw = sanitizeText(value || "", 2048).trim();
    const direct = positiveIdOrNull(raw);
    if (direct) return direct;
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      if (!["civitai.com", "www.civitai.com", "civitai.red", "www.civitai.red"].includes(host)) return null;
      const match = url.pathname.match(/^\/images\/(\d+)(?:\/|$)/u);
      return positiveIdOrNull(match?.[1]);
    } catch {
      return null;
    }
  }

  function remoteMetaValue(meta, names) {
    for (const name of names) {
      if (isPresent(meta?.[name])) return meta[name];
    }
    return null;
  }

  function remoteDimension(meta, key) {
    const direct = remoteMetaValue(meta, [key]);
    if (isPresent(direct)) return Number(direct);
    const match = String(meta?.Size || "").trim().match(/^(\d+)\s*x\s*(\d+)$/iu);
    return match ? Number(match[key === "width" ? 1 : 2]) : null;
  }

  function normalizeImageFields(image) {
    const meta = image?.meta && typeof image.meta === "object" && !Array.isArray(image.meta)
      ? image.meta
      : {};
    const values = {
      positivePrompt: remoteMetaValue(meta, ["prompt", "Prompt"]),
      negativePrompt: remoteMetaValue(meta, ["negativePrompt", "Negative prompt"]),
      steps: remoteMetaValue(meta, ["steps", "Steps"]),
      seed: remoteMetaValue(meta, ["seed", "Seed"]),
      sampler: remoteMetaValue(meta, ["sampler", "Sampler"]),
      scheduler: remoteMetaValue(meta, ["scheduler", "Schedule type", "Scheduler"]),
      cfgScale: remoteMetaValue(meta, ["cfgScale", "CFG scale"]),
      guidance: remoteMetaValue(meta, ["guidance", "Guidance"]),
      denoise: remoteMetaValue(meta, ["denoise", "Denoising strength"]),
      clipSkip: remoteMetaValue(meta, ["clipSkip", "Clip skip"]),
      width: remoteDimension(meta, "width") || Number(image?.width) || null,
      height: remoteDimension(meta, "height") || Number(image?.height) || null,
      modelName: remoteMetaValue(meta, ["Model", "model", "modelName"]),
      modelHash: remoteMetaValue(meta, ["Model hash", "modelHash"]),
      vaeName: remoteMetaValue(meta, ["VAE", "vae", "vaeName"]),
      vaeHash: remoteMetaValue(meta, ["VAE hash", "vaeHash"])
    };
    const hashes = meta.hashes && typeof meta.hashes === "object" ? meta.hashes : {};
    values.modelHash ||= hashes.Model || hashes.model || null;
    values.vaeHash ||= hashes.VAE || hashes.vae || null;
    return Object.fromEntries(Object.entries(values).filter(([, value]) => isPresent(value)));
  }

  function imageResourceItems(image) {
    const meta = image?.meta && typeof image.meta === "object" && !Array.isArray(image.meta)
      ? image.meta
      : {};
    let resources = meta.resources;
    if (!Array.isArray(resources)) resources = meta.civitaiResources;
    if (!Array.isArray(resources)) resources = image?.resources;
    const output = Array.isArray(resources) ? resources.slice(0, 500) : [];
    const rootVersionIds = [
      positiveIdOrNull(image?.modelVersionId),
      ...(Array.isArray(image?.modelVersionIds) ? image.modelVersionIds.map(positiveIdOrNull) : [])
    ].filter(Boolean);
    for (const rootVersionId of [...new Set(rootVersionIds)]) {
      if (output.some((item) => positiveIdOrNull(item?.modelVersionId) === rootVersionId)) continue;
      output.unshift({
        name: meta.Model || meta.model || "Primary model",
        modelVersionId: rootVersionId,
        role: rootVersionIds.length === 1 ? "checkpoint" : "other",
        type: rootVersionIds.length === 1 ? "Checkpoint" : "Other"
      });
    }
    return output;
  }

  function normalizeImagePayload(image, imageId) {
    const id = positiveIdOrNull(image?.id);
    if (!id || id !== imageId) throw new Error("Civitai returned a different image ID.");
    return {
      imageId: id,
      sourceUrl: `https://civitai.com/images/${id}`,
      fields: normalizeImageFields(image),
      resources: imageResourceItems(image),
      evidence: `Civitai image ${id}`
    };
  }

  async function lookupImage(value, { signal, metrics } = {}) {
    const imageId = parseCivitaiImageId(value);
    if (!imageId) throw new Error("Enter a numeric Civitai image ID or a civitai.com/images/… URL.");
    const response = await request(`/images?imageId=${imageId}&limit=1`, {
      signal,
      metrics,
      compact: (data) => data
    });
    const items = payloadVersions(response);
    const image = items.find((item) => positiveIdOrNull(item?.id) === imageId);
    if (!image) throw new Error(`Civitai image ${imageId} was not found or does not expose public metadata.`);
    return normalizeImagePayload(image, imageId);
  }

  async function searchCandidates(name, { signal, metrics } = {}) {
    const query = sanitizeText(name, 200).trim();
    if (query.length < 2) return [];
    const cacheKey = `search:${query.toLowerCase()}`;
    const data = await request(`/models?limit=10&query=${encodeURIComponent(query)}`, {
      signal,
      metrics,
      cacheKey,
      cacheTtl: SEARCH_CACHE_TTL,
      compact: compactSearchPayload
    });
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.map((model) => ({
      modelId: positiveIdOrNull(model.id),
      name: sanitizeText(model.name || "", 512),
      type: sanitizeText(model.type || "Other", 80),
      creator: sanitizeText(model.creator?.username || "", 512),
      versions: Array.isArray(model.modelVersions)
        ? model.modelVersions.slice(0, 10).map((version) => normalizeVersion({ ...version, model }))
        : []
    }));
  }

  Studio.civitai = Object.freeze({
    applyIdentity,
    cacheStats: Studio.identityCache.stats,
    clearCache,
    lookupImage,
    lookupByHash,
    lookupByVersion,
    normalizeImagePayload,
    normalizeVersion,
    parseCivitaiImageId,
    prefetchResources,
    searchCandidates,
    verifyRecord,
    verifyResource
  });
})();
