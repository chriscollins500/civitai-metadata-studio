(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { HASH_CHUNK_SIZE } = Studio.constants;
  const { normalizeHash, readBlobBytes, safeJsonParse, utf8Decode } = Studio.util;
  const { u64leNumber } = Studio.binary;

  const K = new Uint32Array([
    0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
    0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
    0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
    0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
    0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
    0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
    0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
    0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
  ]);

  const rightRotate = (value, count) => (value >>> count) | (value << (32 - count));

  class SHA256 {
    constructor() {
      this.state = new Uint32Array([
        0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
        0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19
      ]);
      this.buffer = new Uint8Array(64);
      this.bufferLength = 0;
      this.bytesHashed = 0;
      this.finished = false;
      this.words = new Uint32Array(64);
    }

    update(input) {
      if (this.finished) throw new Error("SHA-256 digest has already been finalized.");
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      this.bytesHashed += bytes.length;
      let position = 0;
      if (this.bufferLength) {
        while (position < bytes.length && this.bufferLength < 64) {
          this.buffer[this.bufferLength++] = bytes[position++];
        }
        if (this.bufferLength === 64) {
          this._compress(this.buffer);
          this.bufferLength = 0;
        }
      }
      while (position + 64 <= bytes.length) {
        this._compress(bytes.subarray(position, position + 64));
        position += 64;
      }
      while (position < bytes.length) this.buffer[this.bufferLength++] = bytes[position++];
      return this;
    }

    _compress(chunk) {
      const words = this.words;
      const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(index * 4, false);
      for (let index = 16; index < 64; index += 1) {
        const w15 = words[index - 15];
        const w2 = words[index - 2];
        const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
        const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
        words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
      }

      let [a, b, c, d, e, f, g, h] = this.state;
      for (let index = 0; index < 64; index += 1) {
        const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        const choose = (e & f) ^ (~e & g);
        const t1 = (h + s1 + choose + K[index] + words[index]) >>> 0;
        const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (s0 + majority) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) >>> 0;
      }
      this.state[0] = (this.state[0] + a) >>> 0;
      this.state[1] = (this.state[1] + b) >>> 0;
      this.state[2] = (this.state[2] + c) >>> 0;
      this.state[3] = (this.state[3] + d) >>> 0;
      this.state[4] = (this.state[4] + e) >>> 0;
      this.state[5] = (this.state[5] + f) >>> 0;
      this.state[6] = (this.state[6] + g) >>> 0;
      this.state[7] = (this.state[7] + h) >>> 0;
    }

    digest() {
      if (!this.finished) {
        const bitLength = BigInt(this.bytesHashed) * 8n;
        this.buffer[this.bufferLength++] = 0x80;
        if (this.bufferLength > 56) {
          this.buffer.fill(0, this.bufferLength);
          this._compress(this.buffer);
          this.bufferLength = 0;
        }
        this.buffer.fill(0, this.bufferLength, 56);
        const view = new DataView(this.buffer.buffer);
        view.setUint32(56, Number((bitLength >> 32n) & 0xFFFFFFFFn), false);
        view.setUint32(60, Number(bitLength & 0xFFFFFFFFn), false);
        this._compress(this.buffer);
        this.finished = true;
      }
      const output = new Uint8Array(32);
      const view = new DataView(output.buffer);
      this.state.forEach((value, index) => view.setUint32(index * 4, value, false));
      return output;
    }

    hex() {
      return [...this.digest()].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    }
  }

  async function hashBlob(blob, { start = 0, onProgress, signal } = {}) {
    if (start < 0 || start > blob.size) throw new RangeError("Invalid hashing start offset.");
    const hash = new SHA256();
    let processed = 0;
    for (let offset = start; offset < blob.size; offset += HASH_CHUNK_SIZE) {
      if (signal?.aborted) throw new DOMException("Hashing was cancelled.", "AbortError");
      const end = Math.min(blob.size, offset + HASH_CHUNK_SIZE);
      hash.update(new Uint8Array(await blob.slice(offset, end).arrayBuffer()));
      processed += end - offset;
      onProgress?.(processed, blob.size - start);
    }
    return hash.hex();
  }

  async function safetensorsDataOffset(file) {
    if (!file.name?.toLowerCase().endsWith(".safetensors") || file.size < 10) return null;
    const header = await readBlobBytes(file, 0, 9);
    let length;
    try {
      length = u64leNumber(header, 0);
    } catch {
      return null;
    }
    const offset = 8 + length;
    if (header[8] !== 0x7B || offset > file.size || length > 16 * 1024 * 1024) return null;
    return offset;
  }

  async function safetensorsMetadataHash(file) {
    const offset = await safetensorsDataOffset(file);
    if (offset === null || offset - 8 > 16 * 1024 * 1024) return null;
    const header = await readBlobBytes(file, 8, offset - 8);
    const document = safeJsonParse(utf8Decode(header));
    const metadata = document?.__metadata__;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    for (const key of ["sshs_model_hash", "sshs_legacy_hash", "modelspec.hash_sha256"]) {
      const value = String(metadata[key] || "").trim();
      if (/^[A-Fa-f0-9]{12,}$/.test(value)) return normalizeHash(value.slice(0, 12));
    }
    return null;
  }

  async function hashModelFile(file, options = {}) {
    const sha = new SHA256();
    const crc = new Studio.crc32.CRC32();
    const autoV1 = new SHA256();
    const safetensorsOffset = await safetensorsDataOffset(file);
    const autoV3 = safetensorsOffset === null ? null : new SHA256();
    const autoV1Start = 0x100000;
    const autoV1End = autoV1Start + 64 * 1024;
    let processed = 0;
    const reader = file.stream().getReader();
    try {
      while (true) {
        if (options.signal?.aborted) throw new DOMException("Hashing was cancelled.", "AbortError");
        const { value, done } = await reader.read();
        if (done) break;
        sha.update(value);
        crc.update(value);
        const chunkStart = processed;
        const chunkEnd = processed + value.byteLength;
        const overlapStart = Math.max(chunkStart, autoV1Start);
        const overlapEnd = Math.min(chunkEnd, autoV1End);
        if (overlapEnd > overlapStart) {
          autoV1.update(value.subarray(overlapStart - chunkStart, overlapEnd - chunkStart));
        }
        if (autoV3) {
          const payloadStart = Math.max(chunkStart, safetensorsOffset);
          if (chunkEnd > payloadStart) {
            autoV3.update(value.subarray(payloadStart - chunkStart));
          }
        }
        processed = chunkEnd;
        options.onProgress?.(processed, file.size);
      }
    } finally {
      reader.releaseLock();
    }
    const sha256 = sha.hex();
    const hashes = {
      SHA256: normalizeHash(sha256),
      AutoV2: normalizeHash(sha256.slice(0, 10)),
      CRC32: crc.hex()
    };
    if (file.size > autoV1Start) hashes.AutoV1 = normalizeHash(autoV1.hex().slice(0, 8));
    if (autoV3) hashes.AutoV3 = normalizeHash(autoV3.hex().slice(0, 12));
    return hashes;
  }

  Studio.sha256 = Object.freeze({
    SHA256,
    hashBlob,
    hashModelFile,
    safetensorsDataOffset,
    safetensorsMetadataHash
  });
})();
