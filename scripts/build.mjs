import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sources = [
  "src/core/constants.js",
  "src/core/util.js",
  "src/core/binary.js",
  "src/core/crc32.js",
  "src/core/sha256.js",
  "src/core/air.js",
  "src/core/civitai-contract.js",
  "src/core/a1111.js",
  "src/core/exif.js",
  "src/formats/png.js",
  "src/formats/jpeg.js",
  "src/formats/webp.js",
  "src/core/comfy.js",
  "src/core/canonical.js",
  "src/core/identity-cache.js",
  "src/core/civitai.js",
  "src/core/zip.js",
  "src/app/state.js",
  "src/app/ui.js",
  "src/app/main.js"
];

const [template, css, ...modules] = await Promise.all([
  readFile(join(root, "src/index.template.html"), "utf8"),
  readFile(join(root, "src/styles.css"), "utf8"),
  ...sources.map((path) => readFile(join(root, path), "utf8"))
]);

const banner = [
  "/* Civitai Metadata Studio",
  " * Generated portable build. Source modules and tests are retained in the project.",
  ` * Version 0.5.0 · ${new Date().toISOString().slice(0, 10)}`,
  " */"
].join("\n");
const script = `${banner}\n${modules.join("\n\n")}\n`;
const scriptHash = createHash("sha256").update(script, "utf8").digest("base64");
const html = template
  .replace("%%SCRIPT_HASH%%", scriptHash)
  .replace("%%STYLES%%", css)
  .replace("%%SCRIPT%%", script);

const output = join(root, "dist/civitai-metadata-studio.html");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, "utf8");
console.log(`Built ${output}`);
console.log(`${Buffer.byteLength(html, "utf8").toLocaleString()} bytes`);
console.log(`CSP sha256-${scriptHash}`);
