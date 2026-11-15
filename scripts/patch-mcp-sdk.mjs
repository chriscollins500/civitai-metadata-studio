import * as fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const UPSTREAM_SDK_VERSION = "2.4.0";
export const UPSTREAM_URL = "https://registry.npmjs.org/@modelcontextprotocol/client/-/client-2.4.0.tgz";
export const UPSTREAM_INTEGRITY = "sha512-LgrD2OphHuG12vfKFKz6SOnq7bKHQmhGJIAYdD+MZBn2npHEyry6uD8zvktodtl5CQM85MO0anUyD9JwmUmxww==";
export const SDK_VERSION = "2.4.0-studio-native.2";
export const REPACK_FILENAME = `modelcontextprotocol-client-${SDK_VERSION}.tgz`;
export const SDK_SPEC = `file:vendor/${REPACK_FILENAME}`;
export const PATCH_ID = "studio-mcp-client-2.4.0-native-node-sse-v3";
export const NODE_ONLY_MESSAGE = "Studio MCP client is Node-only; command must equal process.execPath.";
const modificationNotice = "// Modified by Civitai Metadata Studio: native Node-only spawning (see STUDIO-PATCH.json).\n";
const startAnchor = "\tasync start() {\n";
const makeTarget = (name, binding, originalSHA256, patchedSHA256, from, to) => Object.freeze({
  name, originalSHA256, patchedSHA256,
  edits: Object.freeze([
    Object.freeze({ from, to }),
    Object.freeze({ from: startAnchor, to: `${startAnchor}\t\tif (this._serverParams.command !== ${binding}.execPath) throw Object.assign(new TypeError(${JSON.stringify(NODE_ONLY_MESSAGE)}), { code: "ERR_STUDIO_NODE_ONLY" });\n` })
  ])
});
const sseAnchor = "\t\t\t\tfetch: async (url, init) => {\n\t\t\t\t\tconst headers = await this._commonHeaders();\n";
const sseInsertion = "\t\t\t\t\t// Modified by Civitai Metadata Studio: preserve reconnect cursor (see STUDIO-PATCH.json).\n" +
  '\t\t\t\t\tconst lastEventId = new Headers(init?.headers).get("last-event-id");\n' +
  '\t\t\t\t\tif (lastEventId !== null) headers.set("Last-Event-ID", lastEventId);\n';
const makeSseTarget = (name, originalSHA256, patchedSHA256) => Object.freeze({
  name, originalSHA256, patchedSHA256,
  edits: Object.freeze([Object.freeze({ from: sseAnchor, to: sseAnchor + sseInsertion })])
});
export const PATCH_TARGETS = Object.freeze([
  makeTarget("stdio.mjs", "process",
    "d44adf6ca40eb7a9cafb35dec9658de2b9e17c7dea6be01c06fb8e0d594dc211",
    "f7d630bbc14181592b9a4c1a55ea009014a8ad39ffc712f6c2d44a8d69aae01d",
    'import spawn from "cross-spawn";', modificationNotice + 'import { spawn } from "node:child_process";'),
  makeTarget("stdio.cjs", "node_process.default",
    "48de5b37b235ad86be60286b1bc8218dc42dd4e2fbb2d79d41534d55bc2f457b",
    "d7e894439f93216f98f97617d9e720ccb1e5065a5029802d66c0a30b50f10eaf",
    'let cross_spawn = require("cross-spawn");', modificationNotice + 'let cross_spawn = require("node:child_process").spawn;'),
  makeSseTarget("index.mjs",
    "b78923b9b9d342109f4fc2a03a9dcea7241fbb89bb2943ec4c9f05a23891b1cf",
    "9cd3d0133fb99389b48c0c1f8c63289a64aad5549520b0925f7d215629852808"),
  makeSseTarget("index.cjs",
    "a77f4641ef2138baac0aa10c899e1a56e3f0c86369392a6197153ca75d61bf05",
    "76d64076ca1e6bdf4129900058348d4800ec04fd800f074fe237a9c4e553e5e7")
]);
const defaultRoot = fileURLToPath(new URL("../automation/", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = message => Object.assign(new Error(message), { code: "ERR_STUDIO_SDK_PATCH" });
function contains(root, target) {
  const path = relative(root, target);
  return path !== "" && !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}

async function context(automationRoot, io) {
  const root = await io.realpath(automationRoot);
  const manifest = JSON.parse(await io.readFile(join(root, "package.json"), "utf8"));
  if (manifest.devDependencies?.["@modelcontextprotocol/client"] !== SDK_SPEC) {
    throw fail(`Managed MCP patch requires the exact client pin ${SDK_SPEC}; review the patch before changing it.`);
  }
  const expected = join(root, "node_modules/@modelcontextprotocol/client");
  const info = await io.lstat(expected);
  const packageRoot = await io.realpath(expected);
  if (!info.isDirectory() || info.isSymbolicLink() || !contains(root, packageRoot)) {
    throw fail("Managed MCP patch refuses a linked or out-of-root SDK package.");
  }
  const installed = JSON.parse(await io.readFile(join(packageRoot, "package.json"), "utf8"));
  if (installed.name !== "@modelcontextprotocol/client" || installed.version !== SDK_VERSION) {
    throw fail(`Installed MCP client must be ${SDK_VERSION}; refusing to patch a different package or version.`);
  }
  return { root, packageRoot };
}

async function planPatches(packageRoot, io) {
  const plans = [];
  for (const target of PATCH_TARGETS) {
    const path = join(packageRoot, "dist", target.name);
    const info = await io.lstat(path);
    const resolved = await io.realpath(path);
    if (!info.isFile() || info.isSymbolicLink() || !contains(packageRoot, resolved)) {
      throw fail(`Managed MCP patch refuses a linked or non-file dist/${target.name}.`);
    }
    const before = await io.readFile(path);
    const hash = digest(before);
    if (hash === target.patchedSHA256) { plans.push({ ...target, path, before, changed: false }); continue; }
    if (hash !== target.originalSHA256) throw fail(`Unexpected SDK bytes in dist/${target.name}; no module will be patched. Review the SDK update or restore it with npm ci --ignore-scripts.`);
    const after = prepareMcpSdkModule(target, before);
    plans.push({ ...target, path, before, after, mode: info.mode, changed: true });
  }
  return plans;
}

/** The same byte-checked transform is used by the repack recipe and repair tests. */
export function prepareMcpSdkModule(target, before) {
  if (digest(before) !== target.originalSHA256) throw fail(`Unexpected SDK bytes in dist/${target.name}.`);
  let text = before.toString("utf8");
  for (const edit of target.edits) {
    if (text.split(edit.from).length !== 2) throw fail(`Patch anchor drift in dist/${target.name}.`);
    text = text.replace(edit.from, edit.to);
  }
  const after = Buffer.from(text);
  if (digest(after) !== target.patchedSHA256) throw fail(`Managed patch output hash mismatch for dist/${target.name}.`);
  return after;
}

async function replaceFile(plan, bytes, io) {
  const temporary = join(dirname(plan.path), `.studio-native-spawn-${randomUUID()}.tmp`);
  let handle, owned = false;
  try {
    handle = await io.open(temporary, "wx", plan.mode);
    owned = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close(); handle = undefined;
    await io.rename(temporary, plan.path);
  } finally {
    await handle?.close().catch(() => {});
    if (owned) await io.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}

/** io injection is used only by fault-injection tests; CLI targets are fixed. */
export async function patchMcpSdk({ automationRoot = defaultRoot, checkOnly = false, io = fs } = {}) {
  const { packageRoot } = await context(automationRoot, io);
  let lock;
  const lockPath = join(packageRoot, ".studio-native-spawn.lock");
  if (!checkOnly) {
    try { lock = await io.open(lockPath, "wx", 0o600); }
    catch (error) { if (error.code === "EEXIST") throw fail("Another SDK patch operation holds the lock; retry after it finishes. Restore the dependency with npm ci --ignore-scripts if a crashed process left a stale lock."); throw error; }
  }
  try {
    // Validate every input and expected output before replacing any module.
    const plans = await planPatches(packageRoot, io);
    const changes = plans.filter(plan => plan.changed);
    if (checkOnly && changes.length) throw fail("Managed MCP patch is not prepared. Run npm run sdk:patch before importing the client transport.");
    const attempted = [];
    try {
      for (const plan of changes) {
        if (digest(await io.readFile(plan.path)) !== plan.originalSHA256) throw fail(`SDK changed while patching dist/${plan.name}; refusing to overwrite it.`);
        attempted.push(plan);
        await replaceFile(plan, plan.after, io);
      }
    } catch (error) {
      const rollbackErrors = [];
      for (const plan of attempted.reverse()) {
        try {
          const current = digest(await io.readFile(plan.path));
          if (current === plan.patchedSHA256) await replaceFile(plan, plan.before, io);
          else if (current !== plan.originalSHA256) throw fail(`Concurrent changes in dist/${plan.name} were preserved; restore/review this dependency before retrying.`);
        } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "SDK patch failed; concurrent changes were not overwritten. Review or reinstall the pinned dependency.");
      throw error;
    }
    for (const plan of plans) if (digest(await io.readFile(plan.path)) !== plan.patchedSHA256) throw fail(`Post-patch verification failed for dist/${plan.name}.`);
    return { patch: PATCH_ID, version: SDK_VERSION, changed: changes.map(plan => `dist/${plan.name}`), verified: plans.map(plan => `dist/${plan.name}`) };
  } finally {
    if (lock) { await lock.close(); await io.unlink(lockPath); }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== "--check")) throw fail("Use patch-mcp-sdk.mjs [--check]. No alternate target path is accepted by the CLI.");
    const result = await patchMcpSdk({ checkOnly: process.argv[2] === "--check" });
    console.log(`Managed MCP SDK patch ${result.changed.length ? "applied" : "verified"}: ${result.patch} (${result.verified.length} modules).`);
  } catch (error) { console.error(error.code === "ERR_STUDIO_SDK_PATCH" || error instanceof AggregateError ? error.message : "Unable to prepare the pinned MCP client. Install automation dependencies with npm ci --prefix automation --ignore-scripts, then retry npm run sdk:patch."); process.exitCode = 1; }
}
