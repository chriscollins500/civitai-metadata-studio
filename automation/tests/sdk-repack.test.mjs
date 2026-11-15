import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { join, dirname, relative, sep, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { verifyMcpSdk, LEGACY_SPAWN_PACKAGES } from "../../scripts/verify-mcp-sdk.mjs";
import { REPACK_FILENAME, SDK_SPEC, PATCH_TARGETS } from "../../scripts/patch-mcp-sdk.mjs";

const actual = fileURLToPath(new URL("../", import.meta.url));
const json = async path => JSON.parse(await fs.readFile(path, "utf8"));
const save = (path, value) => fs.writeFile(path, JSON.stringify(value, null, 2) + "\n");
async function fixture(t) {
  const base = await fs.realpath(tmpdir()), directory = await fs.mkdtemp(join(base, "studio-sdk-repack-"));
  t.after(async () => {
    const path = relative(base, directory);
    assert.ok(path && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const root = join(directory, "automation"), sdk = join(root, "node_modules/@modelcontextprotocol/client");
  await fs.mkdir(dirname(sdk), { recursive: true }); await fs.mkdir(join(root, "vendor"));
  for (const name of ["package.json", "package-lock.json"]) await fs.copyFile(join(actual, name), join(root, name));
  for (const name of ["sdk-repack.json", REPACK_FILENAME]) await fs.copyFile(join(actual, "vendor", name), join(root, "vendor", name));
  await fs.cp(join(actual, "node_modules/@modelcontextprotocol/client"), sdk, { recursive: true });
  return { directory, root, sdk, profile: join(root, "vendor/sdk-repack.json"), lock: join(root, "package-lock.json") };
}

test("SDK repack verifies the complete installed package and all six absent dependencies", async () => {
  const result = await verifyMcpSdk();
  assert.equal(result.files, 102); assert.equal(result.packages, 14);
  assert.equal(LEGACY_SPAWN_PACKAGES.length, 6);
});

test("SDK repack accepts a clean isolated installation snapshot", async t => {
  const { root } = await fixture(t);
  assert.equal((await verifyMcpSdk({ automationRoot: root })).files, 102);
});

test("SDK repack rejects a changed archive before client import", async t => {
  const { root } = await fixture(t), path = join(root, "vendor", REPACK_FILENAME);
  const bytes = await fs.readFile(path); bytes[4] ^= 1; await fs.writeFile(path, bytes);
  await assert.rejects(verifyMcpSdk({ automationRoot: root }), /archive integrity mismatch/);
});

test("SDK repack rejects unknown provenance", async t => {
  const { root, profile } = await fixture(t), value = await json(profile);
  value.patch = "unreviewed"; await save(profile, value);
  await assert.rejects(verifyMcpSdk({ automationRoot: root }), /provenance/);
});

for (const target of PATCH_TARGETS) {
  test(`SDK repack refuses unreviewed module hashes for ${target.name}`, async t => {
    const { root, profile } = await fixture(t), value = await json(profile);
    value.files[`dist/${target.name}`] = "0".repeat(64); await save(profile, value);
    await assert.rejects(verifyMcpSdk({ automationRoot: root }), /module profile drift/);
  });
}

test("SDK repack rejects a changed lockfile integrity", async t => {
  const { root, lock } = await fixture(t), value = await json(lock);
  value.packages["node_modules/@modelcontextprotocol/client"].integrity = "sha512-wrong"; await save(lock, value);
  await assert.rejects(verifyMcpSdk({ automationRoot: root }), /lockfile pin\/integrity/);
});

test("SDK repack rejects a non-exact archive spec", async t => {
  const { root } = await fixture(t), path = join(root, "package.json"), value = await json(path);
  value.devDependencies["@modelcontextprotocol/client"] = SDK_SPEC + ".other"; await save(path, value);
  await assert.rejects(verifyMcpSdk({ automationRoot: root }), /exact local archive pin/);
});

test("SDK repack rejects reintroduced legacy lockfile dependencies", async t => {
  const { root, lock } = await fixture(t), value = await json(lock);
  value.packages["node_modules/which"] = { version: "2.0.2", dev: true }; await save(lock, value);
  await assert.rejects(verifyMcpSdk({ automationRoot: root }), /Legacy spawning dependency/);
});

for (const change of ["changed", "extra"]) {
  test(`SDK repack rejects ${change} installed files`, async t => {
    const { root, sdk } = await fixture(t);
    const name = change === "extra" ? "dist/unreviewed.mjs" : "dist/index.mjs";
    await fs.appendFile(join(sdk, name), "\n// unreviewed synthetic change\n");
    await assert.rejects(verifyMcpSdk({ automationRoot: root }), /file hashes differ/);
  });
}

test("SDK repack detects extraneous legacy directories even with the import tripwire active", async t => {
  const { root } = await fixture(t);
  await fs.mkdir(join(root, "node_modules/which"));
  await assert.rejects(verifyMcpSdk({ automationRoot: root }), /package directory remains/);
});

test("SDK repack rejects a vendor directory linked outside the allowed root", async t => {
  const { root, directory } = await fixture(t), outside = join(directory, "outside-vendor");
  await fs.rename(join(root, "vendor"), outside);
  await fs.symlink(outside, join(root, "vendor"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(verifyMcpSdk({ automationRoot: root }), /regular in-root files/);
});

test("SDK repack rejects a linked SDK installation", async t => {
  const { root, directory, sdk } = await fixture(t), outside = join(directory, "outside-sdk");
  await fs.rename(sdk, outside);
  await fs.symlink(outside, sdk, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(verifyMcpSdk({ automationRoot: root }), /must not be linked/);
});

test("SDK repack verifier CLI refuses alternate targets", () => {
  const cli = fileURLToPath(new URL("../../scripts/verify-mcp-sdk.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [cli, "--root", tmpdir()], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 1); assert.match(result.stderr, /No alternate SDK target/);
});
