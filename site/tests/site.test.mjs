import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, unlink, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, validateReleaseEvidence } from "../../scripts/build-site.mjs";
import { checkSite } from "../../scripts/check-site.mjs";
import { createSiteServer } from "../../scripts/serve-site.mjs";
import { publicFiles } from "../contract.mjs";
import { guides, pages, project } from "../content.mjs";
import Studio from "../../src/engine.mjs";

let output, preview;
const temporary = fileURLToPath(new URL("../../.tmp/", import.meta.url));
before(async () => {
  await mkdir(temporary, { recursive: true });
  output = await mkdtemp(resolve(temporary, "site-test-"));
  await buildSite(output);
  preview = await createSiteServer(output);
});
after(async () => {
  await preview?.close();
  if (output && resolve(output).startsWith(resolve(temporary, "site-test-"))) await rm(output, { recursive: true, force: true });
});
async function mutate(name, change, expected) {
  const path = resolve(output, name), original = await readFile(path);
  try {
    await writeFile(path, change(original.toString("utf8")));
    assert.match((await checkSite(output)).errors.join("\n"), expected);
  } finally { await writeFile(path, original); }
}
test("site packages the complete public hub and exact portable artifact", async () => {
  const result = await checkSite(output);
  assert.deepEqual(result.errors, []);
  assert.equal(result.files, 20); assert.equal(publicFiles.length, 20);
  assert.equal(result.manifest.guideCount, 28); assert.equal(guides.length, 28);
  assert.equal(result.manifest.pages.length, 7); assert.equal(pages.length, 7);
  assert.ok(result.localLinks > 200);
  assert.equal(result.manifest.version, JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")).version);
  assert.equal(result.manifest.portable.bytes, (await readFile(new URL("../../dist/civitai-metadata-studio.html", import.meta.url))).length);
});
test("site rejects modified hosted application bytes", async () => {
  await mutate("app/index.html", value => value + "\nchanged", /Hosted app differs/);
});
test("site rejects private or unreviewed deployment files", async () => {
  const path = resolve(output, "unreviewed.txt");
  try {
    await writeFile(path, "Synthetic unreviewed file.");
    assert.match((await checkSite(output)).errors.join("\n"), /deployment file/);
  } finally { await unlink(path); }
});
test("site rejects broken cross-page files, fragments, and unsafe protocols", async () => {
  for (const [link, pattern] of [
    [project.base + "missing/", /Broken local file link/],
    [project.base + "learn/#missing", /Broken local anchor/],
    ["javascript:alert(1)", /Unexpected link protocol/],
    ["/elsewhere/", /escapes the site/],
    [project.base + "%2e%2e/private.txt", /escapes the site/]
  ]) await mutate("community/index.html", value => value.replace("</main>", '<a href="' + link + '">Synthetic regression</a></main>'), pattern);
});
test("every page rejects inline scripts, event handlers, forms and unapproved code", async () => {
  for (const extra of ['<script>/* synthetic */</script>', '<p onclick="test()">text</p>', '<form></form>', '<iframe></iframe>', '<style>body{}</style>']) {
    await mutate("learn/index.html", value => value.replace("</main>", extra + "</main>"), /approved local script|No inline code/);
  }
});
test("site requires deny-by-default CSP and exact SRI on each page", async () => {
  await mutate("trust/index.html", value => value.replace("connect-src 'none'", "connect-src https:"), /CSP/);
  await mutate("downloads/index.html", value => value.replace('integrity="sha384-', 'integrity="changed-'), /SRI/);
});
test("site rejects changed assets and asset manifest receipt drift", async () => {
  await mutate("site.js", value => value + "\n/* changed */", /Asset differs|SRI/);
  await mutate("release.json", value => { const json = JSON.parse(value); json.assets["styles.css"].sha256 = "0".repeat(64); return JSON.stringify(json); }, /Asset differs/);
});
test("stable release evidence is separate from development build evidence", async () => {
  await mutate("stable-release.json", value => { const json = JSON.parse(value); json.sourceCommit = "a".repeat(40); return JSON.stringify(json); }, /reviewed receipt|Stable release manifest/);
  await mutate("release.json", value => { const json = JSON.parse(value); json.stableRelease.version = "9.9.9"; return JSON.stringify(json); }, /Stable release manifest/);
  const release = JSON.parse(await readFile(resolve(output, "stable-release.json"), "utf8"));
  for (const change of [{ ...release, sourceCommit: "main" }, { ...release, tag: "latest" }, { ...release, assets: release.assets.slice(1) }, { ...release, workflowRun: -1 }]) assert.throws(() => validateReleaseEvidence(change), /evidence/);
});
test("search and guide inventory cannot silently drift", async () => {
  await mutate("release.json", value => { const json = JSON.parse(value); json.guideCount = 27; return JSON.stringify(json); }, /Guide catalog/);
  await mutate("release.json", value => { const json = JSON.parse(value); json.pages.pop(); return JSON.stringify(json); }, /Page manifest/);
});
test("accessible labels, heading structure, duplicate IDs and canonical URLs are checked", async () => {
  await mutate("index.html", value => value.replace('id="main"', 'id="other"'), /missing|reference|anchor/);
  await mutate("index.html", value => value.replace("</main>", '<div id="main"></div></main>'), /Duplicate HTML IDs/);
  await mutate("index.html", value => value.replace("<h1>", "<h2>").replace("</h1>", "</h2>"), /one h1/);
  await mutate("index.html", value => value.replace('rel="canonical" href="', 'rel="canonical" href="wrong'), /canonical/);
  await mutate("learn/index.html", value => value.replace('type="search"', 'type="file"'), /labeled bounded local search/);
});
test("site has local-only scripting, optional theme-only storage and bounded assets", async () => {
  await mutate("site.js", value => value + "\nfetch('/test');", /must stay local/);
  await mutate("site.js", value => value.replaceAll("cms.site.theme", "undisclosed.key"), /theme preference/);
  await mutate("site.js", value => value + " ".repeat(32768), /performance budget/);
  await mutate("styles.css", value => value + '\n@import "https://example.invalid";', /must not import/);
});
test("learning sample demonstrates pixel-truth defaults and byte-preserving export", async () => {
  const bytes = await readFile(resolve(output, "assets/night-shift.png"));
  const file = new File([bytes], "night-shift.png", { type: "image/png" });
  const record = await Studio.canonical.createRecord(file, await Studio.canonical.inspectFile(file));
  assert.equal(record.fields.width.value, 768); assert.equal(record.fields.height.value, 512);
  assert.equal(record.resources.length, 0);
  assert.ok(bytes.includes(Buffer.from("Size: 1024x1024")));
  Studio.canonical.setField(record, "positivePrompt", "A synthetic edited learning recipe");
  const copy = Studio.canonical.rewrite(record);
  assert.equal((await Studio.integrity.verifyExport(record, copy)).preserved, true);
  const reopened = await Studio.canonical.createRecord(copy, await Studio.canonical.inspectFile(copy));
  assert.equal(reopened.fields.positivePrompt.value, "A synthetic edited learning recipe");
});
test("site rejects damaged sample or unsafe vector content", async () => {
  await mutate("assets/night-shift.png", () => "not an image", /sample PNG/);
  await mutate("assets/observatory.svg", value => value.replace("</svg>", "<script>/*synthetic*/</script></svg>"), /Unsafe vector/);
});
test("site build refuses output outside a dedicated generated directory", async () => {
  for (const path of [new URL("../../", import.meta.url), new URL("../../.tmp/", import.meta.url), new URL("../../dist/", import.meta.url)]) {
    await assert.rejects(() => buildSite(fileURLToPath(path)), /dedicated directory inside/);
  }
});
test("site build and check reject junction/symlink output traversal", async t => {
  const link = resolve(output, "linked"), target = resolve(output, "learn");
  try { await symlink(target, link, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) { t.skip("Host disallows creating test symlinks"); return; } throw error; }
  try {
    await assert.rejects(() => buildSite(output), /symlink|junction/);
    assert.match((await checkSite(output)).errors.join("\n"), /symlink|junction/);
  } finally { await unlink(link); }
});
test("preview serves exact assets and nested 404 recovery with project-base links", async () => {
  for (const page of pages) {
    const response = await fetch(preview.url + page.route);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal(await response.text(), await readFile(resolve(output, page.path), "utf8"));
  }
  const missing = await fetch(preview.url + "missing/deep/");
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /A little <em>off the map/);
  const head = await fetch(preview.url + "assets/night-shift.png", { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
  const post = await fetch(preview.url, { method: "POST", body: "synthetic" });
  assert.equal(post.status, 405);
});
test("preview never exposes arbitrary workspace files or accepts malformed paths", async () => {
  for (const path of ["../package.json", ".git/config", "src/engine.mjs", "%2e%2e%2fpackage.json", "%5c..%5cpackage.json"]) {
    const response = await fetch(preview.url + path);
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /"private": true|bearer/i);
  }
  assert.equal((await fetch(preview.url + "%ZZ")).status, 400);
});
