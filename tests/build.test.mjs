import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test("portable build is self-contained and its CSP hash matches", async () => {
  const html = await readFile(new URL("../dist/civitai-metadata-studio.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const expected = html.match(/script-src 'sha256-([^']+)'/)?.[1];
  assert.ok(script);
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
