(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { METADATA_VALUE_LIMIT } = Studio.constants;
  const {
    ascii,
    concatBytes,
    equals,
    putU24le,
    putU32le,
    u16le,
    u24le,
    u32le
  } = Studio.binary;
  const { limitPreview, safeJsonParse, utf8Decode } = Studio.util;

  const STRUCTURAL = new Set(["VP8 ", "VP8L", "ALPH", "ANIM", "ANMF"]);
  const CAPTURE = new Set(["VP8X", "VP8 ", "VP8L", "EXIF", "XMP "]);

  function chunkBytes(type, data) {
    const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
    const pad = payload.length & 1 ? Uint8Array.of(0) : new Uint8Array();
    return concatBytes(
      Uint8Array.from(type, (character) => character.charCodeAt(0)),
      putU32le(payload.length),
      payload,
      pad
    );
  }

  function itemForChunk(chunk, label, value, category, preserve, reason = "") {
    return {
      id: `webp:${chunk.offset}`,
      carrier: chunk.type.trim(),
      label,
      value,
      category,
      preserve,
      preserveSupported: true,
      storage: { kind: "webp-chunk", offset: chunk.offset },
      reason
    };
  }

  function looksLikeWorkflow(text) {
    const lower = text.toLowerCase();
    return lower.includes('"workflow"') || lower.includes('"class_type"') || lower.includes("comfyui");
  }

  async function inspect(file) {
    if (file.size < 20) throw new Error("WebP file is too small.");
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!equals(header, "RIFF") || !equals(header, "WEBP", 8)) throw new Error("The file does not have a RIFF/WebP header.");
    const declaredSize = u32le(header, 4) + 8;
    const warnings = [];
    if (declaredSize !== file.size) warnings.push(`RIFF declares ${declaredSize.toLocaleString()} bytes; the file contains ${file.size.toLocaleString()} bytes.`);
    const chunks = [];
    const carriers = [];
    const metadataItems = [];
    const manifests = [];
    let exifInfo = null;
    let parametersText = "";
    let width = null;
    let height = null;
    let animated = false;
    let hasAlpha = false;
    let flags = 0;
    let offset = 12;
    let count = 0;

    while (offset + 8 <= file.size) {
      if (++count > 1_000_000) throw new Error("WebP contains an unreasonable number of chunks.");
      const chunkHeader = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      const type = ascii(chunkHeader, 0, 4);
      const length = u32le(chunkHeader, 4);
      const totalLength = 8 + length + (length & 1);
      if (!/^[\x20-\x7E]{4}$/.test(type)) throw new Error(`Invalid WebP FourCC at byte ${offset}.`);
      if (offset + totalLength > file.size) throw new Error(`${type} chunk extends beyond the WebP file.`);
      const captureLength = type === "VP8 " ? Math.min(length, 10) : type === "VP8L" ? Math.min(length, 5) : length;
      let data = null;
      if (CAPTURE.has(type) && captureLength <= METADATA_VALUE_LIMIT) {
        data = new Uint8Array(await file.slice(offset + 8, offset + 8 + captureLength).arrayBuffer());
      } else if (CAPTURE.has(type) && captureLength > METADATA_VALUE_LIMIT && !STRUCTURAL.has(type)) {
        warnings.push(`${type.trim()} metadata exceeds the ${Studio.util.formatBytes(METADATA_VALUE_LIMIT)} decode limit.`);
      }
      const chunk = { offset, length, totalLength, type, data };
      chunks.push(chunk);

      if (type === "VP8X" && data?.length >= 10) {
        flags = data[0];
        width = u24le(data, 4) + 1;
        height = u24le(data, 7) + 1;
        hasAlpha = Boolean(flags & 0x10);
        animated = Boolean(flags & 0x02);
      } else if (type === "VP8 " && data?.length >= 10 && equals(data, Uint8Array.of(0x9D, 0x01, 0x2A), 3)) {
        width ||= u16le(data, 6) & 0x3FFF;
        height ||= u16le(data, 8) & 0x3FFF;
      } else if (type === "VP8L" && data?.length >= 5 && data[0] === 0x2F) {
        const bits = u32le(data, 1);
        width ||= (bits & 0x3FFF) + 1;
        height ||= ((bits >>> 14) & 0x3FFF) + 1;
        hasAlpha ||= Boolean((bits >>> 28) & 1);
      } else if (type === "ALPH") {
        hasAlpha = true;
      } else if (type === "ANIM" || type === "ANMF") {
        animated = true;
      }

      if (type === "EXIF" && data) {
        exifInfo = Studio.exif.parse(data);
        metadataItems.push(...exifInfo.items);
        warnings.push(...exifInfo.warnings);
        if (exifInfo.userComment) {
          parametersText = exifInfo.userComment;
          carriers.push({ name: "WebP EXIF UserComment", value: exifInfo.userComment, kind: "generation" });
          const parsed = Studio.a1111.parse(exifInfo.userComment);
          const embedded = safeJsonParse(parsed.rawSettings?.["Civitai metadata"]);
          if (embedded) manifests.push(embedded);
        }
      } else if (type === "XMP " && data) {
        const xmp = utf8Decode(data);
        const workflow = looksLikeWorkflow(xmp);
        carriers.push({ name: "WebP XMP", value: xmp, kind: workflow ? "workflow" : "other" });
        metadataItems.push(itemForChunk(
          chunk,
          "XMP document",
          limitPreview(xmp, 300),
          workflow ? "generation" : "personal",
          workflow,
          workflow ? "Preserved because it appears to contain original workflow data." : "XMP can contain creator, dates, location, and rights data."
        ));
      } else if (type === "ICCP") {
        metadataItems.push(itemForChunk(chunk, "ICC color profile", `${length.toLocaleString()} bytes`, "technical", true));
      } else if (!["VP8X", ...STRUCTURAL].includes(type)) {
        metadataItems.push(itemForChunk(
          chunk,
          `${type.trim()} private metadata`,
          `${length.toLocaleString()} bytes`,
          "unknown",
          false,
          "Unknown RIFF metadata is removed unless explicitly preserved."
        ));
      }
      offset += totalLength;
    }
    if (!chunks.some((chunk) => chunk.type === "VP8 " || chunk.type === "VP8L" || chunk.type === "ANMF")) {
      throw new Error("WebP does not contain decodable image or animation chunks.");
    }
    if (offset !== file.size) warnings.push(`${(file.size - offset).toLocaleString()} trailing bytes are not part of a complete WebP chunk.`);

    return {
      format: "webp",
      mime: "image/webp",
      width,
      height,
      animated,
      hasAlpha,
      flags,
      chunks,
      carriers,
      metadataItems,
      a1111: parametersText ? Studio.a1111.parse(parametersText) : null,
      manifests,
      promptJson: null,
      workflowJson: null,
      exif: exifInfo,
      warnings
    };
  }

  function shouldKeep(chunk, selections) {
    if (chunk.type === "VP8X" || chunk.type === "EXIF") return false;
    if (STRUCTURAL.has(chunk.type)) return true;
    if (chunk.type === "ICCP") return selections?.[`webp:${chunk.offset}`] !== false;
    return selections?.[`webp:${chunk.offset}`] === true;
  }

  function rewrite(file, inspection, payload) {
    if (!inspection.width || !inspection.height) throw new Error("WebP canvas dimensions are required to add metadata.");
    const keptChunks = inspection.chunks.filter((chunk) => shouldKeep(chunk, payload.selections));
    const hasIcc = keptChunks.some((chunk) => chunk.type === "ICCP");
    const hasXmp = keptChunks.some((chunk) => chunk.type === "XMP ");
    const hasAnimation = keptChunks.some((chunk) => chunk.type === "ANIM" || chunk.type === "ANMF");
    const hasAlpha = inspection.hasAlpha || keptChunks.some((chunk) => chunk.type === "ALPH");
    let flags = 0x08;
    if (hasIcc) flags |= 0x20;
    if (hasAlpha) flags |= 0x10;
    if (hasXmp) flags |= 0x04;
    if (hasAnimation) flags |= 0x02;
    const vp8x = new Uint8Array(10);
    vp8x[0] = flags;
    vp8x.set(putU24le(inspection.width - 1), 4);
    vp8x.set(putU24le(inspection.height - 1), 7);

    const body = [chunkBytes("VP8X", vp8x)];
    let exifInserted = false;
    const exifChunk = chunkBytes("EXIF", Studio.exif.withExifPrefix(payload.exifBytes));
    for (const chunk of keptChunks) {
      if (!exifInserted && chunk.type === "XMP ") {
        body.push(exifChunk);
        exifInserted = true;
      }
      body.push(file.slice(chunk.offset, chunk.offset + chunk.totalLength));
    }
    if (!exifInserted) body.push(exifChunk);
    const bodySize = body.reduce((sum, part) => sum + (part.size ?? part.byteLength), 0);
    const riffSize = 4 + bodySize;
    if (riffSize > 0xFFFFFFFF) throw new Error("Edited WebP exceeds RIFF's 4 GiB container limit.");
    return new Blob([
      Uint8Array.from("RIFF", (character) => character.charCodeAt(0)),
      putU32le(riffSize),
      Uint8Array.from("WEBP", (character) => character.charCodeAt(0)),
      ...body
    ], { type: "image/webp" });
  }

  Studio.webp = Object.freeze({ chunkBytes, inspect, rewrite });
})();
