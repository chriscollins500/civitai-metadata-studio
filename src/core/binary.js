(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};

  function viewOf(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  function u16be(bytes, offset = 0) {
    return viewOf(bytes).getUint16(offset, false);
  }

  function u16le(bytes, offset = 0) {
    return viewOf(bytes).getUint16(offset, true);
  }

  function u24le(bytes, offset = 0) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
  }

  function u32be(bytes, offset = 0) {
    return viewOf(bytes).getUint32(offset, false);
  }

  function u32le(bytes, offset = 0) {
    return viewOf(bytes).getUint32(offset, true);
  }

  function u64leNumber(bytes, offset = 0) {
    const view = viewOf(bytes);
    const value = view.getBigUint64(offset, true);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError("64-bit value exceeds the browser's safe integer range.");
    }
    return Number(value);
  }

  function putU16be(value) {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, Number(value), false);
    return bytes;
  }

  function putU16le(value) {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, Number(value), true);
    return bytes;
  }

  function putU24le(value) {
    const number = Number(value);
    return Uint8Array.of(number & 255, (number >>> 8) & 255, (number >>> 16) & 255);
  }

  function putU32be(value) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, Number(value) >>> 0, false);
    return bytes;
  }

  function putU32le(value) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, Number(value) >>> 0, true);
    return bytes;
  }

  function putU64le(value) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
    return bytes;
  }

  function concatBytes(...parts) {
    const arrays = parts.flat().filter(Boolean).map((part) =>
      part instanceof Uint8Array ? part : new Uint8Array(part)
    );
    const total = arrays.reduce((sum, part) => sum + part.byteLength, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of arrays) {
      output.set(part, offset);
      offset += part.byteLength;
    }
    return output;
  }

  function ascii(bytes, offset = 0, length = bytes.length - offset) {
    let output = "";
    const end = Math.min(bytes.length, offset + length);
    for (let index = offset; index < end; index += 1) output += String.fromCharCode(bytes[index]);
    return output;
  }

  function equals(bytes, expected, offset = 0) {
    const right = typeof expected === "string"
      ? Uint8Array.from(expected, (character) => character.charCodeAt(0))
      : expected;
    if (offset < 0 || offset + right.length > bytes.length) return false;
    return right.every((value, index) => bytes[offset + index] === value);
  }

  function findZero(bytes, start = 0) {
    for (let index = start; index < bytes.length; index += 1) {
      if (bytes[index] === 0) return index;
    }
    return -1;
  }

  Studio.binary = Object.freeze({
    ascii,
    concatBytes,
    equals,
    findZero,
    putU16be,
    putU16le,
    putU24le,
    putU32be,
    putU32le,
    putU64le,
    u16be,
    u16le,
    u24le,
    u32be,
    u32le,
    u64leNumber,
    viewOf
  });
})();
