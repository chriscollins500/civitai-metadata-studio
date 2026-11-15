import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { normalizeBuildText } from "../scripts/release-attestation.mjs";
import Studio from "../src/engine.mjs";

test("release version matches the engine, companion, lockfile, OpenAPI, wiki, and built artifact", async () => {
  const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const [pkg, companion, lock, specification, wiki] = await Promise.all([
    json("../package.json"), json("../automation/package.json"), json("../automation/package-lock.json"),
    json("../docs/openapi.json"), json("../docs/wiki/manifest.json")
  ]);
  assert.deepEqual([
    Studio.constants.APP_VERSION, companion.version, lock.version, lock.packages[""].version,
    specification.info.version, wiki.applicationVersion
  ], Array(6).fill(pkg.version));
  const html = await readFile(new URL("../dist/civitai-metadata-studio.html", import.meta.url), "utf8");
  assert.ok(html.includes(`Version ${pkg.version} · `));
});

test("portable build is self-contained and its CSP hash matches", async () => {
  const html = await readFile(new URL("../dist/civitai-metadata-studio.html", import.meta.url), "utf8");
  const license = normalizeBuildText(await readFile(new URL("../LICENSE", import.meta.url), "utf8")).trim();
  assert.ok(html.includes(license), "The standalone download must carry the complete project license.");
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  const expected = html.match(/script-src 'sha256-([^']+)'/)?.[1];
  assert.ok(script);
  assert.equal(html.replace("<script>", "<SCRIPT>").replace("</script>", "</SCRIPT>").match(/<script>([\s\S]*?)<\/script>/i)?.[1], script);
  assert.equal(createHash("sha256").update(script, "utf8").digest("base64"), expected);
  assert.doesNotMatch(html, /<script[^>]+\bsrc=/i);
  assert.doesNotMatch(html, /<link[^>]+\brel=["']stylesheet/i);
  assert.match(html, /id="resourceAutoV1"/u);
  assert.match(html, /id="cacheDialog"/u);
  assert.match(html, /id="headerAddImagesButton"/u);
  assert.match(html, /id="headerClearQueueButton"/u);
  assert.match(html, /body\.working-state \.hero/u);
  assert.match(html, /Canonical AIR/u);
  assert.match(html, /Matched using/u);
  assert.match(html, /indexedDB\.open\(DATABASE_NAME, DATABASE_VERSION\)/u);
  assert.match(html, /className: "resource-link"/u);
  assert.match(html, /target: "_blank"/u);
  assert.match(html, /rel: "noopener noreferrer"/u);
});
