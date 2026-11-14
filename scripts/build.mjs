import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDate } from "./release-attestation.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const engine = await readFile(join(root, "src/engine.mjs"), "utf8");
const sources = [...engine.matchAll(/^import "\.\/(.+)";/gm)].map((match) => `src/${match[1]}`);
sources.push("src/app/ui.js", "src/app/main.js");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

const [template, css, license, ...modules] = await Promise.all([
  readFile(join(root, "src/index.template.html"), "utf8"),
  readFile(join(root, "src/styles.css"), "utf8"),
  readFile(join(root, "LICENSE"), "utf8"),
  ...sources.map((path) => readFile(join(root, path), "utf8"))
]);

const banner = [
  "/* Civitai Metadata Studio",
  " * Generated portable build. Source modules and tests are retained in the project.",
  ` * Version ${pkg.version} · ${buildDate(process.env.SOURCE_DATE_EPOCH)}`,
  " */"
].join("\n");
const script = `${banner}\n${modules.join("\n\n")}\n`;
const scriptHash = createHash("sha256").update(script, "utf8").digest("base64");
const html = template
  .replace("%%LICENSE%%", license.trim())
  .replace("%%SCRIPT_HASH%%", scriptHash)
  .replace("%%STYLES%%", css)
  .replace("%%SCRIPT%%", script);

const output = join(root, "dist/civitai-metadata-studio.html");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, "utf8");
console.log(`Built ${output}`);
console.log(`${Buffer.byteLength(html, "utf8").toLocaleString()} bytes`);
console.log(`CSP sha256-${scriptHash}`);
