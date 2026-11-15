import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { patchMcpSdk, PATCH_TARGETS, SDK_VERSION, SDK_SPEC } from "../../scripts/patch-mcp-sdk.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const cli = fileURLToPath(new URL("../../scripts/patch-mcp-sdk.mjs", import.meta.url));
const actual = fileURLToPath(new URL("../node_modules/@modelcontextprotocol/client/", import.meta.url));
async function originalBytes(target) {
  const bytes = await fs.readFile(join(actual, "dist", target.name));
  if (hash(bytes) === target.originalSHA256) return bytes;
  assert.equal(hash(bytes), target.patchedSHA256, "The installed SDK must be a reviewed state");
  let text = bytes.toString("utf8");
  for (const edit of [...target.edits].reverse()) text = text.replace(edit.to, edit.from);
  const restored = Buffer.from(text);
  assert.equal(hash(restored), target.originalSHA256);
  return restored;
}
async function fixture(t, { packageLink = false, distLink = false } = {}) {
  const base = await fs.realpath(tmpdir());
  const directory = await fs.mkdtemp(join(base, "studio-sdk-patch-"));
  t.after(async () => {
    const path = relative(base, directory);
    assert.ok(path && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const root = join(directory, "automation");
  const packageRoot = join(root, "node_modules/@modelcontextprotocol/client");
  await fs.mkdir(dirname(packageRoot), { recursive: true });
  await fs.writeFile(join(root, "package.json"), JSON.stringify({ devDependencies: { "@modelcontextprotocol/client": SDK_SPEC } }));
  const realPackage = packageLink ? join(directory, "linked-sdk") : packageRoot;
  const dist = distLink ? join(directory, "linked-dist") : join(realPackage, "dist");
  await fs.mkdir(realPackage, { recursive: true }); await fs.mkdir(dist, { recursive: true });
  await fs.writeFile(join(realPackage, "package.json"), JSON.stringify({ name: "@modelcontextprotocol/client", version: SDK_VERSION }));
  for (const target of PATCH_TARGETS) await fs.writeFile(join(dist, target.name), await originalBytes(target));
  if (packageLink) await fs.symlink(realPackage, packageRoot, process.platform === "win32" ? "junction" : "dir");
  if (distLink) await fs.symlink(dist, join(realPackage, "dist"), process.platform === "win32" ? "junction" : "dir");
  return { root, packageRoot, realPackage, dist };
}
async function hashes(dist) { return Promise.all(PATCH_TARGETS.map(async target => hash(await fs.readFile(join(dist, target.name))))); }
const originals = PATCH_TARGETS.map(target => target.originalSHA256);
const patched = PATCH_TARGETS.map(target => target.patchedSHA256);

test("managed SDK patch rejects --check on pristine files without changing them", async t => {
  const { root, dist } = await fixture(t);
  await assert.rejects(patchMcpSdk({ automationRoot: root, checkOnly: true }), /not prepared/);
  assert.deepEqual(await hashes(dist), originals);
});

test("managed SDK patch applies both pinned formats and verifies their exact hashes", async t => {
  const { root, dist, packageRoot } = await fixture(t);
  const result = await patchMcpSdk({ automationRoot: root });
  assert.equal(result.changed.length, 2);
  assert.deepEqual(await hashes(dist), patched);
  assert.equal((await patchMcpSdk({ automationRoot: root, checkOnly: true })).changed.length, 0);
  assert.deepEqual((await fs.readdir(packageRoot)).sort(), ["dist", "package.json"]);
  assert.deepEqual((await fs.readdir(dist)).sort(), ["stdio.cjs", "stdio.mjs"]);
});

test("managed SDK patch is idempotent without rewriting verified modules", async t => {
  const { root, dist } = await fixture(t);
  await patchMcpSdk({ automationRoot: root });
  const before = await Promise.all(PATCH_TARGETS.map(target => fs.stat(join(dist, target.name))));
  assert.deepEqual((await patchMcpSdk({ automationRoot: root })).changed, []);
  const after = await Promise.all(PATCH_TARGETS.map(target => fs.stat(join(dist, target.name))));
  assert.deepEqual(after.map(stat => stat.mtimeMs), before.map(stat => stat.mtimeMs));
});

test("managed SDK patch repairs a known partial application", async t => {
  const { root, dist } = await fixture(t);
  await patchMcpSdk({ automationRoot: root });
  await fs.writeFile(join(dist, PATCH_TARGETS[1].name), await originalBytes(PATCH_TARGETS[1]));
  assert.deepEqual((await patchMcpSdk({ automationRoot: root })).changed, ["dist/stdio.cjs"]);
  assert.deepEqual(await hashes(dist), patched);
});

test("managed SDK patch refuses a non-exact project pin", async t => {
  const { root, dist } = await fixture(t);
  await fs.writeFile(join(root, "package.json"), JSON.stringify({ devDependencies: { "@modelcontextprotocol/client": `^${SDK_VERSION}` } }));
  await assert.rejects(patchMcpSdk({ automationRoot: root }), /exact client pin/);
  assert.deepEqual(await hashes(dist), originals);
});

for (const [name, value] of [["version", "2.5.0"], ["name", "different-package"]]) {
  test(`managed SDK patch refuses an unexpected installed ${name}`, async t => {
    const { root, dist, packageRoot } = await fixture(t);
    await fs.writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@modelcontextprotocol/client", version: SDK_VERSION, [name]: value }));
    await assert.rejects(patchMcpSdk({ automationRoot: root }), /different package or version/);
    assert.deepEqual(await hashes(dist), originals);
  });
}

for (const index of [0, 1]) {
  test(`managed SDK patch preflights source drift in format ${index + 1} before any write`, async t => {
    const { root, dist } = await fixture(t);
    await fs.appendFile(join(dist, PATCH_TARGETS[index].name), "\n// unreviewed change\n");
    const before = await hashes(dist);
    await assert.rejects(patchMcpSdk({ automationRoot: root }), /Unexpected SDK bytes/);
    assert.deepEqual(await hashes(dist), before);
  });
}

test("managed SDK patch refuses a linked package outside its automation root", async t => {
  const { root, dist } = await fixture(t, { packageLink: true });
  await assert.rejects(patchMcpSdk({ automationRoot: root }), /linked or out-of-root/);
  assert.deepEqual(await hashes(dist), originals);
});

test("managed SDK patch refuses a linked dist directory outside the package", async t => {
  const { root, dist } = await fixture(t, { distLink: true });
  await assert.rejects(patchMcpSdk({ automationRoot: root }), /linked or non-file/);
  assert.deepEqual(await hashes(dist), originals);
});

test("managed SDK patch preserves another operation's lock", async t => {
  const { root, packageRoot, dist } = await fixture(t);
  const lock = join(packageRoot, ".studio-native-spawn.lock");
  await fs.writeFile(lock, "owned by another operation");
  await assert.rejects(patchMcpSdk({ automationRoot: root }), /holds the lock/);
  assert.equal(await fs.readFile(lock, "utf8"), "owned by another operation");
  assert.deepEqual(await hashes(dist), originals);
});

test("managed SDK patch rolls back a failed second rename and removes owned temporary files", async t => {
  const { root, packageRoot, dist } = await fixture(t);
  let injected = false;
  const io = { ...fs, async rename(from, to) {
    if (!injected && to === join(dist, "stdio.cjs")) { injected = true; throw new Error("simulated rename failure"); }
    return fs.rename(from, to);
  } };
  await assert.rejects(patchMcpSdk({ automationRoot: root, io }), /simulated rename failure/);
  assert.deepEqual(await hashes(dist), originals);
  assert.deepEqual((await fs.readdir(dist)).sort(), ["stdio.cjs", "stdio.mjs"]);
  assert.deepEqual((await fs.readdir(packageRoot)).sort(), ["dist", "package.json"]);
});

test("managed SDK patch preserves concurrent unknown edits during rollback", async t => {
  const { root, dist } = await fixture(t);
  const changedFile = join(dist, "stdio.mjs");
  const unknown = Buffer.from("// concurrent edit that must not be overwritten\n");
  let injected = false;
  const io = { ...fs, async rename(from, to) {
    if (!injected && to === join(dist, "stdio.cjs")) {
      injected = true; await fs.writeFile(changedFile, unknown); throw new Error("simulated concurrent update");
    }
    return fs.rename(from, to);
  } };
  await assert.rejects(patchMcpSdk({ automationRoot: root, io }), /concurrent changes were not overwritten/);
  assert.deepEqual(await fs.readFile(changedFile), unknown);
  assert.equal(hash(await fs.readFile(join(dist, "stdio.cjs"))), originals[1]);
});

test("managed SDK patch CLI refuses alternate targets and checks from an unrelated cwd", async t => {
  const { root, dist } = await fixture(t);
  const invalid = spawnSync(process.execPath, [cli, "--root", root], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /No alternate target/);
  assert.deepEqual(await hashes(dist), originals);
  const check = spawnSync(process.execPath, [cli, "--check"], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /verified/);
  assert.deepEqual(await hashes(dist), originals);
});
