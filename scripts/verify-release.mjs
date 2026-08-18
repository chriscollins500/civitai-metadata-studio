import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const htmlPath = join(root, "dist/civitai-metadata-studio.html");
const zipPath = join(root, "dist/civitai-metadata-studio.zip");
const expectedName = "civitai-metadata-studio.html";
const [html, zip] = await Promise.all([readFile(htmlPath), readFile(zipPath)]);

function fail(message) {
  throw new Error(`Release verification failed: ${message}`);
}

if (zip.length < 98 || zip.readUInt32LE(0) !== 0x04034B50) fail("ZIP local header is missing");
const flags = zip.readUInt16LE(6);
const method = zip.readUInt16LE(8);
const compressedSize = zip.readUInt32LE(18);
const uncompressedSize = zip.readUInt32LE(22);
const nameLength = zip.readUInt16LE(26);
const extraLength = zip.readUInt16LE(28);
const nameStart = 30;
const nameEnd = nameStart + nameLength;
const dataStart = nameEnd + extraLength;
const dataEnd = dataStart + compressedSize;

if ((flags & 0x0800) === 0) fail("ZIP entry is not marked as UTF-8");
if (method !== 8) fail("ZIP entry is not deflated");
if (zip.subarray(nameStart, nameEnd).toString("utf8") !== expectedName) fail("ZIP entry name is unexpected");
if (uncompressedSize !== html.length) fail("ZIP entry size does not match the standalone HTML");
if (dataEnd > zip.length) fail("ZIP compressed data exceeds the archive bounds");

const archivedHtml = inflateRawSync(zip.subarray(dataStart, dataEnd));
if (!archivedHtml.equals(html)) fail("archived HTML is not byte-identical to the standalone HTML");
if (zip.readUInt32LE(dataEnd) !== 0x02014B50) fail("ZIP central directory is missing or not adjacent to the entry");

const centralNameLength = zip.readUInt16LE(dataEnd + 28);
const centralExtraLength = zip.readUInt16LE(dataEnd + 30);
const centralCommentLength = zip.readUInt16LE(dataEnd + 32);
const centralSize = 46 + centralNameLength + centralExtraLength + centralCommentLength;
const endOffset = dataEnd + centralSize;
if (zip.readUInt32LE(endOffset) !== 0x06054B50) fail("ZIP end-of-central-directory record is missing");
if (zip.readUInt16LE(endOffset + 8) !== 1 || zip.readUInt16LE(endOffset + 10) !== 1) fail("ZIP must contain exactly one entry");
if (zip.readUInt16LE(endOffset + 20) !== 0 || endOffset + 22 !== zip.length) fail("ZIP has an unexpected comment or trailing data");

console.log("Release ZIP verification passed.");
console.log(`HTML ${html.length.toLocaleString()} bytes · SHA256 ${createHash("sha256").update(html).digest("hex")}`);
console.log(`ZIP ${zip.length.toLocaleString()} bytes · SHA256 ${createHash("sha256").update(zip).digest("hex")}`);
