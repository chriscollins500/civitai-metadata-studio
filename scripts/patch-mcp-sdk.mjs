import * as fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SDK_VERSION = "2.4.0";
export const PATCH_ID = "studio-mcp-client-2.4.0-native-node-v1";
export const NODE_ONLY_MESSAGE = "Studio MCP client is Node-only; command must equal process.execPath.";
const startAnchor = "\tasync start() {\n";
const makeTarget = (name, binding, originalSHA256, patchedSHA256, from, to) => Object.freeze({
  name, originalSHA256, patchedSHA256,
  edits: Object.freeze([
    Object.freeze({ from, to }),
    Object.freeze({ from: startAnchor, to: `${startAnchor}\t\tif (this._serverParams.command !== ${binding}.execPath) throw Object.assign(new TypeError(${JSON.stringify(NODE_ONLY_MESSAGE)}), { code: "ERR_STUDIO_NODE_ONLY" });\n` })
  ])
});
export const PATCH_TARGETS = Object.freeze([
  makeTarget("stdio.mjs", "process",
    "d44adf6ca40eb7a9cafb35dec9658de2b9e17c7dea6be01c06fb8e0d594dc211",
    "28ca1c0cb6a600a3490fe64d2c0cdb16f26aa3e180c18df19daf2b7351d2c093",
    'import spawn from "cross-spawn";', 'import { spawn } from "node:child_process";'),
  makeTarget("stdio.cjs", "node_process.default",
    "48de5b37b235ad86be60286b1bc8218dc42dd4e2fbb2d79d41534d55bc2f457b",
    "edbdd64c1af33c89e6c23a2880b64ebca98bd4f54bbebfc575be5ed265fa7212",
    'let cross_spawn = require("cross-spawn");', 'let cross_spawn = require("node:child_process").spawn;')
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
  if (manifest.devDependencies?.["@modelcontextprotocol/client"] !== SDK_VERSION) {
    throw fail(`Managed MCP patch requires the exact client pin ${SDK_VERSION}; review the patch before changing it.`);
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
    let text = before.toString("utf8");
    for (const edit of target.edits) {
      if (text.split(edit.from).length !== 2) throw fail(`Patch anchor drift in dist/${target.name}.`);
      text = text.replace(edit.from, edit.to);
    }
    const after = Buffer.from(text);
    if (digest(after) !== target.patchedSHA256) throw fail(`Managed patch output hash mismatch for dist/${target.name}.`);
    plans.push({ ...target, path, before, after, mode: info.mode, changed: true });
  }
  return plans;
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
    // Validate BOTH inputs and expected outputs before replacing either module.
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
