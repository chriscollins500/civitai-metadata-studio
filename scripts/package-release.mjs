import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const htmlPath = join(root, "dist/civitai-metadata-studio.html");
const zipPath = join(root, "dist/civitai-metadata-studio.zip");
const entryName = "civitai-metadata-studio.html";
const html = await readFile(htmlPath);
const name = Buffer.from(entryName, "utf8");
const compressed = deflateRawSync(html, { level: 9 });

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosUtc(date) {
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2)
  };
}

function u16(value) {
  const output = Buffer.allocUnsafe(2);
  output.writeUInt16LE(value, 0);
  return output;
}

function u32(value) {
  const output = Buffer.allocUnsafe(4);
  output.writeUInt32LE(value >>> 0, 0);
  return output;
}

const buildDate = html.toString("utf8").match(/Version\s+\d+\.\d+\.\d+\s+·\s+(\d{4}-\d{2}-\d{2})/)?.[1] || "1980-01-01";
const dos = dosUtc(new Date(`${buildDate}T00:00:00Z`));
const crc = crc32(html);
const flags = 0x0800;
const method = 8;

const localHeader = Buffer.concat([
  u32(0x04034B50),
  u16(20),
  u16(flags),
  u16(method),
  u16(dos.time),
  u16(dos.date),
  u32(crc),
  u32(compressed.length),
  u32(html.length),
  u16(name.length),
  u16(0),
  name
]);

const centralHeader = Buffer.concat([
  u32(0x02014B50),
  u16(20),
  u16(20),
  u16(flags),
  u16(method),
  u16(dos.time),
  u16(dos.date),
  u32(crc),
  u32(compressed.length),
  u32(html.length),
  u16(name.length),
  u16(0),
  u16(0),
  u16(0),
  u16(0),
  u32(0),
  u32(0),
  name
]);

const centralOffset = localHeader.length + compressed.length;
const end = Buffer.concat([
  u32(0x06054B50),
  u16(0),
  u16(0),
  u16(1),
  u16(1),
  u32(centralHeader.length),
  u32(centralOffset),
  u16(0)
]);
const zip = Buffer.concat([localHeader, compressed, centralHeader, end]);

await mkdir(dirname(zipPath), { recursive: true });
await writeFile(zipPath, zip);

console.log(`Packaged ${zipPath}`);
console.log(`${zip.length.toLocaleString()} bytes`);
console.log(`HTML SHA256 ${createHash("sha256").update(html).digest("hex")}`);
console.log(`ZIP SHA256 ${createHash("sha256").update(zip).digest("hex")}`);
