import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const siteOutput = resolve(root, ".tmp/pages");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function buildSite(output = siteOutput) {
  const allowed = relative(resolve(root, ".tmp"), resolve(output));
  if (!allowed || isAbsolute(allowed) || allowed === ".." || allowed.startsWith("../") || allowed.startsWith("..\\")) throw new Error("Site output must be a dedicated directory inside .tmp.");
  for (const script of ["verify-build.mjs", "verify-release.mjs"]) {
    const check = spawnSync(process.execPath, [resolve(root, "scripts", script)], { cwd: root, encoding: "utf8", windowsHide: true });
    if (check.status !== 0) throw new Error(check.stdout + check.stderr);
  }
  const [html, zip, pkgText, template] = await Promise.all([
    readFile(resolve(root, "dist/civitai-metadata-studio.html")), readFile(resolve(root, "dist/civitai-metadata-studio.zip")),
    readFile(resolve(root, "package.json"), "utf8"), readFile(resolve(root, "site/index.html"), "utf8")
  ]);
  const version = JSON.parse(pkgText).version;
  const date = /\* Version ([\d.]+) · (\d{4}-\d{2}-\d{2})/.exec(html.toString("utf8"));
  if (!date || date[1] !== version) throw new Error("Portable artifact and package version disagree.");
  await mkdir(resolve(output, "assets"), { recursive: true });
  await mkdir(resolve(output, "app"), { recursive: true });
  const manifest = { schema: "civitai-metadata-studio.site", schemaVersion: 1, version, portableBuildDate: date[2],
    portable: { path: "app/index.html", bytes: html.length, sha256: digest(html) },
    archive: { filename: "civitai-metadata-studio.zip", bytes: zip.length, sha256: digest(zip) },
    repository: "https://github.com/chriscollins500/civitai-metadata-studio", source: "Verified portable artifact; copied without transformation." };
  const rendered = template.replaceAll("%%APP_VERSION%%", version).replaceAll("%%APP_SHA256%%", manifest.portable.sha256);
  if (/%%[A-Z_]+%%/.test(rendered)) throw new Error("Unexpanded site placeholder.");
  await Promise.all([
    writeFile(resolve(output, "index.html"), rendered, "utf8"),
    writeFile(resolve(output, "app/index.html"), html),
    copyFile(resolve(root, "site/styles.css"), resolve(output, "styles.css")),
    copyFile(resolve(root, "site/favicon.svg"), resolve(output, "assets/favicon.svg")),
    copyFile(resolve(root, "docs/assets/social-preview.png"), resolve(output, "assets/social-preview.png")),
    writeFile(resolve(output, "release.json"), JSON.stringify(manifest, null, 2) + "\n"),
    writeFile(resolve(output, ".nojekyll"), ""),
    writeFile(resolve(output, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: https://chriscollins500.github.io/civitai-metadata-studio/sitemap.xml\n"),
    writeFile(resolve(output, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://chriscollins500.github.io/civitai-metadata-studio/</loc></url></urlset>\n')
  ]);
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await buildSite();
  console.log(`Site assembled in .tmp/pages. App ${manifest.version}: ${manifest.portable.bytes.toLocaleString("en-US")} bytes; SHA256 ${manifest.portable.sha256}`);
}
