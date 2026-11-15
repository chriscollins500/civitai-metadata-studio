import { readFile, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Maintainer-only asset rendering. ImageMagick is shared tooling, not an app or
// CI dependency. Reuse the existing vector artwork instead of a new art system.
const directory = new URL("../docs/assets/", import.meta.url);
const hero = await readFile(new URL("readme-hero.svg", directory), "utf8");
const social = hero.replace('width="1600" height="720" viewBox="0 0 1600 720"', 'width="1280" height="640" viewBox="0 0 1600 800"')
  .replace(/(<svg[^>]+>)/, '$1\n<rect width="1600" height="800" fill="#0d1713"/><g transform="translate(0 40)">')
  .replace('font-size="17" font-weight="700"', 'font-size="14" font-weight="700"')
  .replace("</svg>", "</g></svg>");
if (social === hero || !social.includes('viewBox="0 0 1600 800"')) throw new Error("Hero structure changed; review social artwork before rendering.");
const svg = fileURLToPath(new URL("social-preview.svg", directory));
const png = fileURLToPath(new URL("social-preview.png", directory));
await writeFile(svg, social, "utf8");
const result = spawnSync("magick", ["-background", "#0d1713", svg, "-strip", "PNG24:" + png], { encoding: "utf8", windowsHide: true });
if (result.status !== 0) throw new Error(result.stderr || "Install/use shared ImageMagick to render the social-preview source.");
const bytes = await readFile(png);
if (bytes.readUInt32BE(16) !== 1280 || bytes.readUInt32BE(20) !== 640 || (await stat(png)).size >= 1_000_000) throw new Error("Social image must be 1280×640 and under 1 MB.");
console.log(`Rendered social-preview.png: 1280×640, ${bytes.length.toLocaleString("en-US")} bytes.`);
