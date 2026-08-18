import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist/civitai-metadata-studio.html");
const html = await readFile(output, "utf8");
const failures = [];

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const cspMatch = html.match(/script-src 'sha256-([^']+)'/);
if (!scriptMatch || !cspMatch) {
  failures.push("portable build is missing its inline script or CSP hash");
} else {
  const actual = createHash("sha256").update(scriptMatch[1], "utf8").digest("base64");
  if (actual !== cspMatch[1]) failures.push("inline script CSP hash does not match");
}

const requiredText = [
  "Civitai Metadata Studio",
  "Automatic Civitai verification",
  "Original files are never changed",
  "Generation fields",
  "Resources",
  "Other metadata",
  "Save verified copy"
];
for (const text of requiredText) {
  if (!html.includes(text)) failures.push(`portable build is missing: ${text}`);
}

const forbidden = [
  /<script[^>]+\bsrc=/i,
  /<link[^>]+\brel=["']stylesheet/i,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /document\.write\s*\(/,
  /innerHTML\s*=/
];
for (const pattern of forbidden) {
  if (pattern.test(html)) failures.push(`portable build contains forbidden pattern ${pattern}`);
}

if (!/connect-src https:\/\/civitai\.com/.test(html)) {
  failures.push("CSP does not constrain network access to Civitai");
}
if (!/worker-src 'none'/.test(html)) {
  failures.push("CSP does not block unneeded workers");
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) failures.push(`portable build contains duplicate IDs: ${[...new Set(duplicates)].join(", ")}`);

for (const match of html.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
  const attributes = match[2];
  const id = attributes.match(/\bid="([^"]+)"/i)?.[1];
  const type = attributes.match(/\btype="([^"]+)"/i)?.[1]?.toLowerCase();
  if (!id || type === "hidden") continue;
  const hasLabel = new RegExp(`<label\\b[^>]*\\bfor="${id}"`, "i").test(html);
  const hasAriaLabel = /\baria-label="[^"]+"/i.test(attributes);
  const hasAriaLabelledBy = /\baria-labelledby="[^"]+"/i.test(attributes);
  if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy) failures.push(`form control #${id} has no accessible label`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Portable build verification passed.");
}
