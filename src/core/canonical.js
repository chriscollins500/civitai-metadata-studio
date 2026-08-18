(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { GENERATION_FIELDS, SCHEMA, SOURCE_PRIORITY } = Studio.constants;
  const {
    clone,
    integerOrNull,
    isPresent,
    normalizeHash,
    numberOrNull,
    positiveIdOrNull,
    randomId,
    sameValue,
    sanitizeText,
    selectHash,
    stableStringify
  } = Studio.util;
  const { parseAir } = Studio.air;

  function fieldValue(value, source, evidence = "", confidence = "claimed") {
    return { value, source, evidence, confidence, edited: false };
  }

  function addCandidate(candidates, key, value, source, evidence = "", confidence = "claimed") {
    if (!isPresent(value) || !GENERATION_FIELDS.some((field) => field.key === key)) return;
    (candidates[key] ||= []).push(fieldValue(value, source, evidence, confidence));
  }

  function normalizeRole(value, type = "") {
    const text = sanitizeText(value || type, 80).trim().toLowerCase();
    if (text.includes("lora") || text.includes("lycoris")) return "lora";
    if (text.includes("vae")) return "vae";
    if (text.includes("embedding") || text.includes("textual")) return "embedding";
    if (text.includes("control")) return "controlnet";
    if (text.includes("ipadapter") || text.includes("ip adapter")) return "ipadapter";
    if (text.includes("upscale")) return "upscaler";
    if (text.includes("hyper")) return "hypernetwork";
    if (text.includes("motion")) return "motion";
    if (text.includes("refiner")) return "refiner";
    if (text.includes("vision")) return "vision_encoder";
    if (text.includes("clip") || text.includes("encoder")) return "clip";
    if (text.includes("unet") || text.includes("diffusion")) return "unet";
    if (text.includes("checkpoint") || text.includes("model")) return "checkpoint";
    return "other";
  }

  function normalizeHashes(value, hashValue = "") {
    const hashes = {};
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, item] of Object.entries(value)) {
        const normalized = normalizeHash(item);
        if (normalized) {
          const compact = key.toLowerCase().replace(/[^a-z0-9]/g, "");
          const canonicalKey = {
            sha256: "SHA256",
            blake3: "BLAKE3",
            autov1: "AutoV1",
            autov2: "AutoV2",
            autov3: "AutoV3",
            crc32: "CRC32"
          }[compact] || key;
          hashes[canonicalKey] = normalized;
        }
      }
    }
    const single = normalizeHash(hashValue);
    if (single) {
      const key = single.length === 64 ? "SHA256" : single.length === 10 ? "AutoV2" : single.length === 12 ? "AutoV3" : "hash";
      hashes[key] ||= single;
    }
    return hashes;
  }

  function looksLikeResourceFilename(value) {
    return /\.(?:safetensors|gguf|ckpt|pt|pth|bin|onnx)$/iu.test(String(value || "").trim());
  }

  function normalizeResource(item, source = "unknown") {
    if (!item || typeof item !== "object") return null;
    const identity = item.identity && typeof item.identity === "object" && !Array.isArray(item.identity)
      ? item.identity
      : {};
    const structuredAir = item.air && typeof item.air === "object" ? item.air : null;
    const airValue = item.canonicalAir
      || (typeof item.air === "string" ? item.air : "")
      || structuredAir?.canonical
      || structuredAir?.raw
      || identity.canonicalAir
      || identity.rawAir
      || identity.urn
      || (typeof item.urn === "string" ? item.urn : "")
      || item.rawAir
      || "";
    const parsedAir = parseAir(airValue);
    const airCivitai = parsedAir.valid && parsedAir.source === "civitai";
    const modelId = positiveIdOrNull(
      item.modelId
      ?? item.civitaiModelId
      ?? structuredAir?.modelId
      ?? identity.modelId
      ?? (identity.airSource === "civitai" ? identity.id : null)
      ?? (airCivitai ? parsedAir.id : null)
    );
    const modelVersionId = positiveIdOrNull(
      item.modelVersionId
      ?? item.civitaiModelVersionId
      ?? item.versionId
      ?? structuredAir?.modelVersionId
      ?? identity.modelVersionId
      ?? identity.version
      ?? (airCivitai ? parsedAir.version : null)
    );
    const type = sanitizeText(identity.type || item.modelType || item.type || "Other", 80);
    const roleHint = item.role
      || identity.role
      || (type.toLowerCase() === "other" ? parsedAir.type : item.type)
      || parsedAir.type;
    const role = normalizeRole(roleHint, parsedAir.type || type);
    const localFilename = sanitizeText(item.filename || item.selectedValue || "", 2048);
    const rawName = sanitizeText(
      item.modelName
      || identity.modelName
      || item.name
      || localFilename
      || "Unidentified resource",
      512
    );
    const name = looksLikeResourceFilename(rawName) ? Studio.util.basename(rawName) : rawName;
    const filenameSource = localFilename || (looksLikeResourceFilename(name) ? name : "");
    const filename = filenameSource ? Studio.util.basename(filenameSource) : "";
    const hashes = {
      ...normalizeHashes(identity.hashes),
      ...normalizeHashes(item.hashes, item.hash || item.modelHash || "")
    };
    const identityCreator = typeof identity.creator === "object"
      ? identity.creator?.username
      : identity.creator;
    const evidence = item.evidence
      || [item.nodeClass, item.detectionRuleId].filter(Boolean).join(" · ")
      || source;
    return {
      key: randomId("resource"),
      name,
      filename,
      versionName: sanitizeText(item.modelVersionName || item.versionName || identity.modelVersionName || "", 512),
      baseModel: sanitizeText(item.baseModel || identity.baseModel || "", 160),
      role,
      type,
      rawAir: parsedAir.rawAir,
      canonicalAir: parsedAir.canonicalAir,
      airWarning: parsedAir.warning || "",
      modelId,
      modelVersionId,
      fileId: positiveIdOrNull(item.fileId ?? identity.fileId ?? (airCivitai ? parsedAir.fileId : null)),
      fileType: Studio.civitaiContract?.normalizeModelFileType(item.fileType ?? identity.fileType) || "",
      filePrimary: typeof (item.filePrimary ?? identity.filePrimary) === "boolean"
        ? Boolean(item.filePrimary ?? identity.filePrimary)
        : null,
      format: Studio.civitaiContract?.normalizeModelFileFormat(
        item.format ?? identity.format ?? parsedAir.format
      ) || "",
      hashes,
      weight: numberOrNull(
        item.weight
        ?? item.strength
        ?? item.strengthModel
        ?? item.strengths?.weight
        ?? item.strengths?.model
      ),
      identitySource: sanitizeText(item.identitySource || item.resolutionSource || source, 80),
      verification: item.verification || (source === "api_exact" ? "verified" : "claimed"),
      evidence: sanitizeText(evidence, 512),
      trainedWords: Array.isArray(item.trainedWords || identity.trainedWords)
        ? (item.trainedWords || identity.trainedWords).map((word) => sanitizeText(word, 512))
        : [],
      creator: sanitizeText(item.creator || identityCreator || "", 512),
      license: sanitizeText(item.license || identity.license || "", 512),
      sourceUrl: sanitizeText(item.sourceUrl || identity.sourceUrl || "", 2048),
      identityScope: sanitizeText(item.identityScope || "", 40) || null,
      parserFacing: typeof item.parserFacing === "boolean" ? item.parserFacing : null,
      parserExclusionReason: sanitizeText(item.parserExclusionReason || "", 80) || null,
      lookupDiagnostics: item.lookupDiagnostics && typeof item.lookupDiagnostics === "object"
        ? clone(item.lookupDiagnostics)
        : null,
      removed: false
    };
  }

  function roleFamily(role) {
    if (["checkpoint", "unet", "refiner"].includes(role)) return "model";
    return role || "other";
  }

  function comparableFilename(resource) {
    const value = resource.filename || (looksLikeResourceFilename(resource.name) ? resource.name : "");
    if (!value || String(value).trim().toLowerCase() === "unnamed") return "";
    return Studio.util.basename(value).trim().toLowerCase();
  }

  function comparableName(resource) {
    const value = sanitizeText(resource.name || "", 512).trim().toLowerCase();
    return ["", "unnamed", "primary model", "vae", "new resource", "unidentified resource"].includes(value)
      ? ""
      : value;
  }

  function comparableStem(resource) {
    const value = comparableFilename(resource) || comparableName(resource);
    if (!value) return "";
    return Studio.util.basename(value)
      .trim()
      .toLowerCase()
      .replace(/\.(?:safetensors|gguf|ckpt|pt|pth|bin|onnx)$/iu, "");
  }

  function hashAliases(resource) {
    const aliases = new Set();
    for (const [algorithm, raw] of Object.entries(resource.hashes || {})) {
      const hash = normalizeHash(raw);
      if (!hash) continue;
      const compact = algorithm.toLowerCase().replace(/[^a-z0-9]/gu, "");
      aliases.add(`${compact}:${hash}`);
      if (compact === "sha256" && hash.length === 64) aliases.add(`autov2:${hash.slice(0, 10)}`);
      if (compact === "autov2" && hash.length === 10) aliases.add(`autov2:${hash}`);
    }
    return aliases;
  }

  function resourcesConflict(left, right) {
    if (
      roleFamily(left.role) === "lora"
      && roleFamily(right.role) === "lora"
      && Number.isFinite(left.weight)
      && Number.isFinite(right.weight)
      && Number(left.weight) !== Number(right.weight)
    ) return true;
    if (left.modelId && right.modelId && Number(left.modelId) !== Number(right.modelId)) return true;
    if (
      left.modelVersionId
      && right.modelVersionId
      && Number(left.modelVersionId) !== Number(right.modelVersionId)
    ) return true;
    if (
      left.canonicalAir
      && right.canonicalAir
      && left.canonicalAir.toLowerCase() !== right.canonicalAir.toLowerCase()
    ) return true;
    if (left.fileId && right.fileId && Number(left.fileId) !== Number(right.fileId)) return true;
    for (const [algorithm, value] of Object.entries(left.hashes || {})) {
      const other = normalizeHash(right.hashes?.[algorithm]);
      const current = normalizeHash(value);
      if (current && other && current !== other) return true;
    }
    const leftSha = normalizeHash(left.hashes?.SHA256);
    const rightSha = normalizeHash(right.hashes?.SHA256);
    const leftAutoV2 = normalizeHash(left.hashes?.AutoV2);
    const rightAutoV2 = normalizeHash(right.hashes?.AutoV2);
    if (leftSha && rightAutoV2 && leftSha.slice(0, 10) !== rightAutoV2) return true;
    if (rightSha && leftAutoV2 && rightSha.slice(0, 10) !== leftAutoV2) return true;
    return false;
  }

  function resourcesOverlap(left, right) {
    if (resourcesConflict(left, right)) return false;
    if (
      left.canonicalAir
      && right.canonicalAir
      && left.canonicalAir.toLowerCase() === right.canonicalAir.toLowerCase()
    ) return true;
    if (
      left.modelVersionId
      && right.modelVersionId
      && Number(left.modelVersionId) === Number(right.modelVersionId)
    ) return true;
    if (left.fileId && right.fileId && Number(left.fileId) === Number(right.fileId)) return true;
    const leftHashes = hashAliases(left);
    if ([...hashAliases(right)].some((alias) => leftHashes.has(alias))) return true;

    const leftFilename = comparableFilename(left);
    const rightFilename = comparableFilename(right);
    const compatibleRole = roleFamily(left.role) === roleFamily(right.role)
      || left.role === "other"
      || right.role === "other";
    if (leftFilename && leftFilename === rightFilename && compatibleRole) return true;

    const leftName = comparableName(left);
    const rightName = comparableName(right);
    if (leftName && leftName === rightName && compatibleRole) return true;
    const leftStem = comparableStem(left);
    const rightStem = comparableStem(right);
    return Boolean(leftStem && leftStem === rightStem && compatibleRole);
  }

  function identityStrength(resource) {
    const source = {
      manual: 100,
      api_exact: 95,
      imported: 85,
      local_identity_cache: 80,
      workflow_declared: 75,
      comfy_active: 70,
      civitai_manifest: 50,
      a1111: 40,
      prompt_name: 20,
      unknown: 0
    }[resource.identitySource] ?? (SOURCE_PRIORITY[resource.identitySource] || 0);
    const selectedHash = selectHash(resource.hashes);
    const hashIndex = Studio.constants.HASH_PRIORITY.indexOf(selectedHash.algorithm);
    const hashStrength = selectedHash.value
      ? selectedHash.algorithm === "hash"
        ? 300
        : 1200 - Math.max(0, hashIndex) * 150
      : 0;
    const exact = resource.verification === "verified"
      ? 2000
      : resource.modelVersionId || resource.canonicalAir
        ? 1500
        : resource.fileId
          ? 1400
          : hashStrength;
    return exact + source;
  }

  function mergeEvidence(left, right) {
    return [...new Set(
      [left, right]
        .flatMap((value) => String(value || "").split(/\s*;\s*/u))
        .map((value) => value.trim())
        .filter(Boolean)
    )].join("; ");
  }

  function mergeResourceInto(existing, resource) {
    const incomingStronger = identityStrength(resource) > identityStrength(existing);
    for (const key of [
      "name",
      "filename",
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
      "weight",
      "type",
      "role",
      "creator",
      "license",
      "sourceUrl"
    ]) {
      if (!isPresent(existing[key]) && isPresent(resource[key])) existing[key] = resource[key];
    }
    if (incomingStronger) {
      for (const key of ["name", "filename", "versionName", "baseModel", "type", "role", "creator", "license", "sourceUrl"]) {
        if (isPresent(resource[key])) existing[key] = resource[key];
      }
    }
    if (!comparableName(existing) && comparableName(resource)) existing.name = resource.name;
    existing.hashes = { ...existing.hashes, ...resource.hashes };
    existing.trainedWords = [...new Set([...(existing.trainedWords || []), ...(resource.trainedWords || [])])];
    if (resource.lookupDiagnostics) existing.lookupDiagnostics = clone(resource.lookupDiagnostics);
    const verificationRank = { verified: 5, conflict: 4, error: 3, claimed: 2, unresolved: 1 };
    if ((verificationRank[resource.verification] || 0) > (verificationRank[existing.verification] || 0)) {
      existing.verification = resource.verification;
      existing.verificationMessage = resource.verificationMessage;
      existing.apiReference = resource.apiReference;
      existing.apiCandidate = resource.apiCandidate;
    }
    const existingHasExactIdentity = Boolean(
      existing.modelVersionId
      || existing.canonicalAir
      || Object.keys(existing.hashes || {}).length
    );
    if (
      incomingStronger
      || (
        !existingHasExactIdentity
        && ["a1111", "civitai_manifest"].includes(existing.identitySource)
        && resource.identitySource
        && !["a1111", "civitai_manifest"].includes(resource.identitySource)
      )
    ) {
      existing.identitySource = resource.identitySource;
    }
    existing.evidence = mergeEvidence(existing.evidence, resource.evidence);
    return existing;
  }

  function mergeResources(resources) {
    const merged = [];
    for (const raw of resources) {
      const resource = raw?.key ? raw : normalizeResource(raw, raw?.identitySource);
      if (!resource) continue;
      let targetIndex = merged.findIndex((existing) => resourcesOverlap(existing, resource));
      if (targetIndex < 0) {
        merged.push(resource);
        continue;
      }
      mergeResourceInto(merged[targetIndex], resource);
      for (let index = 0; index < merged.length; index += 1) {
        if (index === targetIndex || !resourcesOverlap(merged[targetIndex], merged[index])) continue;
        mergeResourceInto(merged[targetIndex], merged[index]);
        merged.splice(index, 1);
        if (index < targetIndex) targetIndex -= 1;
        index -= 1;
      }
    }
    return merged;
  }

  function activeManifestResource(resource) {
    if (!resource || typeof resource !== "object") return false;
    if (resource.active === false || resource.enabled === false || resource.disabled === true) return false;
    if ([2, 4].includes(Number(resource.mode))) return false;
    const status = String(resource.status || resource.state || "").trim().toLowerCase();
    return !["inactive", "disabled", "bypassed", "muted", "never"].includes(status);
  }

  function manifestParts(manifest) {
    if (!manifest || typeof manifest !== "object") return { fields: {}, resources: [] };
    const generation = manifest.generation || manifest.generationSettings || manifest.meta || manifest.civitaiMediaMeta || manifest;
    const prompt = manifest.prompt && typeof manifest.prompt === "object" ? manifest.prompt : {};
    const fields = {
      positivePrompt: prompt.positive ?? generation.positivePrompt ?? generation.prompt ?? (typeof manifest.prompt === "string" ? manifest.prompt : null),
      negativePrompt: prompt.negative ?? generation.negativePrompt,
      steps: integerOrNull(generation.steps),
      seed: isPresent(generation.seed) ? String(generation.seed) : null,
      sampler: generation.sampler ?? generation.samplerName,
      scheduler: generation.scheduler ?? generation.scheduleType,
      cfgScale: numberOrNull(generation.cfgScale ?? generation.cfg_scale ?? generation.cfg),
      guidance: numberOrNull(generation.guidance ?? generation.fluxGuidance),
      denoise: numberOrNull(generation.denoise ?? generation.denoisingStrength),
      clipSkip: integerOrNull(generation.clipSkip),
      width: integerOrNull(generation.width ?? generation.aspectRatio?.width),
      height: integerOrNull(generation.height ?? generation.aspectRatio?.height),
      modelName: generation.model ?? generation.modelName,
      modelHash: generation.modelHash,
      vaeName: generation.vae ?? generation.vaeName,
      vaeHash: generation.vaeHash
    };
    const resources = [
      ...(Array.isArray(manifest.resources) ? manifest.resources.filter(activeManifestResource) : []),
      ...(Array.isArray(manifest.civitaiResources) ? manifest.civitaiResources.filter(activeManifestResource) : []),
      ...(generation !== manifest && Array.isArray(generation.resources) ? generation.resources.filter(activeManifestResource) : []),
      ...(generation !== manifest && Array.isArray(generation.civitaiResources) ? generation.civitaiResources.filter(activeManifestResource) : [])
    ];
    return { fields, resources };
  }

  function chooseFields(candidates) {
    const fields = {};
    const conflicts = [];
    for (const definition of GENERATION_FIELDS) {
      const options = (candidates[definition.key] || []).slice().sort((left, right) =>
        (SOURCE_PRIORITY[right.source] || 0) - (SOURCE_PRIORITY[left.source] || 0)
      );
      const chosen = options[0] || fieldValue("", "unknown", "Not detected", "unknown");
      fields[definition.key] = clone(chosen);
      const alternatives = options.filter((option) => !sameValue(option.value, chosen.value));
      if (alternatives.length) {
        conflicts.push({
          id: randomId("conflict"),
          field: definition.key,
          label: definition.label,
          chosen: clone(chosen),
          alternatives: clone(alternatives),
          resolved: false
        });
      }
    }
    return { fields, conflicts };
  }

  function formatInspector(file, head) {
    const bytes = head instanceof Uint8Array ? head : new Uint8Array(head);
    if (bytes.length >= 8 && Studio.binary.equals(bytes, Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10))) return Studio.png;
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) return Studio.jpeg;
    if (bytes.length >= 12 && Studio.binary.equals(bytes, "RIFF") && Studio.binary.equals(bytes, "WEBP", 8)) return Studio.webp;
    return null;
  }

  async function inspectFile(file) {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const format = formatInspector(file, head);
    if (!format) throw new Error("Unsupported image format. Open a PNG, JPEG, or WebP image.");
    return format.inspect(file);
  }

  async function createRecord(file, inspection) {
    const candidates = {};
    addCandidate(candidates, "width", inspection.width, "image_header", `${inspection.format.toUpperCase()} image header`, "exact");
    addCandidate(candidates, "height", inspection.height, "image_header", `${inspection.format.toUpperCase()} image header`, "exact");
    if (inspection.a1111) {
      for (const [key, value] of Object.entries(inspection.a1111.fields || {})) {
        addCandidate(candidates, key, value, "a1111", "A1111 parameters / EXIF UserComment");
      }
    }
    const resources = [];
    resources.push(...(inspection.a1111?.resources || []).map((resource) => normalizeResource(resource, "a1111")).filter(Boolean));
    for (const manifest of inspection.manifests || []) {
      const parts = manifestParts(manifest);
      for (const [key, value] of Object.entries(parts.fields)) addCandidate(candidates, key, value, "civitai_manifest", "Structured Civitai metadata");
      resources.push(...parts.resources.map((resource) => normalizeResource(resource, "civitai_manifest")).filter(Boolean));
    }
    if (inspection.promptJson) {
      const scan = Studio.comfy.scan(inspection.promptJson);
      for (const [key, value] of Object.entries(scan.fields)) addCandidate(candidates, key, value, "comfy_active", "Active upstream ComfyUI graph");
      resources.push(...scan.resources.map((resource) => normalizeResource(resource, "comfy_active")).filter(Boolean));
      inspection.warnings.push(...scan.warnings);
    }

    const selected = chooseFields(candidates);
    const primaryName = selected.fields.modelName.value;
    const primaryHash = selected.fields.modelHash.value;
    if (primaryName || primaryHash) {
      resources.push(normalizeResource({
        name: primaryName || "Primary model",
        role: "checkpoint",
        type: "Checkpoint",
        hash: primaryHash,
        identitySource: "a1111",
        evidence: "Primary model fields"
      }, "a1111"));
    }
    const vaeName = selected.fields.vaeName.value;
    const vaeHash = selected.fields.vaeHash.value;
    if (vaeName || vaeHash) {
      resources.push(normalizeResource({
        name: vaeName || "VAE",
        role: "vae",
        type: "VAE",
        hash: vaeHash,
        identitySource: "a1111",
        evidence: "VAE fields"
      }, "a1111"));
    }
    const metadataSelections = Object.fromEntries(
      (inspection.metadataItems || []).map((item) => [item.id, Boolean(item.preserve)])
    );
    const record = {
      schema: SCHEMA,
      schemaVersion: 1,
      id: randomId("image"),
      file,
      fileName: Studio.util.basename(file.name),
      format: inspection.format,
      mime: inspection.mime,
      size: file.size,
      dimensions: { width: inspection.width, height: inspection.height },
      inspection,
      fields: selected.fields,
      resources: mergeResources(resources.filter(Boolean)),
      conflicts: selected.conflicts,
      warnings: [...new Set(inspection.warnings || [])],
      metadataSelections,
      verification: { status: "unverified", checked: 0, verified: 0, unresolved: 0, errors: [] },
      dirty: false,
      state: "ready"
    };
    record.original = {
      fields: clone(record.fields),
      resources: clone(record.resources),
      metadataSelections: clone(record.metadataSelections)
    };
    return record;
  }

  function setField(record, key, value) {
    if (!record.fields[key]) return;
    record.fields[key] = fieldValue(value, "manual", "Edited in Civitai Metadata Studio", "manual");
    record.fields[key].edited = true;
    record.dirty = true;
    for (const conflict of record.conflicts) {
      if (conflict.field === key) conflict.resolved = true;
    }
  }

  function addFieldEvidence(record, key, value, source, evidence = "", confidence = "claimed") {
    if (!record?.fields?.[key] || !isPresent(value)) return { status: "ignored" };
    const candidate = fieldValue(value, source, evidence, confidence);
    const chosen = record.fields[key];
    if (!isPresent(chosen.value)) {
      record.fields[key] = candidate;
      record.dirty = true;
      return { status: "imported" };
    }
    if (sameValue(chosen.value, value)) return { status: "matched" };
    let conflict = record.conflicts.find((item) => item.field === key && !item.resolved);
    if (!conflict) {
      const definition = GENERATION_FIELDS.find((field) => field.key === key);
      conflict = {
        id: randomId("conflict"),
        field: key,
        label: definition?.label || key,
        chosen: clone(chosen),
        alternatives: [],
        resolved: false
      };
      record.conflicts.push(conflict);
    }
    if (!conflict.alternatives.some((option) =>
      option.source === source && sameValue(option.value, value)
    )) {
      conflict.alternatives.push(candidate);
    }
    return { status: "conflict" };
  }

  function reset(record) {
    record.fields = clone(record.original.fields);
    record.resources = clone(record.original.resources);
    record.metadataSelections = clone(record.original.metadataSelections);
    record.conflicts.forEach((conflict) => { conflict.resolved = false; });
    record.dirty = false;
    record.verification = { status: "unverified", checked: 0, verified: 0, unresolved: 0, errors: [] };
    return record;
  }

  function diff(record) {
    const rows = [];
    for (const definition of GENERATION_FIELDS) {
      const before = record.original.fields[definition.key]?.value ?? "";
      const after = record.fields[definition.key]?.value ?? "";
      if (!sameValue(before, after)) rows.push({ label: definition.label, before, after });
    }
    const beforeResources = stableStringify(record.original.resources.map(resourceProjectionForDiff), 0);
    const afterResources = stableStringify(record.resources.filter((item) => !item.removed).map(resourceProjectionForDiff), 0);
    if (beforeResources !== afterResources) rows.push({ label: "Resources", before: `${record.original.resources.length} entries`, after: `${record.resources.filter((item) => !item.removed).length} entries` });
    const beforePreserved = Object.values(record.original.metadataSelections).filter(Boolean).length;
    const afterPreserved = Object.values(record.metadataSelections).filter(Boolean).length;
    if (beforePreserved !== afterPreserved) rows.push({ label: "Other metadata", before: `${beforePreserved} preserved`, after: `${afterPreserved} preserved` });
    return rows;
  }

  function resourceProjectionForDiff(resource) {
    return {
      name: resource.name,
      role: resource.role,
      type: resource.type,
      canonicalAir: resource.canonicalAir,
      modelId: resource.modelId,
      modelVersionId: resource.modelVersionId,
      baseModel: resource.baseModel,
      hashes: resource.hashes,
      fileId: resource.fileId,
      fileType: resource.fileType,
      filePrimary: resource.filePrimary,
      format: resource.format,
      weight: resource.weight,
      removed: resource.removed
    };
  }

  function buildManifest(record) {
    const valueOf = (key) => record.fields[key]?.value ?? null;
    const generation = {};
    for (const key of ["steps", "seed", "sampler", "scheduler", "cfgScale", "guidance", "denoise", "clipSkip", "width", "height", "modelName", "modelHash", "vaeName", "vaeHash"]) {
      const value = valueOf(key);
      if (isPresent(value)) generation[key] = value;
    }
    const activeResources = record.resources.filter((resource) => !resource.removed);
    const resources = activeResources.map((resource) => {
      const decision = Studio.civitaiContract.parserResourceDecision(resource);
      const item = {
        name: resource.name,
        role: resource.role,
        type: resource.type,
        verification: resource.verification,
        identitySource: resource.identitySource,
        identityScope: decision.identityScope,
        parserFacing: decision.parserFacing,
        parserExclusionReason: decision.reason
      };
      for (const key of [
        "filename",
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
        "weight",
        "sourceUrl"
      ]) {
        if (isPresent(resource[key])) item[key] = resource[key];
      }
      if (Object.keys(resource.hashes || {}).length) item.hashes = resource.hashes;
      if (resource.lookupDiagnostics) item.lookupDiagnostics = clone(resource.lookupDiagnostics);
      return item;
    });
    const civitaiResources = Studio.civitaiContract.parserResourceItems(activeResources);
    const unresolvedResources = resources
      .filter((item) => !item.parserFacing)
      .map((item) => ({
        name: item.name,
        role: item.role,
        verification: item.verification,
        reason: item.parserExclusionReason
      }));
    return {
      schemaName: "civitai-metadata-studio",
      schemaVersion: 1,
      generator: {
        name: Studio.constants.APP_NAME,
        version: Studio.constants.APP_VERSION,
        processing: "local-browser"
      },
      prompt: {
        positive: valueOf("positivePrompt") || "",
        negative: valueOf("negativePrompt") || ""
      },
      generation,
      resources,
      civitaiResources,
      unresolvedResources,
      verification: {
        status: record.verification.status,
        checked: record.verification.checked,
        verified: record.verification.verified,
        unresolved: record.verification.unresolved
      }
    };
  }

  function buildExport(record) {
    const manifest = buildManifest(record);
    const selections = record.metadataSelections;
    const exifBytes = Studio.exif.build(record, {
      original: record.inspection.exif,
      selections
    });
    return {
      record,
      selections,
      manifest,
      manifestText: stableStringify(manifest, 0),
      exifBytes
    };
  }

  function validate(record) {
    const errors = [];
    const valueOf = (key) => record.fields[key]?.value;
    for (const key of ["steps", "clipSkip"]) {
      const value = valueOf(key);
      if (isPresent(value) && (!Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
        errors.push(`${record.fields[key]?.evidence || key}: ${key} must be a non-negative whole number.`);
      }
    }
    for (const key of ["width", "height"]) {
      const value = valueOf(key);
      if (isPresent(value) && (!Number.isSafeInteger(Number(value)) || Number(value) < 1)) {
        errors.push(`${key} must be a positive whole number.`);
      }
    }
    const seed = valueOf("seed");
    if (isPresent(seed) && !/^-?\d+$/.test(String(seed).trim())) errors.push("Seed must contain only an optional minus sign and digits.");
    for (const key of ["cfgScale", "guidance", "denoise"]) {
      const value = valueOf(key);
      if (isPresent(value) && (!Number.isFinite(Number(value)) || Number(value) < 0)) errors.push(`${key} must be a non-negative number.`);
    }
    if (isPresent(valueOf("denoise")) && Number(valueOf("denoise")) > 1) errors.push("Denoising strength must be between 0 and 1.");
    for (const key of ["modelHash", "vaeHash"]) {
      const value = normalizeHash(valueOf(key));
      if (value && ![8, 10, 12, 64].includes(value.length)) errors.push(`${key} must be a supported 8, 10, 12, or 64 character hexadecimal hash.`);
      if (value && !/^[A-F0-9]+$/.test(value)) errors.push(`${key} contains non-hexadecimal characters.`);
    }
    for (const resource of record.resources.filter((item) => !item.removed)) {
      for (const [algorithm, value] of Object.entries(resource.hashes || {})) {
        const expected = Studio.constants.HASH_LENGTHS[algorithm];
        if (!/^[A-F0-9]+$/.test(normalizeHash(value)) || (expected && normalizeHash(value).length !== expected)) {
          errors.push(`${resource.name}: ${algorithm} is malformed.`);
        }
      }
    }
    return [...new Set(errors)];
  }

  function rewrite(record) {
    const errors = validate(record);
    if (errors.length) throw new Error(errors.join(" "));
    const payload = buildExport(record);
    const handler = Studio[record.format];
    if (!handler?.rewrite) throw new Error(`No writer is available for ${record.format}.`);
    return handler.rewrite(record.file, record.inspection, payload);
  }

  Studio.canonical = Object.freeze({
    addFieldEvidence,
    buildExport,
    buildManifest,
    createRecord,
    diff,
    inspectFile,
    manifestParts,
    mergeResources,
    normalizeResource,
    reset,
    rewrite,
    setField,
    validate
  });
})();
