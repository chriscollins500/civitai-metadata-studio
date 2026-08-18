(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { concatBytes, equals, putU16be, u16be } = Studio.binary;
  const { latin1Decode, limitPreview, safeJsonParse, sanitizeText, utf8Decode, utf8Encode } = Studio.util;

  const EXIF_HEADER = Uint8Array.of(69, 120, 105, 102, 0, 0);
  const XMP_HEADER_TEXT = "http://ns.adobe.com/xap/1.0/\0";
  const ICC_HEADER_TEXT = "ICC_PROFILE\0";
  const SOF_MARKERS = new Set([
    0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
    0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF
  ]);

  function markerName(marker) {
    if (marker >= 0xE0 && marker <= 0xEF) return `APP${marker - 0xE0}`;
    const names = { 0xFE: "COM", 0xDA: "SOS", 0xD9: "EOI", 0xDB: "DQT", 0xC4: "DHT", 0xDD: "DRI" };
    return names[marker] || `0xFF${marker.toString(16).toUpperCase().padStart(2, "0")}`;
  }

  function segmentBytes(marker, data) {
    const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (payload.length > 65_533) throw new Error(`${markerName(marker)} metadata exceeds JPEG's 64 KiB segment limit.`);
    return concatBytes(Uint8Array.of(0xFF, marker), putU16be(payload.length + 2), payload);
  }

  function segmentItem(segment, label, value, category, preserve, reason = "") {
    return {
      id: `jpeg:${segment.offset}`,
      carrier: markerName(segment.marker),
      label,
      value,
      category,
      preserve,
      preserveSupported: true,
      storage: { kind: "jpeg-segment", offset: segment.offset },
      reason
    };
  }

  function looksLikeWorkflow(text) {
    const lower = text.toLowerCase();
    return lower.includes('"workflow"') || lower.includes('"class_type"') || lower.includes("comfyui");
  }

  async function inspect(file) {
    const initial = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (!equals(initial, Uint8Array.of(0xFF, 0xD8))) throw new Error("The file does not have a JPEG SOI marker.");
    const segments = [];
    const carriers = [];
    const metadataItems = [];
    const warnings = [];
    const manifests = [];
    let exifInfo = null;
    let parametersText = "";
    let width = null;
    let height = null;
    let precision = null;
    let components = null;
    let offset = 2;
    let scanOffset = null;
    let count = 0;

    while (offset < file.size) {
      if (++count > 100_000) throw new Error("JPEG contains an unreasonable number of segments.");
      const prefix = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + 32)).arrayBuffer());
      if (prefix[0] !== 0xFF) throw new Error(`JPEG marker expected at byte ${offset}.`);
      let markerIndex = 1;
      while (markerIndex < prefix.length && prefix[markerIndex] === 0xFF) markerIndex += 1;
      if (markerIndex >= prefix.length) throw new Error("JPEG marker fill bytes are truncated.");
      const marker = prefix[markerIndex];
      if (marker === 0x00) throw new Error("Unexpected stuffed JPEG byte before scan data.");
      const markerBytes = markerIndex + 1;
      if (marker === 0xD9) {
        segments.push({ offset, totalLength: markerBytes, marker, data: null });
        offset += markerBytes;
        break;
      }
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) {
        segments.push({ offset, totalLength: markerBytes, marker, data: null });
        offset += markerBytes;
        continue;
      }
      if (prefix.length < markerBytes + 2) throw new Error("JPEG segment length is truncated.");
      const length = u16be(prefix, markerBytes);
      if (length < 2) throw new Error(`JPEG ${markerName(marker)} has an invalid length.`);
      const totalLength = markerBytes + length;
      if (offset + totalLength > file.size) throw new Error(`JPEG ${markerName(marker)} extends beyond the file.`);
      if (marker === 0xDA) {
        scanOffset = offset;
        segments.push({ offset, totalLength: file.size - offset, marker, data: null, scan: true });
        offset = file.size;
        break;
      }
      const payloadStart = offset + markerBytes + 2;
      const inspectable = SOF_MARKERS.has(marker) || marker === 0xFE || (marker >= 0xE0 && marker <= 0xEF);
      const preview = inspectable
        ? new Uint8Array(await file.slice(payloadStart, Math.min(offset + totalLength, payloadStart + 64)).arrayBuffer())
        : null;
      const needsFullPayload = marker === 0xFE
        || (marker === 0xE1 && preview && (equals(preview, EXIF_HEADER) || equals(preview, XMP_HEADER_TEXT)));
      const data = needsFullPayload
        ? new Uint8Array(await file.slice(payloadStart, offset + totalLength).arrayBuffer())
        : preview;
      const segment = { offset, totalLength, marker, data, markerBytes, payloadLength: length - 2 };
      segments.push(segment);

      if (SOF_MARKERS.has(marker) && data.length >= 6) {
        precision = data[0];
        height = u16be(data, 1);
        width = u16be(data, 3);
        components = data[5];
      } else if (marker === 0xE1 && equals(data, EXIF_HEADER)) {
        exifInfo = Studio.exif.parse(data);
        metadataItems.push(...exifInfo.items);
        warnings.push(...exifInfo.warnings);
        if (exifInfo.userComment) {
          parametersText = exifInfo.userComment;
          carriers.push({ name: "JPEG EXIF UserComment", value: exifInfo.userComment, kind: "generation" });
          const parsed = Studio.a1111.parse(exifInfo.userComment);
          const embedded = safeJsonParse(parsed.rawSettings?.["Civitai metadata"]);
          if (embedded) manifests.push(embedded);
        }
      } else if (marker === 0xE1 && equals(data, XMP_HEADER_TEXT)) {
        const xmp = utf8Decode(data.subarray(XMP_HEADER_TEXT.length));
        const workflow = looksLikeWorkflow(xmp);
        carriers.push({ name: "JPEG XMP", value: xmp, kind: workflow ? "workflow" : "other" });
        metadataItems.push(segmentItem(
          segment,
          "XMP document",
          limitPreview(xmp, 300),
          workflow ? "generation" : "personal",
          workflow,
          workflow ? "Preserved because it appears to contain original workflow data." : "XMP can contain creator, rights, dates, or location context."
        ));
      } else if (marker === 0xE2 && equals(data, ICC_HEADER_TEXT)) {
        metadataItems.push(segmentItem(segment, "ICC color profile", `${segment.payloadLength.toLocaleString()} bytes`, "technical", true));
      } else if (marker === 0xE0) {
        metadataItems.push(segmentItem(segment, "JFIF display metadata", `${segment.payloadLength.toLocaleString()} bytes`, "technical", true));
      } else if (marker === 0xEE) {
        metadataItems.push(segmentItem(segment, "Adobe color transform", `${segment.payloadLength.toLocaleString()} bytes`, "technical", true));
      } else if (marker === 0xE2) {
        metadataItems.push(segmentItem(segment, "APP2 technical data", `${segment.payloadLength.toLocaleString()} bytes`, "technical", true));
      } else if (marker === 0xED) {
        metadataItems.push(segmentItem(
          segment,
          "IPTC / Photoshop metadata",
          `${segment.payloadLength.toLocaleString()} bytes`,
          "personal",
          false,
          "IPTC may contain creator, location, contact, and rights information."
        ));
      } else if (marker === 0xFE) {
        const comment = latin1Decode(data);
        carriers.push({ name: "JPEG comment", value: comment, kind: "other" });
        metadataItems.push(segmentItem(segment, "JPEG comment", limitPreview(comment, 300), "descriptive", false));
      } else if (marker >= 0xE0 && marker <= 0xEF) {
        metadataItems.push(segmentItem(
          segment,
          `${markerName(marker)} private metadata`,
          `${segment.payloadLength.toLocaleString()} bytes`,
          "unknown",
          false,
          "Unknown application metadata is removed unless explicitly preserved."
        ));
      }
      offset += totalLength;
    }
    if (scanOffset === null) throw new Error("JPEG scan data (SOS) was not found.");
    if (!width || !height) warnings.push("JPEG dimensions could not be read from a supported frame header.");

    return {
      format: "jpeg",
      mime: "image/jpeg",
      width,
      height,
      precision,
      components,
      animated: false,
      hasAlpha: false,
      segments,
      scanOffset,
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

  function shouldKeep(segment, selections) {
    if (segment.scan) return true;
    if (segment.marker < 0xE0 || segment.marker > 0xEF) return true;
    if (segment.marker === 0xE1 && segment.data && equals(segment.data, EXIF_HEADER)) return false;
    if ([0xE0, 0xE2, 0xEE].includes(segment.marker)) return selections?.[`jpeg:${segment.offset}`] !== false;
    return selections?.[`jpeg:${segment.offset}`] === true;
  }

  function rewrite(file, inspection, payload) {
    const exifPayload = Studio.exif.withExifPrefix(payload.exifBytes);
    const exifSegment = segmentBytes(0xE1, exifPayload);
    const parts = [Uint8Array.of(0xFF, 0xD8)];
    let inserted = false;
    for (const segment of inspection.segments) {
      if (!inserted && ![0xE0, 0xEE].includes(segment.marker)) {
        parts.push(exifSegment);
        inserted = true;
      }
      if (shouldKeep(segment, payload.selections)) {
        parts.push(file.slice(segment.offset, segment.offset + segment.totalLength));
      }
    }
    if (!inserted) parts.push(exifSegment);
    return new Blob(parts, { type: "image/jpeg" });
  }

  Studio.jpeg = Object.freeze({ inspect, rewrite, segmentBytes });
})();
