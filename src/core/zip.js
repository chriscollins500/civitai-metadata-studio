(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { concatBytes, putU16le, putU32le } = Studio.binary;
  const { crc32Blob } = Studio.crc32;
  const { basename, utf8Encode } = Studio.util;

  function dosDateTime(dateValue) {
    const date = dateValue instanceof Date && !Number.isNaN(dateValue.valueOf()) ? dateValue : new Date();
    const year = Math.min(2107, Math.max(1980, date.getFullYear()));
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = (year - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate();
    return { time, date: day };
  }

  function uniqueNames(entries) {
    const used = new Set();
    return entries.map((entry) => {
      const safe = basename(entry.name);
      const dot = safe.lastIndexOf(".");
      const stem = dot > 0 ? safe.slice(0, dot) : safe;
      const ext = dot > 0 ? safe.slice(dot) : "";
      let name = safe;
      let counter = 2;
      while (used.has(name.toLowerCase())) name = `${stem} (${counter++})${ext}`;
      used.add(name.toLowerCase());
      return { ...entry, name };
    });
  }

  async function build(entries, { onProgress } = {}) {
    if (!Array.isArray(entries) || !entries.length) throw new Error("ZIP requires at least one file.");
    if (entries.length > 65_535) throw new Error("ZIP32 supports at most 65,535 files.");
    const normalized = uniqueNames(entries);
    const totalInput = normalized.reduce((sum, entry) => sum + entry.blob.size, 0);
    let hashed = 0;
    const prepared = [];
    for (let index = 0; index < normalized.length; index += 1) {
      const entry = normalized[index];
      if (entry.blob.size > 0xFFFFFFFF) throw new Error(`${entry.name} exceeds ZIP32's 4 GiB per-file limit.`);
      let last = 0;
      const crc = await crc32Blob(entry.blob, (processed) => {
        hashed += processed - last;
        last = processed;
        onProgress?.(hashed, totalInput, index, normalized.length);
      });
      prepared.push({
        ...entry,
        crc,
        nameBytes: utf8Encode(entry.name),
        dos: dosDateTime(entry.date)
      });
    }

    const parts = [];
    const central = [];
    let offset = 0;
    for (const entry of prepared) {
      if (entry.nameBytes.length > 65_535) throw new Error("A ZIP filename is too long.");
      const local = concatBytes(
        putU32le(0x04034B50),
        putU16le(20),
        putU16le(0x0800),
        putU16le(0),
        putU16le(entry.dos.time),
        putU16le(entry.dos.date),
        putU32le(entry.crc),
        putU32le(entry.blob.size),
        putU32le(entry.blob.size),
        putU16le(entry.nameBytes.length),
        putU16le(0),
        entry.nameBytes
      );
      parts.push(local, entry.blob);
      central.push(concatBytes(
        putU32le(0x02014B50),
        putU16le(20),
        putU16le(20),
        putU16le(0x0800),
        putU16le(0),
        putU16le(entry.dos.time),
        putU16le(entry.dos.date),
        putU32le(entry.crc),
        putU32le(entry.blob.size),
        putU32le(entry.blob.size),
        putU16le(entry.nameBytes.length),
        putU16le(0),
        putU16le(0),
        putU16le(0),
        putU16le(0),
        putU32le(0),
        putU32le(offset),
        entry.nameBytes
      ));
      offset += local.length + entry.blob.size;
      if (offset > 0xFFFFFFFF) throw new Error("ZIP archive exceeds ZIP32's 4 GiB offset limit.");
    }
    const centralOffset = offset;
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    if (centralOffset + centralSize > 0xFFFFFFFF) throw new Error("ZIP archive exceeds the ZIP32 size limit.");
    parts.push(...central);
    parts.push(concatBytes(
      putU32le(0x06054B50),
      putU16le(0),
      putU16le(0),
      putU16le(prepared.length),
      putU16le(prepared.length),
      putU32le(centralSize),
      putU32le(centralOffset),
      putU16le(0)
    ));
    return new Blob(parts, { type: "application/zip" });
  }

  Studio.zip = Object.freeze({ build });
})();
