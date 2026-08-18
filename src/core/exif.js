(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { concatBytes, equals, putU16le, putU32le, u16be, u16le, u32be, u32le } = Studio.binary;
  const {
    latin1Decode,
    sanitizeText,
    utf8Decode,
    utf8Encode
  } = Studio.util;

  const EXIF_POINTER = 0x8769;
  const GPS_POINTER = 0x8825;
  const USER_COMMENT = 0x9286;
  const MAKER_NOTE = 0x927C;
  const TYPE_SIZE = Object.freeze({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 });
  const TAGS = Object.freeze({
    0x010E: ["Image description", "descriptive", false],
    0x010F: ["Camera make", "sensitive", false],
    0x0110: ["Camera model", "sensitive", false],
    0x0112: ["Orientation", "technical", true],
    0x011A: ["X resolution", "technical", true],
    0x011B: ["Y resolution", "technical", true],
    0x0128: ["Resolution unit", "technical", true],
    0x0131: ["Software", "descriptive", false],
    0x0132: ["Modified date", "descriptive", false],
    0x013B: ["Artist", "personal", false],
    0x8298: ["Copyright", "personal", false],
    0x9C9B: ["Title", "descriptive", false],
    0x9000: ["EXIF version", "technical", true],
    0x9003: ["Original date", "personal", false],
    0x9004: ["Digitized date", "personal", false],
    0x9010: ["Time-zone offset", "personal", false],
    0x9011: ["Original time-zone offset", "personal", false],
    0x9012: ["Digitized time-zone offset", "personal", false],
    0x9101: ["Components configuration", "technical", true],
    0x927C: ["MakerNote", "sensitive", false],
    0x9286: ["UserComment", "generation", false],
    0xA001: ["Color space", "technical", true],
    0xA002: ["Pixel width", "technical", true],
    0xA003: ["Pixel height", "technical", true],
    0xA431: ["Camera serial number", "sensitive", false],
    0xA435: ["Lens serial number", "sensitive", false]
  });

  function endianReaders(bytes, little) {
    return {
      u16: (offset) => little ? u16le(bytes, offset) : u16be(bytes, offset),
      u32: (offset) => little ? u32le(bytes, offset) : u32be(bytes, offset)
    };
  }

  function decodeUserComment(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
    if (bytes.length >= 8 && equals(bytes, "UNICODE\0")) {
      let data = bytes.subarray(8);
      if (data[0] === 0xFE && data[1] === 0xFF) data = data.subarray(2);
      if (data[0] === 0xFF && data[1] === 0xFE) {
        data = data.subarray(2);
        const view = new Uint16Array(Math.floor(data.length / 2));
        const source = new DataView(data.buffer, data.byteOffset, data.byteLength);
        for (let index = 0; index < view.length; index += 1) view[index] = source.getUint16(index * 2, true);
        return sanitizeText(String.fromCharCode(...view));
      }
      let output = "";
      for (let index = 0; index + 1 < data.length; index += 2) {
        output += String.fromCharCode((data[index] << 8) | data[index + 1]);
      }
      return sanitizeText(output).replace(/\u0000+$/g, "");
    }
    if (bytes.length >= 8 && equals(bytes, "ASCII\0\0\0")) {
      return sanitizeText(latin1Decode(bytes.subarray(8))).replace(/\u0000+$/g, "");
    }
    return sanitizeText(utf8Decode(bytes)).replace(/\u0000+$/g, "");
  }

  function encodeUserComment(value) {
    const text = sanitizeText(value);
    const output = new Uint8Array(8 + text.length * 2);
    output.set(Uint8Array.of(85, 78, 73, 67, 79, 68, 69, 0));
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      output[8 + index * 2] = code >>> 8;
      output[9 + index * 2] = code & 255;
    }
    return output;
  }

  function decodeValue(type, count, data, little) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (type === 2) return sanitizeText(latin1Decode(data)).replace(/\u0000+$/g, "");
    if (type === 1 || type === 7) return data.slice();
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const offset = index * TYPE_SIZE[type];
      if (type === 3) values.push(view.getUint16(offset, little));
      else if (type === 4) values.push(view.getUint32(offset, little));
      else if (type === 9) values.push(view.getInt32(offset, little));
      else if (type === 5 || type === 10) {
        const numerator = type === 5 ? view.getUint32(offset, little) : view.getInt32(offset, little);
        const denominator = type === 5 ? view.getUint32(offset + 4, little) : view.getInt32(offset + 4, little);
        values.push({ numerator, denominator, value: denominator ? numerator / denominator : null });
      }
    }
    return values.length === 1 ? values[0] : values;
  }

  function displayValue(tag, value) {
    if (tag === USER_COMMENT) return `${decodeUserComment(value).length.toLocaleString()} characters`;
    if (value instanceof Uint8Array) {
      if (tag === 0x9C9B) {
        const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
        let text = "";
        for (let index = 0; index + 1 < value.length; index += 2) text += String.fromCharCode(view.getUint16(index, true));
        return sanitizeText(text).replace(/\u0000+$/g, "");
      }
      if (tag === 0x9000) return latin1Decode(value);
      return `${value.byteLength.toLocaleString()} bytes`;
    }
    if (value && typeof value === "object" && "numerator" in value) {
      return value.denominator ? `${value.value} (${value.numerator}/${value.denominator})` : `${value.numerator}/0`;
    }
    return sanitizeText(Array.isArray(value) ? value.join(", ") : value);
  }

  function parse(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    const warnings = [];
    let tiffStart = 0;
    if (bytes.length >= 6 && equals(bytes, "Exif\0\0")) tiffStart = 6;
    if (bytes.length < tiffStart + 8) return { userComment: "", items: [], tagValues: {}, warnings: ["EXIF data is truncated."] };
    const order = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
    const little = order === "II";
    if (!little && order !== "MM") return { userComment: "", items: [], tagValues: {}, warnings: ["EXIF byte order is invalid."] };
    const read = endianReaders(bytes, little);
    if (read.u16(tiffStart + 2) !== 42) warnings.push("EXIF TIFF marker is non-standard.");
    const rootOffset = tiffStart + read.u32(tiffStart + 4);
    const items = [];
    const tagValues = {};
    const visited = new Set();
    let userComment = "";

    const readIfd = (absoluteOffset, group, depth = 0) => {
      if (depth > 3 || visited.has(absoluteOffset) || absoluteOffset < tiffStart || absoluteOffset + 2 > bytes.length) return;
      visited.add(absoluteOffset);
      const count = read.u16(absoluteOffset);
      if (count > 1024 || absoluteOffset + 2 + count * 12 + 4 > bytes.length) {
        warnings.push(`${group} IFD is truncated or unreasonably large.`);
        return;
      }
      for (let index = 0; index < count; index += 1) {
        const entryOffset = absoluteOffset + 2 + index * 12;
        const tag = read.u16(entryOffset);
        const type = read.u16(entryOffset + 2);
        const valueCount = read.u32(entryOffset + 4);
        const unit = TYPE_SIZE[type];
        if (!unit || valueCount > 16 * 1024 * 1024) continue;
        const length = unit * valueCount;
        let dataOffset = entryOffset + 8;
        if (length > 4) dataOffset = tiffStart + read.u32(entryOffset + 8);
        if (dataOffset < 0 || dataOffset + length > bytes.length) {
          warnings.push(`EXIF tag 0x${tag.toString(16).toUpperCase()} points outside its payload.`);
          continue;
        }
        const raw = bytes.slice(dataOffset, dataOffset + length);
        const value = decodeValue(type, valueCount, raw, little);
        if (tag === EXIF_POINTER && typeof value === "number") {
          readIfd(tiffStart + value, "Exif", depth + 1);
          continue;
        }
        if (tag === GPS_POINTER) {
          items.push({
            id: `exif:${group}:gps`,
            carrier: "EXIF",
            label: "GPS location directory",
            value: "Present",
            category: "sensitive",
            preserve: false,
            preserveSupported: false,
            reason: "GPS is removed to protect location privacy."
          });
          continue;
        }
        const definition = TAGS[tag] || [`Unknown EXIF tag 0x${tag.toString(16).toUpperCase()}`, "unknown", false];
        const [label, category, preserve] = definition;
        if (tag === USER_COMMENT) userComment = decodeUserComment(raw);
        const id = `exif:${group}:${tag.toString(16)}`;
        tagValues[id] = { tag, type, count: valueCount, value, raw, group };
        items.push({
          id,
          carrier: "EXIF",
          label,
          value: displayValue(tag, value),
          category,
          preserve: category === "generation" ? false : preserve,
          preserveSupported: isPreservableTag(tag),
          reason: category === "sensitive"
            ? "Removed by default because this may identify a person, device, or location."
            : category === "unknown"
              ? "Unknown EXIF fields are not copied into the rebuilt safe EXIF block."
              : ""
        });
      }
    };

    readIfd(rootOffset, "IFD0");
    return { userComment, items, tagValues, warnings, littleEndian: little };
  }

  function isPreservableTag(tag) {
    return [
      0x010E, 0x0112, 0x011A, 0x011B, 0x0128, 0x0131, 0x0132, 0x013B, 0x8298,
      0x9C9B, 0x9000, 0x9003, 0x9004, 0x9010, 0x9011, 0x9012, 0x9101,
      0xA001, 0xA002, 0xA003
    ].includes(tag);
  }

  function asciiEntry(tag, value) {
    const bytes = new Uint8Array([...Studio.util.latin1Encode(sanitizeText(value, 4095)).bytes, 0]);
    return { tag, type: 2, count: bytes.length, data: bytes };
  }

  function shortEntry(tag, value) {
    return { tag, type: 3, count: 1, data: putU16le(Number(value) || 0) };
  }

  function longEntry(tag, value) {
    return { tag, type: 4, count: 1, data: putU32le(Number(value) >>> 0) };
  }

  function undefinedEntry(tag, value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    return { tag, type: 7, count: bytes.length, data: bytes };
  }

  function byteEntry(tag, value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    return { tag, type: 1, count: bytes.length, data: bytes };
  }

  function rationalEntry(tag, value) {
    const numerator = Number(value?.numerator ?? value ?? 72);
    const denominator = Number(value?.denominator ?? 1);
    return { tag, type: 5, count: 1, data: concatBytes(putU32le(numerator), putU32le(denominator || 1)) };
  }

  function selected(original, selections, tag) {
    if (!original?.tagValues) return null;
    for (const [id, item] of Object.entries(original.tagValues)) {
      if (item.tag === tag && selections?.[id] !== false && (selections?.[id] === true || TAGS[tag]?.[2] === true)) return item.value;
    }
    return null;
  }

  function externalLength(entries) {
    return entries.reduce((sum, entry) => entry.data.length > 4 ? sum + entry.data.length + (entry.data.length & 1) : sum, 0);
  }

  function writeIfd(output, start, entries, dataStart, pointerValues = new Map()) {
    const view = new DataView(output.buffer);
    view.setUint16(start, entries.length, true);
    let externalOffset = dataStart;
    entries.forEach((entry, index) => {
      const offset = start + 2 + index * 12;
      view.setUint16(offset, entry.tag, true);
      view.setUint16(offset + 2, entry.type, true);
      view.setUint32(offset + 4, entry.count, true);
      const pointer = pointerValues.get(entry.tag);
      if (pointer !== undefined) {
        view.setUint32(offset + 8, pointer, true);
      } else if (entry.data.length <= 4) {
        output.set(entry.data, offset + 8);
      } else {
        view.setUint32(offset + 8, externalOffset, true);
        output.set(entry.data, externalOffset);
        externalOffset += entry.data.length + (entry.data.length & 1);
      }
    });
    view.setUint32(start + 2 + entries.length * 12, 0, true);
  }

  function build(record, { original = null, selections = {} } = {}) {
    const valueOf = (key) => record.fields?.[key]?.value ?? record.fields?.[key];
    const parameters = Studio.a1111.build(record);
    const root = [];
    const exif = [];

    const addSelectedAscii = (tag) => {
      const value = selected(original, selections, tag);
      if (value !== null && value !== "") root.push(asciiEntry(tag, value));
    };
    addSelectedAscii(0x010E);
    addSelectedAscii(0x0131);
    addSelectedAscii(0x0132);
    addSelectedAscii(0x013B);
    addSelectedAscii(0x8298);
    const title = selected(original, selections, 0x9C9B);
    if (title instanceof Uint8Array) root.push(byteEntry(0x9C9B, title));

    const orientation = selected(original, selections, 0x0112);
    if (orientation) root.push(shortEntry(0x0112, orientation));
    const xResolution = selected(original, selections, 0x011A);
    const yResolution = selected(original, selections, 0x011B);
    const resolutionUnit = selected(original, selections, 0x0128);
    if (xResolution) root.push(rationalEntry(0x011A, xResolution));
    if (yResolution) root.push(rationalEntry(0x011B, yResolution));
    if (resolutionUnit) root.push(shortEntry(0x0128, resolutionUnit));

    root.push({ tag: EXIF_POINTER, type: 4, count: 1, data: putU32le(0) });
    exif.push(undefinedEntry(0x9000, Uint8Array.of(48, 50, 51, 49)));
    for (const tag of [0x9003, 0x9004, 0x9010, 0x9011, 0x9012]) {
      const value = selected(original, selections, tag);
      if (value !== null && value !== "") exif.push(asciiEntry(tag, value));
    }
    exif.push(undefinedEntry(USER_COMMENT, encodeUserComment(parameters)));
    const components = selected(original, selections, 0x9101);
    if (components instanceof Uint8Array) exif.push(undefinedEntry(0x9101, components));
    const colorSpace = selected(original, selections, 0xA001);
    if (colorSpace !== null) exif.push(shortEntry(0xA001, colorSpace));
    const width = Number(valueOf("width"));
    const height = Number(valueOf("height"));
    if (Number.isSafeInteger(width) && width > 0) exif.push(longEntry(0xA002, width));
    if (Number.isSafeInteger(height) && height > 0) exif.push(longEntry(0xA003, height));

    root.sort((left, right) => left.tag - right.tag);
    exif.sort((left, right) => left.tag - right.tag);
    const rootStart = 8;
    const rootFixed = 2 + root.length * 12 + 4;
    const rootDataStart = rootStart + rootFixed;
    const exifStart = rootDataStart + externalLength(root);
    const exifFixed = 2 + exif.length * 12 + 4;
    const exifDataStart = exifStart + exifFixed;
    const output = new Uint8Array(exifDataStart + externalLength(exif));
    output.set(Uint8Array.of(73, 73, 42, 0, 8, 0, 0, 0));
    writeIfd(output, rootStart, root, rootDataStart, new Map([[EXIF_POINTER, exifStart]]));
    writeIfd(output, exifStart, exif, exifDataStart);
    return output;
  }

  function withExifPrefix(tiff) {
    return concatBytes(Uint8Array.of(69, 120, 105, 102, 0, 0), tiff);
  }

  Studio.exif = Object.freeze({
    build,
    decodeUserComment,
    encodeUserComment,
    parse,
    withExifPrefix
  });
})();
