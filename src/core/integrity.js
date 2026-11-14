(() => {
  "use strict";
  const Studio = globalThis.CMStudio ||= {};
  const PNG = new Set(["IHDR", "IDAT", "PLTE", "tRNS", "acTL", "fcTL", "fdAT"]);
  const WEBP = new Set(["VP8 ", "VP8L", "ALPH", "ANIM", "ANMF"]);

  function ranges(file, inspection) {
    if (inspection.format === "jpeg") return inspection.segments
      .filter((segment) => segment.scan || (!(segment.marker >= 0xE0 && segment.marker <= 0xEF) && segment.marker !== 0xFE))
      .map((segment) => [segment.offset, segment.offset + segment.totalLength]);
    const types = inspection.format === "png" ? PNG : WEBP;
    return inspection.chunks.filter((chunk) => types.has(chunk.type)).map((chunk) => [chunk.offset, chunk.offset + chunk.totalLength]);
  }

  async function digest(file, inspection, { signal, onProgress } = {}) {
    const hash = new Studio.sha256.SHA256();
    const selected = ranges(file, inspection);
    const total = selected.reduce((sum, [start, end]) => sum + end - start, 0);
    let processed = 0;
    for (const [start, end] of selected) {
      for (let offset = start; offset < end; offset += Studio.constants.HASH_CHUNK_SIZE) {
        signal?.throwIfAborted();
        const chunk = await file.slice(offset, Math.min(end, offset + Studio.constants.HASH_CHUNK_SIZE)).arrayBuffer();
        hash.update(new Uint8Array(chunk)); processed += chunk.byteLength;
        onProgress?.(processed, total);
        await Studio.util.yieldToBrowser();
      }
    }
    return { algorithm: "SHA256", digest: hash.hex(), bytes: total, chunks: selected.length };
  }

  async function verifyExport(record, output, options = {}) {
    const reopened = await Studio.canonical.inspectFile(output);
    const before = await digest(record.file, record.inspection, options);
    const after = await digest(output, reopened, options);
    const preserved = before.digest === after.digest && before.bytes === after.bytes
      && record.inspection.width === reopened.width && record.inspection.height === reopened.height;
    if (!preserved) throw new Error("Export integrity check failed. The encoded image payload differs; no output was saved.");
    return { preserved, format: record.format, before, after, checkedAt: new Date().toISOString() };
  }
  Studio.integrity = Object.freeze({ digest, verifyExport });
})();
