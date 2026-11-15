import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { siteOutput } from "./build-site.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function checkSite(output = siteOutput) {
  const errors = [], html = await readFile(resolve(output, "index.html"), "utf8");
  const manifest = JSON.parse(await readFile(resolve(output, "release.json"), "utf8"));
  const app = await readFile(resolve(output, "app/index.html"));
  const sourceApp = await readFile(new URL("../dist/civitai-metadata-studio.html", import.meta.url));
  if (!app.equals(sourceApp) || hash(app) !== manifest.portable.sha256 || app.length !== manifest.portable.bytes) errors.push("Hosted app differs from the verified portable source/manifest.");
  if (manifest.schema !== "civitai-metadata-studio.site" || manifest.schemaVersion !== 1) errors.push("Unknown site manifest.");
  const png = await readFile(resolve(output, "assets/social-preview.png"));
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.readUInt32BE(16) !== 1280 || png.readUInt32BE(20) !== 640 || png.length >= 1_000_000) errors.push("Invalid social-preview PNG.");
  for (const required of ['lang="en"', 'name="viewport"', 'href="#main"', 'id="main"', 'connect-src \'none\'', 'default-src \'none\'', 'form-action \'none\'', 'referrer', 'Illustrative workspace', 'not a forensic anonymizer', manifest.portable.sha256]) if (!html.includes(required)) errors.push(`Landing page is missing ${required}.`);
  if (/<script\b|<iframe\b|<form\b|<input\b/i.test(html)) errors.push("The landing page must have no scripts, embeds, or upload forms.");
  if (/%%[A-Z_]+%%/.test(html)) errors.push("Unexpanded site token.");
  const css = await readFile(resolve(output, "styles.css"), "utf8");
  if (/@import|url\s*\(/i.test(css)) errors.push("Landing styles must not import external assets.");
  if (!css.includes("prefers-reduced-motion") || !css.includes(":focus-visible") || !css.includes("max-width:760px")) errors.push("Missing responsive, focus, or reduced-motion contract.");
  let localLinks = 0;
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const link = match[1];
    if (link.startsWith("#")) { if (!html.includes(`id="${link.slice(1)}"`)) errors.push(`Broken local anchor ${link}.`); continue; }
    if (/^https:\/\//.test(link)) continue;
    if (/^(?:[a-z]+:|\/\/)/i.test(link)) { errors.push(`Unexpected link protocol: ${link}.`); continue; }
    const path = resolve(output, link.endsWith("/") ? link + "index.html" : link);
    const inside = relative(resolve(output), path);
    if (isAbsolute(inside) || inside.startsWith("..")) { errors.push(`Local link escapes the site: ${link}.`); continue; }
    try { await readFile(path); localLinks += 1; } catch { errors.push(`Broken local file link: ${link}.`); }
  }
  const inventory = [];
  async function walk(directory) { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = resolve(directory, entry.name); if (entry.isSymbolicLink()) errors.push("Site must not contain symlinks."); else if (entry.isDirectory()) await walk(path); else inventory.push(relative(output, path).replaceAll("\\", "/")); } }
  await walk(output);
  const expected = [".nojekyll", "index.html", "styles.css", "app/index.html", "assets/favicon.svg", "assets/social-preview.png", "release.json", "robots.txt", "sitemap.xml"];
  if (JSON.stringify([...inventory].sort()) !== JSON.stringify(expected.sort())) errors.push("Unexpected or missing deployment file: publish only the reviewed site allowlist.");
  return { errors, files: inventory.length, localLinks, manifest };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkSite();
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  console.log(`Site verified: ${result.files} allowlisted files, ${result.localLinks} local file links; hosted app byte-identical to portable ${result.manifest.version}.`);
}
