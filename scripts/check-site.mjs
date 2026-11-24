import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { siteOutput, assertSiteOutput, validateReleaseEvidence } from "./build-site.mjs";
import { normalizeBuildText } from "./release-attestation.mjs";
import { publicFiles, publicAssets, budgets } from "../site/contract.mjs";
import { project, pages, guides, topics } from "../site/content.mjs";
import Studio from "../src/engine.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sri = bytes => "sha384-" + createHash("sha384").update(bytes).digest("base64");
const entities = Object.freeze({ amp: "&", quot: '"', "#39": "'", lt: "<", gt: ">" });
// Decode only our generator's five entities, exactly once. Replacement text is
// never rescanned: &amp;quot; must stay &quot;, not become a quote.
export const decodeSiteAttribute = text => text.replace(/&(amp|quot|#39|lt|gt);/gu, (_, entity) => entities[entity]);
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/gu)].map(([, key, value]) => [key, decodeSiteAttribute(value)]));
export async function checkSite(output = siteOutput) {
  const errors = [], inventory = [], bytes = new Map();
  try { await assertSiteOutput(output); }
  catch (error) { return { errors: [error.message], files: 0, localLinks: 0, manifest: {} }; }
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) errors.push("Site must not contain symlinks or junctions.");
      else if (entry.isDirectory()) await walk(path);
      else { const name = relative(output, path).replaceAll("\\", "/"); inventory.push(name); bytes.set(name, await readFile(path)); }
    }
  }
  await walk(output);
  if (JSON.stringify([...inventory].sort()) !== JSON.stringify([...publicFiles].sort())) errors.push("Unexpected or missing deployment file: publish only the reviewed site allowlist.");
  const text = path => bytes.get(path)?.toString("utf8") || "";
  const json = path => { try { return JSON.parse(text(path)); } catch { errors.push("Invalid JSON: " + path); return {}; } };
  const manifest = json("release.json");
  const sourceApp = await readFile(new URL("../dist/civitai-metadata-studio.html", import.meta.url));
  const app = bytes.get("app/index.html");
  if (!app?.equals(sourceApp) || hash(app || "") !== manifest.portable?.sha256 || app?.length !== manifest.portable?.bytes) errors.push("Hosted app differs from the verified portable source/manifest.");
  if (manifest.schema !== "civitai-metadata-studio.site" || manifest.schemaVersion !== 1 || manifest.repository !== project.repository) errors.push("Unknown site manifest.");
  const sourceDate = /\* Version ([\d.]+) · (\d{4}-\d{2}-\d{2})/u.exec(sourceApp.toString("utf8"));
  if (!sourceDate || manifest.version !== sourceDate[1] || manifest.portableBuildDate !== sourceDate[2]) errors.push("Hosted build version/date mismatch.");
  const zip = await readFile(new URL("../dist/civitai-metadata-studio.zip", import.meta.url));
  if (manifest.archive?.sha256 !== hash(zip) || manifest.archive?.bytes !== zip.length) errors.push("Hosted archive receipt mismatch.");
  const release = json("stable-release.json");
  try { validateReleaseEvidence(release); } catch (error) { errors.push(error.message); }
  const sourceRelease = JSON.parse(await readFile(new URL("../site/release-evidence.json", import.meta.url), "utf8"));
  if (JSON.stringify(release) !== JSON.stringify(sourceRelease)) errors.push("Stable release evidence differs from the reviewed receipt.");
  if (manifest.stableRelease?.version !== release.version || manifest.stableRelease?.tag !== release.tag || manifest.stableRelease?.sourceCommit !== release.sourceCommit || manifest.stableRelease?.evidence !== "stable-release.json") errors.push("Stable release manifest mismatch.");
  if (manifest.guideCount !== guides.length || new Set(guides.map(guide => guide.slug)).size !== 28 || guides.some(guide => !topics.includes(guide.topic))) errors.push("Guide catalog mismatch.");
  const wikiManifest = JSON.parse(await readFile(new URL("../docs/wiki/manifest.json", import.meta.url), "utf8"));
  const wikiPages = wikiManifest.pages.map(page => typeof page === "string" ? page : page.slug);
  if (guides.some(guide => !wikiPages.includes(guide.slug))) errors.push("Guide catalog is not synchronized with the wiki inventory.");
  if (JSON.stringify(manifest.pages) !== JSON.stringify(pages.map(({ key, path, route }) => ({ key, path, route })))) errors.push("Page manifest mismatch.");
  const sources = {
    "styles.css": "../site/styles.css", "site.js": "../site/site.js",
    "assets/favicon.svg": "../site/favicon.svg", "assets/social-preview.png": "../docs/assets/social-preview.png",
    "assets/observatory.svg": "../site/assets/observatory.svg", "assets/night-shift.png": "../site/assets/night-shift.png",
    "assets/openapi.json": "../docs/openapi.json"
  };
  if (JSON.stringify(Object.keys(manifest.assets || {}).sort()) !== JSON.stringify([...publicAssets].sort())) errors.push("Asset manifest inventory mismatch.");
  for (const name of publicAssets) {
    const content = bytes.get(name) || Buffer.alloc(0), receipt = manifest.assets?.[name];
    const source = await readFile(new URL(sources[name], import.meta.url));
    const normalized = /\.(?:css|js|svg|json)$/u.test(name) ? Buffer.from(normalizeBuildText(source.toString("utf8"))) : source;
    if (!content.equals(normalized) || receipt?.bytes !== content.length || receipt?.sha256 !== hash(content)) errors.push("Asset differs from source/manifest: " + name);
  }
  let localLinks = 0;
  const origin = new URL(project.url).origin;
  function checkLink(link, from) {
    if (/^(?!https:)[a-z][\w+.-]*:|^\/\//iu.test(link)) { errors.push("Unexpected link protocol: " + link); return; }
    let url;
    try { url = new URL(link, project.url + (from === "index.html" ? "" : from)); } catch { errors.push("Invalid local link: " + link); return; }
    if (/^https:/iu.test(link) && url.origin !== origin) return;
    if (!url.pathname.startsWith(project.base) || /(?:^|\/)\.\.(?:\/|$)|\\|%2e|%2f|%5c/iu.test(link)) { errors.push("Local link escapes the site: " + link); return; }
    let name;
    try { name = decodeURIComponent(url.pathname.slice(project.base.length)); } catch { errors.push("Invalid encoded local link: " + link); return; }
    if (!name || name.endsWith("/")) name += "index.html";
    if (!publicFiles.includes(name) || !bytes.has(name)) { errors.push("Broken local file link: " + link + " in " + from); return; }
    localLinks += 1;
    if (url.hash && name !== "app/index.html") {
      let id; try { id = decodeURIComponent(url.hash.slice(1)); } catch { id = ""; }
      if (![...text(name).matchAll(/\bid="([^"]+)"/gu)].some(match => match[1] === id)) errors.push("Broken local anchor: " + link + " in " + from);
    }
  }
  for (const page of pages) {
    const html = text(page.path);
    const required = ['lang="en"', 'name="viewport"', 'href="#main"', 'id="main"', 'tabindex="-1"', 'name="referrer" content="no-referrer"', 'aria-label="Main navigation"', 'aria-labelledby="search-heading"'];
    for (const value of required) if (!html.includes(value)) errors.push(page.path + " is missing " + value);
    if ([...html.matchAll(/<h1(?:\s|>)/gu)].length !== 1 || [...html.matchAll(/<main(?:\s|>)/gu)].length !== 1) errors.push("Every page must have one h1 and main: " + page.path);
    const csp = attrs(html.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/u)?.[0] || "").content || "";
    for (const directive of ["default-src 'none'", "style-src 'self'", "script-src 'self'", "img-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) if (!csp.split(";").some(value => value.trim() === directive)) errors.push("Unsafe/missing CSP directive: " + directive + " in " + page.path);
    const scripts = [...html.matchAll(/<\/?script\b[^>]*>/giu)];
    const approved = '<script src="' + project.base + 'site.js" integrity="' + sri(bytes.get("site.js") || "") + '" defer></script>';
    // This is a strict serialized-build contract, not an HTML sanitizer. Count
    // both tags and require the exact reviewed element; alternate valid end-tag
    // whitespace/casing and any inline body must fail rather than be filtered.
    if (scripts.length !== 2 || !html.includes(approved)) errors.push("Only the approved local script with SRI is allowed: " + page.path);
    const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/giu)];
    if (styles.length !== 1 || attrs(styles[0]?.[0] || "").href !== project.base + "styles.css" || attrs(styles[0]?.[0] || "").integrity !== sri(bytes.get("styles.css") || "")) errors.push("Stylesheet SRI mismatch: " + page.path);
    if (/<(?:iframe|form|embed|object|style|base)\b|<[^>]+\s(?:on[\w]+|style)\s*=/iu.test(html)) errors.push("No inline code, forms, or embedded content: " + page.path);
    for (const input of html.matchAll(/<input\b[^>]*>/giu)) {
      const item = attrs(input[0]);
      if (item.type !== "search" || item.maxlength !== "200" || !html.includes('for="' + item.id + '"')) errors.push("Only labeled bounded local search inputs are allowed: " + page.path);
    }
    if (/%%[A-Z_]+%%|file:\/\/\/|[A-Z]:\\(?:Users|Codex)\\/iu.test(html)) errors.push("Unexpanded token or private filesystem path: " + page.path);
    const ids = [...html.matchAll(/\bid="([^"]+)"/gu)].map(match => match[1]);
    if (new Set(ids).size !== ids.length) errors.push("Duplicate HTML IDs: " + page.path);
    for (const reference of html.matchAll(/\b(?:aria-labelledby|aria-describedby|aria-controls|for)="([^"]+)"/gu)) for (const id of reference[1].split(/\s+/u)) if (!ids.includes(id)) errors.push("Broken accessible reference: " + id + " in " + page.path);
    const canonical = attrs(html.match(/<link rel="canonical"[^>]*>/u)?.[0] || "").href;
    if (canonical !== project.url + page.route || !html.includes('property="og:url" content="' + canonical + '"')) errors.push("Page canonical/social URL mismatch: " + page.path);
    for (const link of html.matchAll(/\b(?:href|src)="([^"]+)"/gu)) checkLink(decodeSiteAttribute(link[1]), page.path);
    if (Buffer.byteLength(html) > budgets.page) errors.push("Page exceeds performance budget: " + page.path);
  }
  const css = text("styles.css"), script = text("site.js");
  if (/@import|url\s*\(/iu.test(css)) errors.push("Styles must not import assets.");
  for (const required of ["prefers-reduced-motion", ":focus-visible", "forced-colors", "max-width:760px"]) if (!css.includes(required)) errors.push("Missing responsive/accessibility style contract: " + required);
  if (/\b(?:fetch|XMLHttpRequest|sendBeacon|eval|Function|WebSocket|EventSource|indexedDB|sessionStorage)\b|\binnerHTML\b|serviceWorker|https?:\/\//u.test(script)) errors.push("The optional site script must stay local and cannot evaluate HTML/code.");
  const storageKeys = [...script.matchAll(/localStorage\.(?:getItem|setItem)\("([^"]+)"/gu)].map(match => match[1]);
  if (storageKeys.length !== 2 || storageKeys.some(key => key !== "cms.site.theme")) errors.push("Only the disclosed theme preference may be stored.");
  if ((bytes.get("site.js")?.length || 0) > budgets.javascript || (bytes.get("styles.css")?.length || 0) > budgets.css) errors.push("Script/style performance budget exceeded.");
  if ([...bytes.values()].reduce((sum, value) => sum + value.length, 0) > budgets.total) errors.push("Site performance budget exceeded.");
  for (const name of ["assets/favicon.svg", "assets/observatory.svg"]) if (/<(?:script|foreignObject)\b|\son\w+=|(?:href|src)=["'](?:https?:|\/\/|data:)/iu.test(text(name))) errors.push("Unsafe vector asset: " + name);
  const social = bytes.get("assets/social-preview.png");
  if (!social || social.length < 24 || social.readUInt32BE(16) !== 1280 || social.readUInt32BE(20) !== 640 || social.length >= 1_000_000) errors.push("Invalid social-preview PNG.");
  try {
    const sample = new File([bytes.get("assets/night-shift.png") || ""], "night-shift.png", { type: "image/png" });
    const record = await Studio.canonical.createRecord(sample, await Studio.canonical.inspectFile(sample));
    if (record.fields.width.value !== 768 || record.fields.height.value !== 512 || record.resources.length !== 0 || !record.fields.positivePrompt.value.includes("Synthetic learning recipe")) errors.push("Learning sample must be synthetic, 768 by 512, with no resource identity claims.");
    if (!Buffer.from(await sample.arrayBuffer()).includes(Buffer.from("Size: 1024x1024"))) errors.push("Learning sample must retain the deliberately wrong generation size.");
  } catch { errors.push("Invalid learning sample PNG."); }
  if (!text("robots.txt").includes(project.url + "sitemap.xml")) errors.push("Missing sitemap discovery.");
  const sitemap = [...text("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => match[1]);
  if (JSON.stringify(sitemap) !== JSON.stringify([...pages.filter(page => page.key !== "notFound").map(page => project.url + page.route), project.url + "app/"])) errors.push("Sitemap does not match public routes.");
  return { errors, files: inventory.length, localLinks, manifest };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkSite();
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  console.log("Site verified: " + result.files + " allowlisted files, " + result.localLinks + " local links; 7 pages, 28 guides; hosted app byte-identical to portable " + result.manifest.version + ".");
}
