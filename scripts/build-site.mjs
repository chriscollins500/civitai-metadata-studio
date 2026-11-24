import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, lstat, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBuildText } from "./release-attestation.mjs";
import { project, pages, guides } from "../site/content.mjs";
import { renderLayout } from "../site/layout.mjs";
import { renderPage } from "../site/pages.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
export const siteOutput = resolve(root, ".tmp/pages");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const sri = bytes => "sha384-" + createHash("sha384").update(bytes).digest("base64");

export async function assertSiteOutput(output) {
  const temporary = resolve(root, ".tmp"), absolute = resolve(output);
  const inside = relative(temporary, absolute);
  if (!inside || isAbsolute(inside) || inside === ".." || inside.startsWith("../") || inside.startsWith("..\\")) throw new Error("Site output must be a dedicated directory inside .tmp.");
  await mkdir(temporary, { recursive: true });
  for (const path of [temporary, ...inside.split(/[\\/]/u).map((_, index, parts) => resolve(temporary, ...parts.slice(0, index + 1)))]) {
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error("Site output must not traverse a symlink or junction."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  async function rejectLinks(directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error("Site output must not contain symlinks or junctions.");
      if (entry.isDirectory()) await rejectLinks(resolve(directory, entry.name));
    }
  }
  await rejectLinks(absolute);
  return absolute;
}
export function validateReleaseEvidence(release) {
  if (release.schemaVersion !== 1 || !/^\d+\.\d+\.\d+$/u.test(release.version) || release.tag !== "v" + release.version || !/^[a-f0-9]{40}$/u.test(release.sourceCommit) || !/^\d{4}-\d{2}-\d{2}$/u.test(release.buildDate)) throw new Error("Invalid stable release evidence.");
  const names = ["civitai-metadata-studio.html", "civitai-metadata-studio.zip", "SHA256SUMS.txt"];
  if (release.assets?.length !== names.length || !names.every(name => release.assets.filter(asset => asset.filename === name && Number.isSafeInteger(asset.bytes) && asset.bytes > 0 && /^[a-f0-9]{64}$/u.test(asset.sha256)).length === 1)) throw new Error("Invalid stable release asset evidence.");
  if (!Number.isSafeInteger(release.workflowRun) || release.workflowRun <= 0) throw new Error("Invalid release workflow evidence.");
  return release;
}
export async function buildSite(output = siteOutput) {
  output = await assertSiteOutput(output);
  for (const script of ["verify-build.mjs", "verify-release.mjs"]) {
    const check = spawnSync(process.execPath, [resolve(root, "scripts", script)], { cwd: root, encoding: "utf8", windowsHide: true });
    if (check.status !== 0) throw new Error(check.stdout + check.stderr);
  }
  const [html, zip, pkgText, releaseText, scriptText, cssText] = await Promise.all([
    readFile(resolve(root, "dist/civitai-metadata-studio.html")), readFile(resolve(root, "dist/civitai-metadata-studio.zip")),
    readFile(resolve(root, "package.json"), "utf8"), readFile(resolve(root, "site/release-evidence.json"), "utf8"),
    readFile(resolve(root, "site/site.js"), "utf8"), readFile(resolve(root, "site/styles.css"), "utf8")
  ]);
  const version = JSON.parse(pkgText).version;
  const date = /\* Version ([\d.]+) · (\d{4}-\d{2}-\d{2})/u.exec(html.toString("utf8"));
  if (!date || date[1] !== version) throw new Error("Portable artifact and package version disagree.");
  const release = validateReleaseEvidence(JSON.parse(releaseText));
  const script = normalizeBuildText(scriptText), css = normalizeBuildText(cssText);
  const assetSources = {
    "styles.css": Buffer.from(css), "site.js": Buffer.from(script),
    "assets/favicon.svg": Buffer.from(normalizeBuildText(await readFile(resolve(root, "site/favicon.svg"), "utf8"))),
    "assets/social-preview.png": await readFile(resolve(root, "docs/assets/social-preview.png")),
    "assets/observatory.svg": Buffer.from(normalizeBuildText(await readFile(resolve(root, "site/assets/observatory.svg"), "utf8"))),
    "assets/night-shift.png": await readFile(resolve(root, "site/assets/night-shift.png")),
    "assets/openapi.json": Buffer.from(normalizeBuildText(await readFile(resolve(root, "docs/openapi.json"), "utf8")))
  };
  const manifest = {
    schema: "civitai-metadata-studio.site", schemaVersion: 1, version, portableBuildDate: date[2],
    portable: { path: "app/index.html", bytes: html.length, sha256: digest(html) },
    archive: { filename: "civitai-metadata-studio.zip", bytes: zip.length, sha256: digest(zip) },
    repository: project.repository, source: "Verified portable artifact; copied without transformation.",
    stableRelease: { version: release.version, tag: release.tag, sourceCommit: release.sourceCommit, evidence: "stable-release.json" },
    guideCount: guides.length,
    pages: pages.map(({ key, path, route }) => ({ key, path, route })),
    assets: Object.fromEntries(Object.entries(assetSources).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: digest(bytes) }]))
  };
  const writes = { ...assetSources, "app/index.html": html };
  for (const page of pages) {
    const rendered = renderLayout(page, renderPage(page, { release, manifest }), { scriptIntegrity: sri(script), styleIntegrity: sri(css), release });
    if (/%%[A-Z_]+%%/u.test(rendered)) throw new Error("Unexpanded site placeholder.");
    writes[page.path] = rendered;
  }
  writes["release.json"] = JSON.stringify(manifest, null, 2) + "\n";
  writes["stable-release.json"] = JSON.stringify(release, null, 2) + "\n";
  writes[".nojekyll"] = "";
  writes["robots.txt"] = "User-agent: *\nAllow: /\nSitemap: " + project.url + "sitemap.xml\n";
  writes["sitemap.xml"] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + [...pages.filter(page => page.key !== "notFound").map(page => page.route), "app/"].map(route => "<url><loc>" + project.url + route + "</loc></url>").join("") + "</urlset>\n";
  for (const [path, value] of Object.entries(writes)) {
    await mkdir(dirname(resolve(output, path)), { recursive: true });
    await writeFile(resolve(output, path), value);
  }
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await buildSite();
  console.log("Site assembled in .tmp/pages: " + manifest.pages.length + " hub pages; " + manifest.guideCount + " guides. App " + manifest.version + ": " + manifest.portable.bytes.toLocaleString("en-US") + " bytes; SHA256 " + manifest.portable.sha256);
}
