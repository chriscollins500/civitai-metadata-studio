(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const MAX_TEXT = 16 * 1024 * 1024;
  const textDecoder = new TextDecoder("utf-8", { fatal: false });
  const textEncoder = new TextEncoder();

  function sanitizeText(value, limit = MAX_TEXT) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/\u0000/g, "")
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .slice(0, limit);
  }

  function basename(value) {
    const text = String(value || "").replaceAll("\\", "/");
    const parts = text.split("/").filter(Boolean);
    return sanitizeText(parts.at(-1) || "unnamed");
  }

  function withoutExtension(name) {
    const safe = basename(name);
    const index = safe.lastIndexOf(".");
    return index > 0 ? safe.slice(0, index) : safe;
  }

  function extension(name) {
    const safe = basename(name);
    const index = safe.lastIndexOf(".");
    return index > 0 ? safe.slice(index + 1).toLowerCase() : "";
  }

  function outputName(name, suffix) {
    const safeName = basename(name);
    const ext = extension(safeName);
    const stem = ext ? safeName.slice(0, -(ext.length + 1)) : safeName;
    const cleanSuffix = sanitizeText(suffix, 120)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replace(/\.+$/g, "")
      .trim();
    return `${stem}${cleanSuffix || "_edited"}${ext ? `.${ext}` : ""}`;
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KiB", "MiB", "GiB", "TiB"];
    let amount = bytes / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && amount >= 1024; index += 1) {
      amount /= 1024;
      unit = units[index];
    }
    const digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
    return `${amount.toFixed(digits)} ${unit}`;
  }

  function formatDimensions(width, height) {
    return width && height ? `${Number(width).toLocaleString()} × ${Number(height).toLocaleString()}` : "Unknown";
  }

  function stableStringify(value, space = 2) {
    const seen = new WeakSet();
    const normalize = (item) => {
      if (!item || typeof item !== "object") return item;
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
      if (Array.isArray(item)) return item.map(normalize);
      return Object.fromEntries(
        Object.keys(item).sort().map((key) => [key, normalize(item[key])])
      );
    };
    return JSON.stringify(normalize(value), null, space);
  }

  function safeJsonParse(value, fallback = null) {
    try {
      const text = typeof value === "string" ? value : utf8Decode(value);
      if (text.length > MAX_TEXT) return fallback;
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  function replaceNonFiniteJsonNumbers(text) {
    let output = "";
    let quoted = false;
    let escaped = false;
    const tokens = ["-Infinity", "Infinity", "NaN"];
    const boundary = (character) => !character || /[\s,\]}:]/u.test(character);
    for (let index = 0; index < text.length;) {
      const character = text[index];
      if (quoted) {
        output += character;
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "\"") quoted = false;
        index += 1;
        continue;
      }
      if (character === "\"") {
        quoted = true;
        output += character;
        index += 1;
        continue;
      }
      const token = tokens.find((candidate) =>
        text.startsWith(candidate, index)
        && boundary(text[index - 1])
        && boundary(text[index + candidate.length])
      );
      if (token) {
        output += "null";
        index += token.length;
        continue;
      }
      output += character;
      index += 1;
    }
    return output;
  }

  function safeComfyJsonParse(value, fallback = null) {
    const text = typeof value === "string" ? value : utf8Decode(value);
    if (text.length > MAX_TEXT) return fallback;
    try {
      return JSON.parse(text);
    } catch {
      try {
        return JSON.parse(replaceNonFiniteJsonNumbers(text));
      } catch {
        return fallback;
      }
    }
  }

  function clone(value) {
    return structuredClone(value);
  }

  function isPresent(value) {
    return value !== null && value !== undefined && value !== "";
  }

  function normalizeComparable(value) {
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    if (typeof value === "string") return value.trim().replace(/\s+/g, " ").toLowerCase();
    return stableStringify(value, 0).toLowerCase();
  }

  function sameValue(left, right) {
    return normalizeComparable(left) === normalizeComparable(right);
  }

  function integerOrNull(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
  }

  function numberOrNull(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function positiveIdOrNull(value) {
    const number = integerOrNull(value);
    return number && number > 0 ? number : null;
  }

  function normalizeHash(value) {
    return sanitizeText(value, 256).trim().replace(/\s+/g, "").toUpperCase();
  }

  function selectHash(hashes, priority = Studio.constants.HASH_PRIORITY) {
    if (!hashes || typeof hashes !== "object" || Array.isArray(hashes)) {
      return { algorithm: "", value: "" };
    }
    const indexed = new Map();
    for (const [algorithm, raw] of Object.entries(hashes)) {
      const value = normalizeHash(raw);
      if (!value) continue;
      const compact = algorithm.toLowerCase().replace(/[^a-z0-9]/gu, "");
      if (!indexed.has(compact)) indexed.set(compact, value);
    }
    for (const algorithm of priority) {
      const compact = algorithm.toLowerCase().replace(/[^a-z0-9]/gu, "");
      const value = indexed.get(compact);
      if (value) return { algorithm, value };
    }
    const fallback = indexed.get("hash");
    return fallback
      ? { algorithm: "hash", value: fallback }
      : { algorithm: "", value: "" };
  }

  function strongestHash(hashes) {
    return selectHash(hashes).value;
  }

  function a1111Hash(hashes) {
    return selectHash(hashes, Studio.constants.A1111_HASH_PRIORITY).value;
  }

  function randomId(prefix = "id") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  function utf8Encode(value) {
    return textEncoder.encode(String(value ?? ""));
  }

  function utf8Decode(value) {
    return textDecoder.decode(value instanceof Uint8Array ? value : new Uint8Array(value));
  }

  function latin1Encode(value) {
    const text = String(value ?? "");
    const output = new Uint8Array(text.length);
    let lossy = false;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code > 255) lossy = true;
      output[index] = code <= 255 ? code : 63;
    }
    return { bytes: output, lossy };
  }

  function latin1Decode(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    let output = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      output += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return output;
  }

  async function readBlobBytes(blob, start = 0, length = blob.size - start) {
    if (start < 0 || length < 0 || start + length > blob.size) {
      throw new RangeError("Requested byte range is outside the file.");
    }
    return new Uint8Array(await blob.slice(start, start + length).arrayBuffer());
  }

  async function yieldToBrowser() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = basename(filename);
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function createElement(tag, options = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(options)) {
      if (key === "className") element.className = value;
      else if (key === "text") element.textContent = String(value ?? "");
      else if (key === "dataset") Object.assign(element.dataset, value);
      else if (key === "attributes") {
        for (const [name, attrValue] of Object.entries(value)) {
          if (attrValue !== null && attrValue !== undefined) {
            element.setAttribute(name, String(attrValue));
          }
        }
      } else if (key in element) {
        try {
          element[key] = value;
        } catch {
          element.setAttribute(key, String(value));
        }
      } else {
        element.setAttribute(key, String(value));
      }
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined) continue;
      element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
  }

  function limitPreview(value, limit = 400) {
    const text = sanitizeText(value);
    return text.length <= limit ? text : `${text.slice(0, limit)}…`;
  }

  Studio.util = Object.freeze({
    a1111Hash,
    basename,
    clone,
    createElement,
    downloadBlob,
    extension,
    formatBytes,
    formatDimensions,
    integerOrNull,
    isPresent,
    latin1Decode,
    latin1Encode,
    limitPreview,
    normalizeComparable,
    normalizeHash,
    numberOrNull,
    outputName,
    positiveIdOrNull,
    randomId,
    readBlobBytes,
    safeComfyJsonParse,
    safeJsonParse,
    sameValue,
    sanitizeText,
    selectHash,
    stableStringify,
    strongestHash,
    utf8Decode,
    utf8Encode,
    withoutExtension,
    yieldToBrowser
  });
})();
