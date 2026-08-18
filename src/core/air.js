(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { positiveIdOrNull, sanitizeText } = Studio.util;
  const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._-]*$/iu;
  const FORMAT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/iu;

  function unsafeText(value) {
    return /[\s\u0000-\u001F\u007F]/u.test(value);
  }

  function splitBody(raw) {
    let body = raw;
    if (body.toLowerCase().startsWith("urn:air:")) body = body.slice(8);
    else if (body.toLowerCase().startsWith("air:")) body = body.slice(4);
    else if (body.toLowerCase().startsWith("urn:")) return null;
    const parts = body.split(":");
    if (parts.length < 4) return null;
    const head = parts.splice(0, 3);
    const identifier = parts.join(":");
    return head.every(Boolean) && identifier ? [...head, identifier] : null;
  }

  function splitOptionalFormat(value) {
    const index = value.lastIndexOf(".");
    if (index <= 0) return { value, format: null };
    const format = value.slice(index + 1);
    return FORMAT_PATTERN.test(format)
      ? { value: value.slice(0, index), format: format.toLowerCase() }
      : { value, format: null };
  }

  function parseIdentifier(source, value) {
    if (!value || (value.match(/@/gu) || []).length > 1 || (value.match(/\+/gu) || []).length > 1) return null;
    const plus = value.indexOf("+");
    const beforeFile = plus >= 0 ? value.slice(0, plus) : value;
    const rawFile = plus >= 0 ? value.slice(plus + 1) : null;
    const at = beforeFile.indexOf("@");
    const identityId = at >= 0 ? beforeFile.slice(0, at) : beforeFile;
    let identityVersion = at >= 0 ? beforeFile.slice(at + 1) : null;
    if (!identityId || (at >= 0 && !identityVersion) || rawFile === "") return null;
    let fileId = rawFile;
    let format = null;
    if (rawFile !== null) {
      const split = splitOptionalFormat(rawFile);
      fileId = split.value;
      format = split.format;
      if (!fileId) return null;
    } else if (identityVersion && ["civitai", "civitai-r2"].includes(source)) {
      const split = splitOptionalFormat(identityVersion);
      identityVersion = split.value;
      format = split.format;
    }
    if ([identityId, identityVersion || "", fileId || ""].some(unsafeText)) return null;
    if (identityId.includes("@") || identityId.includes("+")) return null;
    return { identityId, identityVersion, fileId, format };
  }

  function canonicalAir(ecosystem, type, source, identifier) {
    let tail = identifier.identityId;
    if (identifier.identityVersion) tail += `@${identifier.identityVersion}`;
    if (identifier.fileId) tail += `+${identifier.fileId}`;
    if (identifier.format) tail += `.${identifier.format}`;
    return `urn:air:${ecosystem}:${type}:${source}:${tail}`;
  }

  function parseAir(value) {
    const rawAir = sanitizeText(value, 512).trim();
    if (!rawAir) return { rawAir: "", canonicalAir: null, valid: false, warning: null };
    if (rawAir.length > 4096 || unsafeText(rawAir)) {
      return {
        rawAir,
        canonicalAir: null,
        valid: false,
        warning: "AIR contains unsafe characters or exceeds the local safety limit. The original value is preserved."
      };
    }
    const fields = splitBody(rawAir);
    if (!fields) {
      return {
        rawAir,
        canonicalAir: null,
        valid: false,
        warning: "AIR is malformed. The original value is preserved, but no identity was inferred."
      };
    }
    const [ecosystemText, typeText, sourceText, identifierText] = fields;
    const ecosystem = ecosystemText.toLowerCase();
    const type = typeText.toLowerCase();
    const source = sourceText.toLowerCase();
    if (![ecosystem, type, source].every((part) => SEGMENT_PATTERN.test(part))) {
      return {
        rawAir,
        canonicalAir: null,
        valid: false,
        warning: "AIR contains a malformed ecosystem, type, or source segment."
      };
    }
    const identifier = parseIdentifier(source, identifierText);
    if (!identifier) {
      return {
        rawAir,
        canonicalAir: null,
        valid: false,
        warning: "AIR contains a malformed identity or file qualifier."
      };
    }
    const id = source === "civitai" ? positiveIdOrNull(identifier.identityId) : null;
    const version = source === "civitai" ? positiveIdOrNull(identifier.identityVersion) : null;
    if (source === "civitai" && (!id || (identifier.identityVersion && !version))) {
      return {
        rawAir,
        canonicalAir: null,
        valid: false,
        warning: "Civitai AIR model and version identifiers must be positive integers."
      };
    }
    return {
      rawAir,
      canonicalAir: canonicalAir(ecosystem, type, source, identifier),
      valid: true,
      ecosystem,
      type,
      source,
      id,
      version,
      identityId: identifier.identityId,
      identityVersion: identifier.identityVersion,
      fileId: identifier.fileId,
      format: identifier.format
    };
  }

  function buildAir({ ecosystem, type, source = "civitai", modelId, modelVersionId, identityId, identityVersion, fileId, format }) {
    const cleanEcosystem = sanitizeText(ecosystem, 80).trim().toLowerCase();
    const cleanType = sanitizeText(type, 80).trim().toLowerCase();
    const cleanSource = sanitizeText(source, 80).trim().toLowerCase();
    const id = cleanSource === "civitai"
      ? String(positiveIdOrNull(modelId) || "")
      : sanitizeText(identityId || modelId || "", 512).trim();
    const version = cleanSource === "civitai"
      ? String(positiveIdOrNull(modelVersionId) || "")
      : sanitizeText(identityVersion || modelVersionId || "", 512).trim();
    const cleanFileId = sanitizeText(fileId || "", 512).trim();
    const cleanFormat = Studio.civitaiContract?.normalizeModelFileFormat(format)
      || sanitizeText(format || "", 40).trim().toLowerCase();
    if (!cleanEcosystem || !cleanType || !cleanSource || !id) return null;
    if (![cleanEcosystem, cleanType, cleanSource].every((part) => /^[a-z0-9][a-z0-9._-]*$/.test(part))) {
      return null;
    }
    if ([id, version, cleanFileId, cleanFormat].some(unsafeText)) return null;
    return canonicalAir(cleanEcosystem, cleanType, cleanSource, {
      identityId: id,
      identityVersion: version || null,
      fileId: cleanFileId || null,
      format: cleanFormat && FORMAT_PATTERN.test(cleanFormat) ? cleanFormat : null
    });
  }

  function attachFile(value, { fileId, format, qualify = true } = {}) {
    const parsed = parseAir(value);
    if (!parsed.valid) return parsed;
    const cleanFileId = sanitizeText(fileId || "", 512).trim();
    const cleanFormat = Studio.civitaiContract?.normalizeModelFileFormat(format)
      || sanitizeText(format || "", 40).trim().toLowerCase();
    if (!cleanFileId || unsafeText(cleanFileId) || cleanFileId.includes("@") || cleanFileId.includes("+")) {
      return { ...parsed, valid: false, warning: "AIR file details are malformed." };
    }
    if (parsed.fileId && parsed.fileId !== cleanFileId) {
      return { ...parsed, valid: false, warning: "AIR file ID conflicts with the exact API file." };
    }
    if (parsed.format && cleanFormat && parsed.format !== cleanFormat) {
      return { ...parsed, valid: false, warning: "AIR file format conflicts with the exact API file." };
    }
    const canonical = qualify
      ? buildAir({
          ecosystem: parsed.ecosystem,
          type: parsed.type,
          source: parsed.source,
          modelId: parsed.id,
          modelVersionId: parsed.version,
          identityId: parsed.identityId,
          identityVersion: parsed.identityVersion,
          fileId: cleanFileId,
          format: parsed.format || cleanFormat
        })
      : parsed.canonicalAir;
    return {
      ...parsed,
      canonicalAir: canonical,
      fileId: cleanFileId,
      format: parsed.format || cleanFormat || null
    };
  }

  function parseCivitaiUrl(value) {
    const raw = sanitizeText(value, 2048).trim();
    if (!raw) return null;
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      if (host !== "civitai.com" && host !== "www.civitai.com" && host !== "civitai.red" && host !== "www.civitai.red") {
        return null;
      }
      const match = url.pathname.match(/^\/models\/(\d+)(?:\/|$)/);
      const modelId = match ? positiveIdOrNull(match[1]) : null;
      const modelVersionId = positiveIdOrNull(url.searchParams.get("modelVersionId"));
      if (!modelId && !modelVersionId) return null;
      return { modelId, modelVersionId, url: raw };
    } catch {
      return null;
    }
  }

  function civitaiResourceUrl(resource) {
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) return "";
    const parsedUrl = parseCivitaiUrl(resource.sourceUrl);
    const parsedAir = parseAir(resource.canonicalAir || resource.rawAir || "");
    const modelId = positiveIdOrNull(
      resource.modelId
      || parsedUrl?.modelId
      || (parsedAir.source === "civitai" ? parsedAir.id : null)
    );
    const modelVersionId = positiveIdOrNull(
      resource.modelVersionId
      || parsedUrl?.modelVersionId
      || (parsedAir.source === "civitai" ? parsedAir.version : null)
    );
    if (!modelId) return "";
    const url = new URL(`https://civitai.com/models/${modelId}`);
    if (modelVersionId) url.searchParams.set("modelVersionId", modelVersionId);
    return url.href;
  }

  Studio.air = Object.freeze({ attachFile, buildAir, civitaiResourceUrl, parseAir, parseCivitaiUrl });
})();
