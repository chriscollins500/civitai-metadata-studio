import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { fileTree, sha256, integrity, within } from "./mcp-sdk-files.mjs";
import { UPSTREAM_SDK_VERSION, UPSTREAM_URL, UPSTREAM_INTEGRITY, SDK_VERSION, SDK_SPEC, REPACK_FILENAME, PATCH_ID, PATCH_TARGETS } from "./patch-mcp-sdk.mjs";

export const LEGACY_SPAWN_PACKAGES = Object.freeze(["cross-spawn", "path-key", "shebang-command", "shebang-regex", "which", "isexe"]);
const defaultRoot = fileURLToPath(new URL("../automation/", import.meta.url));
const fail = message => Object.assign(new Error(message), { code: "ERR_STUDIO_SDK_REPACK" });
async function readJson(path) { return JSON.parse(await fs.readFile(path, "utf8")); }
async function regular(path, root) {
  if (!(await fs.lstat(path)).isFile() || !within(root, await fs.realpath(path))) throw fail("SDK archive/profile must be regular in-root files.");
  if ((await fs.lstat(path)).isSymbolicLink()) throw fail("SDK archive/profile must not be linked.");
}
export async function verifyMcpSdk({ automationRoot = defaultRoot } = {}) {
  const root = await fs.realpath(automationRoot);
  const manifest = await readJson(join(root, "package.json"));
  if (manifest.devDependencies?.["@modelcontextprotocol/client"] !== SDK_SPEC) throw fail("SDK repack requires the exact local archive pin.");
  const profilePath = join(root, "vendor/sdk-repack.json"), archivePath = join(root, "vendor", REPACK_FILENAME);
  await regular(profilePath, root); await regular(archivePath, root);
  const profile = await readJson(profilePath);
  if (profile.name !== "@modelcontextprotocol/client" || profile.version !== SDK_VERSION || profile.patch !== PATCH_ID || !isDeepStrictEqual(profile.upstream, { version: UPSTREAM_SDK_VERSION, url: UPSTREAM_URL, integrity: UPSTREAM_INTEGRITY })) throw fail("SDK repack provenance does not match the reviewed source profile.");
  const archive = await fs.readFile(archivePath);
  if (profile.archive?.filename !== REPACK_FILENAME || profile.archive.bytes !== archive.length || profile.archive.sha256 !== sha256(archive) || profile.archive.integrity !== integrity(archive)) throw fail("SDK repack archive integrity mismatch.");
  if (!profile.files || Object.keys(profile.files).length > 1000 || Object.keys(profile.files).some(name => !/^[a-zA-Z0-9_.\-/]+$/.test(name) || name.split("/").some(part => !part || part === "..") || !/^[a-f0-9]{64}$/.test(profile.files[name]))) throw fail("Invalid SDK repack file profile.");
  for (const target of PATCH_TARGETS) if (profile.files[`dist/${target.name}`] !== target.patchedSHA256) throw fail("SDK module profile drift.");
  const lock = await readJson(join(root, "package-lock.json"));
  const locked = lock.packages?.["node_modules/@modelcontextprotocol/client"];
  if (lock.packages?.[""]?.devDependencies?.["@modelcontextprotocol/client"] !== SDK_SPEC || locked?.version !== SDK_VERSION || locked.resolved !== SDK_SPEC || locked.integrity !== profile.archive.integrity) throw fail("SDK repack lockfile pin/integrity mismatch.");
  for (const [path, pkg] of Object.entries(lock.packages)) {
    for (const name of LEGACY_SPAWN_PACKAGES) {
      if (path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}` || ["dependencies", "optionalDependencies", "peerDependencies"].some(field => pkg[field]?.[name] !== undefined)) throw fail(`Legacy spawning dependency remains in lockfile: ${name}`);
    }
  }
  const sdkRoot = join(root, "node_modules/@modelcontextprotocol/client");
  if (!(await fs.lstat(sdkRoot)).isDirectory() || (await fs.lstat(sdkRoot)).isSymbolicLink() || !within(root, await fs.realpath(sdkRoot))) throw fail("SDK installation must not be linked or out of root.");
  const installed = await readJson(join(sdkRoot, "package.json"));
  if (installed.name !== profile.name || installed.version !== SDK_VERSION || LEGACY_SPAWN_PACKAGES.some(name => installed.dependencies?.[name] !== undefined)) throw fail("Installed SDK manifest differs from the repack contract.");
  if (!isDeepStrictEqual(await fileTree(sdkRoot), profile.files)) throw fail("Installed SDK file hashes differ from the repack; reinstall with npm ci --prefix automation --ignore-scripts.");
  const require = createRequire(pathToFileURL(join(root, "package.json")));
  for (const name of LEGACY_SPAWN_PACKAGES) {
    let present = true;
    try { await fs.lstat(join(root, "node_modules", name)); } catch (error) { if (error.code === "ENOENT") present = false; else throw error; }
    if (present) throw fail(`Legacy spawning package directory remains: ${name}`);
    try { require.resolve(name); } catch (error) { if (error.code === "MODULE_NOT_FOUND" || error.code === "ERR_STUDIO_LEGACY_SPAWN") continue; throw error; }
    throw fail(`Legacy spawning package is still resolvable: ${name}`);
  }
  return { version: SDK_VERSION, files: Object.keys(profile.files).length, packages: Object.keys(lock.packages).length - 1, sha256: profile.archive.sha256 };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.length !== 2) throw fail("No alternate SDK target or options are accepted by the verifier CLI.");
    const result = await verifyMcpSdk();
    console.log(`SDK repack verified: ${result.version}; ${result.files} installed file hashes; ${result.packages} dependency packages; six legacy spawning packages absent.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
