import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RELEASE_ASSETS, buildDate, recordedBuildEpoch, validateReleaseTag, assetManifest, validatePublishedRelease, compareAssets } from "../scripts/release-attestation.mjs";

test("release dates honor SOURCE_DATE_EPOCH without changing the default UTC date", () => {
  assert.equal(buildDate(undefined, new Date("2026-11-14T23:59:59Z")), "2026-11-14");
  assert.equal(buildDate("1794614400"), "2026-11-14");
  for (const value of ["", "NaN", "-1", "123.4", "Infinity", "9".repeat(30)]) assert.throws(() => buildDate(value), /SOURCE_DATE_EPOCH/);
});

test("release preparation accepts only the exact version and a real recorded date", () => {
  assert.equal(validateReleaseTag("v1.0.0", "1.0.0"), "v1.0.0");
  for (const tag of ["main", "v1.0.1", "v1.0.0\n", "v1.0.0; echo bad", "../../v1.0.0"]) assert.throws(() => validateReleaseTag(tag, "1.0.0"));
  assert.equal(buildDate(recordedBuildEpoch("Version 1.0.0 · 2026-11-14", "1.0.0")), "2026-11-14");
  assert.throws(() => recordedBuildEpoch("Version 0.5.0 · 2026-11-14", "1.0.0"));
  assert.throws(() => recordedBuildEpoch("Version 1.0.0 · 2026-02-29", "1.0.0"));
  assert.throws(() => recordedBuildEpoch("Version 1.0.0 · 1969-01-01", "1.0.0"));
});

test("published release metadata must match every fixed asset before downloads or signing", () => {
  const manifest = Object.fromEntries(RELEASE_ASSETS.map((name) => [name, { size: 12, digest: `sha256:${"a".repeat(64)}` }]));
  const release = { tag_name: "v1.0.0", draft: false, assets: RELEASE_ASSETS.map((name) => ({ name, state: "uploaded", ...manifest[name] })) };
  assert.doesNotThrow(() => validatePublishedRelease(release, "v1.0.0", manifest));
  assert.throws(() => validatePublishedRelease({ ...release, draft: true }, "v1.0.0", manifest));
  assert.throws(() => validatePublishedRelease(release, "v1.0.1", manifest));
  assert.throws(() => validatePublishedRelease({ ...release, assets: release.assets.slice(1) }, "v1.0.0", manifest));
  const changed = structuredClone(release); changed.assets[0].digest = `sha256:${"b".repeat(64)}`;
  assert.throws(() => validatePublishedRelease(changed, "v1.0.0", manifest), /differs/);
});

test("published downloads must be byte-identical to the tested artifacts", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "studio-attestation-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const built = join(directory, "built"), downloaded = join(directory, "downloaded");
  await mkdir(built); await mkdir(downloaded);
  for (const name of RELEASE_ASSETS) { await writeFile(join(built, name), `fixture ${name}`); await writeFile(join(downloaded, name), `fixture ${name}`); }
  const manifest = await assetManifest(built);
  assert.equal(Object.keys(manifest).length, 3);
  await compareAssets(built, downloaded);
  await writeFile(join(downloaded, RELEASE_ASSETS[0]), "changed bytes");
  await assert.rejects(compareAssets(built, downloaded), /Published bytes differ/);
});

test("attestations are gated by both platforms and never sign pull-request or ordinary branch builds", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(workflow, /needs: verify/u);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(workflow, /github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)/u);
  assert.match(workflow, /--source-digest "\$GITHUB_SHA"/u);
  const [testing, signing] = workflow.split("  attest:\n");
  assert.doesNotMatch(testing, /id-token: write|attestations: write/u);
  assert.match(signing, /id-token: write/u);
  assert.doesNotMatch(signing, /contents: write/u);
  assert.match(signing, /--deny-self-hosted-runners/u);
  for (const name of RELEASE_ASSETS) assert.ok(signing.includes(`dist/${name}`));
});
