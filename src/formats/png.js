(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { METADATA_VALUE_LIMIT } = Studio.constants;
  const { ascii, concatBytes, equals, findZero, putU32be, u32be } = Studio.binary;
  const { crc32 } = Studio.crc32;
  const {
    latin1Decode,
    latin1Encode,
    limitPreview,
    safeComfyJsonParse,
    safeJsonParse,
    sanitizeText,
    utf8Decode,
    utf8Encode
  } = Studio.util;

  const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const PIXEL_CHUNKS = new Set(["IDAT", "IEND", "PLTE", "tRNS", "acTL", "fcTL", "fdAT"]);
  const ESSENTIAL_CHUNKS = new Set(["IHDR", "IDAT", "IEND", "PLTE", "tRNS", "acTL", "fcTL", "fdAT"]);
  const SAFE_TECHNICAL = new Set([
    "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "acTL", "fcTL", "fdAT",
    "cHRM", "gAMA", "iCCP", "sRGB", "cICP", "mDCv", "cLLi", "sBIT", "pHYs", "bKGD"
  ]);
  const TEXT_TYPES = new Set(["tEXt", "zTXt", "iTXt"]);
  const CAPTURE_TYPES = new Set([...TEXT_TYPES, "IHDR", "eXIf"]);
  const GENERATION_KEYS = new Set(["parameters", "parameters_utf8", "civitai"]);
  const COMFY_KEYS = new Set(["prompt", "workflow"]);

  function chunkBytes(type, data) {
    const typeBytes = Uint8Array.from(type, (character) => character.charCodeAt(0));
    const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
    return concatBytes(putU32be(payload.length), typeBytes, payload, putU32be(crc32(concatBytes(typeBytes, payload))));
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream !== "function") throw new Error("This browser does not provide DecompressionStream.");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    const result = await new Response(stream).arrayBuffer();
    if (result.byteLength > METADATA_VALUE_LIMIT) throw new Error("Compressed metadata expands beyond the safety limit.");
    return new Uint8Array(result);
  }

  async function decodeTextChunk(type, data) {
    const zero = findZero(data);
    if (zero <= 0 || zero > 79) return { keyword: "", text: "", warning: "PNG text keyword is invalid." };
    const keyword = latin1Decode(data.subarray(0, zero));
    if (type === "tEXt") return { keyword, text: latin1Decode(data.subarray(zero + 1)), compressed: false };
    if (type === "zTXt") {
      if (data[zero + 1] !== 0) return { keyword, text: "", warning: "Unsupported PNG text compression method." };
      return { keyword, text: utf8Decode(await inflate(data.subarray(zero + 2))), compressed: true };
    }
    let position = zero + 1;
    const compressionFlag = data[position++];
    const compressionMethod = data[position++];
    const languageEnd = findZero(data, position);
    if (languageEnd < 0) return { keyword, text: "", warning: "PNG iTXt language field is truncated." };
    const language = latin1Decode(data.subarray(position, languageEnd));
    position = languageEnd + 1;
    const translatedEnd = findZero(data, position);
    if (translatedEnd < 0) return { keyword, text: "", warning: "PNG iTXt translated keyword is truncated." };
    const translatedKeyword = utf8Decode(data.subarray(position, translatedEnd));
    position = translatedEnd + 1;
    let textBytes = data.subarray(position);
    if (compressionFlag === 1) {
      if (compressionMethod !== 0) return { keyword, text: "", warning: "Unsupported PNG iTXt compression method." };
      textBytes = await inflate(textBytes);
    } else if (compressionFlag !== 0) {
      return { keyword, text: "", warning: "PNG iTXt has an invalid compression flag." };
    }
    return { keyword, text: utf8Decode(textBytes), language, translatedKeyword, compressed: compressionFlag === 1 };
  }

  function textChunk(type, keyword, value) {
    const key = latin1Encode(sanitizeText(keyword, 79)).bytes;
    if (type === "tEXt") {
      return chunkBytes("tEXt", concatBytes(key, Uint8Array.of(0), latin1Encode(value).bytes));
    }
    return chunkBytes(
      "iTXt",
      concatBytes(key, Uint8Array.of(0, 0, 0, 0, 0), utf8Encode(value))
    );
  }

  function technicalDescription(type, length) {
    const labels = {
      cHRM: "Chromaticities",
      gAMA: "Gamma",
      iCCP: "ICC color profile",
      sRGB: "sRGB rendering intent",
      cICP: "Coding-independent color parameters",
      mDCv: "Mastering display color volume",
      cLLi: "Content light level",
      sBIT: "Significant bits",
      pHYs: "Pixel density",
      bKGD: "Background color",
      PLTE: "Palette",
      tRNS: "Transparency",
      acTL: "Animation control",
      fcTL: "Animation frame control",
      fdAT: "Animation frame data"
    };
    return labels[type] || `${type} chunk (${length.toLocaleString()} bytes)`;
  }

  function metadataItemForChunk(chunk, textInfo = null) {
    if (textInfo) {
      const lower = textInfo.keyword.toLowerCase();
      const personal = ["author", "artist", "copyright", "creation time", "date", "title", "description", "comment"].some((key) => lower.includes(key));
      return {
        id: `png:${chunk.offset}`,
        carrier: chunk.type,
        label: textInfo.keyword || `${chunk.type} text`,
        value: limitPreview(textInfo.text, 300) || "(empty)",
        category: personal ? "personal" : "unknown",
        preserve: false,
        preserveSupported: true,
        storage: { kind: "png-chunk", offset: chunk.offset },
        reason: personal
          ? "Descriptive text can identify the creator or reveal private context."
          : "Unknown text is excluded until you explicitly preserve it."
      };
    }
    const safe = SAFE_TECHNICAL.has(chunk.type);
    const critical = /^[A-Z]/.test(chunk.type[0]);
    return {
      id: `png:${chunk.offset}`,
      carrier: "PNG",
      label: technicalDescription(chunk.type, chunk.length),
      value: `${chunk.type} · ${chunk.length.toLocaleString()} bytes`,
      category: safe || critical ? "technical" : "unknown",
      preserve: safe || critical,
      preserveSupported: !critical,
      storage: { kind: "png-chunk", offset: chunk.offset },
      reason: critical
        ? "Required critical PNG data is always copied."
        : safe
          ? ""
          : "Unknown private or ancillary chunks are removed by default."
    };
  }

  async function inspect(file) {
    if (file.size < 33) throw new Error("PNG file is too small.");
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (!equals(signature, SIGNATURE)) throw new Error("The file does not have a PNG signature.");

    const chunks = [];
    const carriers = [];
    const metadataItems = [];
    const warnings = [];
    const manifests = [];
    let promptJson = null;
    let workflowJson = null;
    let parametersText = "";
    let exifInfo = null;
    let width = null;
    let height = null;
    let bitDepth = null;
    let colorType = null;
    let animated = false;
    let offset = 8;
    let count = 0;

    while (offset + 12 <= file.size) {
      if (++count > 1_000_000) throw new Error("PNG contains an unreasonable number of chunks.");
      const header = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      const length = u32be(header, 0);
      const type = ascii(header, 4, 4);
      if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`Invalid PNG chunk type at byte ${offset}.`);
      const totalLength = length + 12;
      if (offset + totalLength > file.size) throw new Error(`${type} chunk extends beyond the end of the file.`);
      const chunk = { offset, length, totalLength, type, data: null, textInfo: null };
      if (CAPTURE_TYPES.has(type) && length <= METADATA_VALUE_LIMIT) {
        chunk.data = new Uint8Array(await file.slice(offset + 8, offset + 8 + length).arrayBuffer());
      } else if (CAPTURE_TYPES.has(type) && length > METADATA_VALUE_LIMIT && !PIXEL_CHUNKS.has(type)) {
        warnings.push(`${type} metadata was not decoded because it exceeds the ${Studio.util.formatBytes(METADATA_VALUE_LIMIT)} safety limit.`);
      }
      chunks.push(chunk);

      if (type === "IHDR" && chunk.data?.length >= 13) {
        width = u32be(chunk.data, 0);
        height = u32be(chunk.data, 4);
        bitDepth = chunk.data[8];
        colorType = chunk.data[9];
      } else if (type === "acTL") {
        animated = true;
      } else if (TEXT_TYPES.has(type) && chunk.data) {
        try {
          const info = await decodeTextChunk(type, chunk.data);
          chunk.textInfo = info;
          if (info.warning) warnings.push(info.warning);
          const lower = info.keyword.toLowerCase();
          if (lower === "parameters" || lower === "parameters_utf8") {
            if (!parametersText || lower === "parameters_utf8") parametersText = info.text;
            carriers.push({ name: `${type}:${info.keyword}`, value: info.text, kind: "generation" });
          } else if (lower === "prompt") {
            promptJson = safeComfyJsonParse(info.text);
            carriers.push({ name: `${type}:${info.keyword}`, value: info.text, kind: "workflow" });
          } else if (lower === "workflow") {
            workflowJson = safeComfyJsonParse(info.text);
            carriers.push({ name: `${type}:${info.keyword}`, value: info.text, kind: "workflow" });
          } else if (lower === "civitai") {
            const manifest = safeJsonParse(info.text);
            if (manifest) manifests.push(manifest);
            carriers.push({ name: `${type}:${info.keyword}`, value: info.text, kind: "generation" });
          } else if (lower === "software") {
            metadataItems.push({
              ...metadataItemForChunk(chunk, info),
              category: "provenance",
              preserve: false,
              preserveSupported: false,
              reason: `Replaced with ${Studio.constants.APP_NAME} provenance in the new copy.`
            });
            carriers.push({ name: `${type}:${info.keyword}`, value: info.text, kind: "other" });
          } else {
            metadataItems.push(metadataItemForChunk(chunk, info));
            carriers.push({ name: `${type}:${info.keyword}`, value: info.text, kind: "other" });
          }
        } catch (error) {
          warnings.push(`${type} metadata could not be decoded: ${error.message}`);
          metadataItems.push(metadataItemForChunk(chunk));
        }
      } else if (type === "eXIf" && chunk.data) {
        exifInfo = Studio.exif.parse(chunk.data);
        carriers.push({ name: "PNG eXIf UserComment", value: exifInfo.userComment, kind: "generation" });
        metadataItems.push(...exifInfo.items);
        warnings.push(...exifInfo.warnings);
      } else if (type !== "IHDR" && type !== "IEND" && !PIXEL_CHUNKS.has(type)) {
        metadataItems.push(metadataItemForChunk(chunk));
      }
      if (type === "IEND") {
        offset += totalLength;
        break;
      }
      offset += totalLength;
    }
    if (!chunks.some((chunk) => chunk.type === "IEND")) throw new Error("PNG is missing its IEND chunk.");
    if (offset !== file.size) warnings.push(`${(file.size - offset).toLocaleString()} trailing bytes follow the PNG IEND chunk; they are not copied.`);
    if (!parametersText && exifInfo?.userComment) parametersText = exifInfo.userComment;
    const a1111 = parametersText ? Studio.a1111.parse(parametersText) : null;
    const embeddedManifest = safeJsonParse(a1111?.rawSettings?.["Civitai metadata"]);
    if (embeddedManifest) manifests.push(embeddedManifest);

    return {
      format: "png",
      mime: "image/png",
      width,
      height,
      bitDepth,
      colorType,
      animated,
      hasAlpha: [4, 6].includes(colorType) || chunks.some((chunk) => chunk.type === "tRNS"),
      chunks,
      carriers,
      metadataItems,
      a1111,
      manifests,
      promptJson,
      workflowJson,
      exif: exifInfo,
      warnings
    };
  }

  function shouldKeepChunk(chunk, selections) {
    if (ESSENTIAL_CHUNKS.has(chunk.type)) return true;
    if (/^[A-Z]/.test(chunk.type[0])) return true;
    if (chunk.type === "eXIf") return false;
    if (TEXT_TYPES.has(chunk.type) && chunk.textInfo) {
      const lower = chunk.textInfo.keyword.toLowerCase();
      if (COMFY_KEYS.has(lower)) return true;
      if (GENERATION_KEYS.has(lower) || lower === "software") return false;
    }
    if (SAFE_TECHNICAL.has(chunk.type)) return selections?.[`png:${chunk.offset}`] !== false;
    return selections?.[`png:${chunk.offset}`] === true;
  }

  function rewrite(file, inspection, payload) {
    const parts = [SIGNATURE];
    let inserted = false;
    const parameters = Studio.a1111.build(payload.record);
    const parameterLatin = latin1Encode(parameters);
    const additions = [
      textChunk("tEXt", "parameters", parameters),
      ...(parameterLatin.lossy ? [textChunk("iTXt", "parameters_utf8", parameters)] : []),
      textChunk("tEXt", "Software", `${Studio.constants.APP_NAME} ${Studio.constants.APP_VERSION}`),
      textChunk("iTXt", "civitai", payload.manifestText),
      chunkBytes("eXIf", payload.exifBytes)
    ];

    for (const chunk of inspection.chunks) {
      if (!inserted && (chunk.type === "IDAT" || chunk.type === "fdAT" || chunk.type === "IEND")) {
        parts.push(...additions);
        inserted = true;
      }
      if (shouldKeepChunk(chunk, payload.selections)) {
        parts.push(file.slice(chunk.offset, chunk.offset + chunk.totalLength));
      }
    }
    if (!inserted) parts.push(...additions);
    return new Blob(parts, { type: "image/png" });
  }

  Studio.png = Object.freeze({ chunkBytes, decodeTextChunk, inspect, rewrite, textChunk });
})();
