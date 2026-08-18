(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }

  class CRC32 {
    constructor() {
      this.value = 0xFFFFFFFF;
    }

    update(input) {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      let crc = this.value;
      for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
      this.value = crc >>> 0;
      return this;
    }

    digest() {
      return (this.value ^ 0xFFFFFFFF) >>> 0;
    }

    hex() {
      return this.digest().toString(16).padStart(8, "0").toUpperCase();
    }
  }

  function crc32(input) {
    return new CRC32().update(input).digest();
  }

  async function crc32Blob(blob, onProgress) {
    const crc = new CRC32();
    const reader = blob.stream().getReader();
    let processed = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        crc.update(value);
        processed += value.byteLength;
        onProgress?.(processed, blob.size);
      }
    } finally {
      reader.releaseLock();
    }
    return crc.digest();
  }

  Studio.crc32 = Object.freeze({ CRC32, crc32, crc32Blob });
})();
