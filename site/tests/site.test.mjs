import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "../../scripts/build-site.mjs";
import { checkSite } from "../../scripts/check-site.mjs";

let output;
before(async () => {
  const temporary = fileURLToPath(new URL("../../.tmp/", import.meta.url));
  await mkdir(temporary, { recursive: true });
  output = await mkdtemp(resolve(temporary, "site-test-"));
  await buildSite(output);
});
test("site packages only reviewed public files and the exact portable artifact", async () => {
  const result = await checkSite(output);
  assert.deepEqual(result.errors, []);
  assert.equal(result.files, 9);
  assert.equal(result.manifest.version, JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")).version);
  assert.equal(result.manifest.portable.bytes, (await readFile(new URL("../../dist/civitai-metadata-studio.html", import.meta.url))).length);
});
test("site rejects modified hosted application bytes", async () => {
  const path = resolve(output, "app/index.html"), original = await readFile(path);
  try {
    await writeFile(path, Buffer.concat([original, Buffer.from("\nchanged")]));
    assert.match((await checkSite(output)).errors.join("\n"), /Hosted app differs/);
  } finally { await writeFile(path, original); }
});
test("site rejects accidentally included private or unreviewed files", async () => {
  const path = resolve(output, "unreviewed.txt");
  try {
    await writeFile(path, "Synthetic unreviewed file, not personal data.");
    assert.match((await checkSite(output)).errors.join("\n"), /deployment file/);
  } finally { await unlink(path); }
});
test("site rejects broken local links and added landing-page scripts", async () => {
  const path = resolve(output, "index.html"), original = await readFile(path, "utf8");
  try {
    await writeFile(path, original.replace('href="app/"', 'href="missing/"') + "<script>/* synthetic */</script>");
    const errors = (await checkSite(output)).errors.join("\n");
    assert.match(errors, /Broken local file link/); assert.match(errors, /no scripts/);
  } finally { await writeFile(path, original); }
});
test("site build refuses an output outside its generated-output boundary", async () => {
  await assert.rejects(() => buildSite(fileURLToPath(new URL("../../", import.meta.url))), /dedicated directory inside/);
});
