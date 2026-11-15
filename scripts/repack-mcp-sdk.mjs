import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileTree, sha256, integrity } from "./mcp-sdk-files.mjs";
import { UPSTREAM_URL, UPSTREAM_INTEGRITY, UPSTREAM_SDK_VERSION, SDK_VERSION, REPACK_FILENAME, PATCH_ID, PATCH_TARGETS, prepareMcpSdkModule } from "./patch-mcp-sdk.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const vendor = join(root, "automation/vendor");
const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && args[0] !== "--write")) throw new Error("Use npm run sdk:repack [-- --write]. No alternate source or destination is accepted.");
const write = args[0] === "--write";
if (!process.env.npm_execpath) throw new Error("Run this recipe through npm run sdk:repack.");
await fs.mkdir(join(root, ".tmp"), { recursive: true });
const scratch = await fs.mkdtemp(join(root, ".tmp/mcp-sdk-repack-"));
async function run(command, args, cwd) {
  let stdout = "", stderr = "";
  const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, npm_config_ignore_scripts: "true" } });
  const timer = setTimeout(() => child.kill(), 60000);
  child.stdout.on("data", bytes => { stdout += bytes; });
  child.stderr.on("data", bytes => { stderr += bytes; });
  try {
    await new Promise((yes, no) => { child.on("error", no); child.on("close", code => code === 0 ? yes() : no(new Error(`SDK recipe command failed (${code}): ${stderr.slice(-2000)}`))); });
  } finally { clearTimeout(timer); }
  return stdout;
}
const response = await fetch(UPSTREAM_URL, { redirect: "error", signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Pinned SDK download failed: HTTP ${response.status}; no retry.`);
const chunks = []; let length = 0;
for await (const chunk of response.body) {
  length += chunk.byteLength;
  if (length > 8 * 1024 * 1024) throw new Error("Pinned SDK archive exceeds its size bound.");
  chunks.push(chunk);
}
const upstream = Buffer.concat(chunks);
if (integrity(upstream) !== UPSTREAM_INTEGRITY) throw new Error("Pinned upstream SDK integrity mismatch; refusing extraction.");
const source = join(scratch, "upstream.tgz");
await fs.writeFile(source, upstream, { flag: "wx" });
const entries = (await run("tar", ["-tf", source], scratch)).trim().split(/\r?\n/);
if (!entries.length || entries.some(path => !/^package\//.test(path) || path.includes("\\") || path.split("/").includes(".."))) throw new Error("Unsafe SDK archive paths.");
// This exact, integrity-checked upstream archive has only regular package files.
const types = (await run("tar", ["-tvf", source], scratch)).trim().split(/\r?\n/);
if (types.some(line => !/^[-d]/.test(line))) throw new Error("SDK archive links/special files are forbidden.");
await run("tar", ["-xf", source], scratch);
const packageRoot = join(scratch, "package");
const originalFiles = await fileTree(packageRoot);
const manifestPath = join(packageRoot, "package.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
if (manifest.name !== "@modelcontextprotocol/client" || manifest.version !== UPSTREAM_SDK_VERSION || manifest.dependencies?.["cross-spawn"] !== "^7.0.5") throw new Error("Unexpected upstream SDK manifest.");
for (const target of PATCH_TARGETS) {
  const path = join(packageRoot, "dist", target.name);
  await fs.writeFile(path, prepareMcpSdkModule(target, await fs.readFile(path)));
}
delete manifest.dependencies["cross-spawn"]; manifest.version = SDK_VERSION;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
const provenance = {
  name: manifest.name, version: SDK_VERSION, patch: PATCH_ID,
  upstream: { version: UPSTREAM_SDK_VERSION, url: UPSTREAM_URL, integrity: UPSTREAM_INTEGRITY },
  modifications: ["Native Node-only ESM/CommonJS spawning with modification notices", "Remove the unused cross-spawn dependency", "Local prerelease version and this modification record"],
  modules: PATCH_TARGETS.map(({ name, originalSHA256, patchedSHA256 }) => ({ name, originalSHA256, patchedSHA256 }))
};
await fs.writeFile(join(packageRoot, "dist/STUDIO-PATCH.json"), JSON.stringify(provenance, null, 2) + "\n");
const files = await fileTree(packageRoot);
const changed = [...new Set([...Object.keys(files), ...Object.keys(originalFiles)])].filter(name => files[name] !== originalFiles[name]).sort();
if (JSON.stringify(changed) !== JSON.stringify(["dist/STUDIO-PATCH.json", "dist/stdio.cjs", "dist/stdio.mjs", "package.json"])) throw new Error("Unexpected SDK source changes.");
if (!Object.keys(originalFiles).some(path => /^licen[cs]e/i.test(path))) throw new Error("Upstream SDK license missing.");
const packResult = JSON.parse(await run(process.execPath, [process.env.npm_execpath, "pack", packageRoot, "--ignore-scripts", "--json", "--pack-destination", scratch], root));
// npm 11 returns an array; npm 12 keys this result by package name.
const packed = Array.isArray(packResult) ? packResult : Object.keys(packResult).length === 1 && packResult[manifest.name] ? [packResult[manifest.name]] : [];
if (packed.length !== 1 || packed[0].filename !== REPACK_FILENAME || packed[0].name !== manifest.name || packed[0].version !== SDK_VERSION) throw new Error("Unexpected npm pack identity.");
const bytes = await fs.readFile(join(scratch, REPACK_FILENAME));
const profile = { ...provenance, archive: { filename: REPACK_FILENAME, bytes: bytes.length, sha256: sha256(bytes), integrity: integrity(bytes) }, files };
const profileBytes = Buffer.from(JSON.stringify(profile, null, 2) + "\n");
if (write) {
  await fs.mkdir(vendor, { recursive: true });
  await fs.writeFile(join(vendor, REPACK_FILENAME), bytes);
  await fs.writeFile(join(vendor, "sdk-repack.json"), profileBytes);
} else {
  if (!(await fs.readFile(join(vendor, REPACK_FILENAME))).equals(bytes) || !(await fs.readFile(join(vendor, "sdk-repack.json"))).equals(profileBytes)) throw new Error("Reproduced SDK differs from committed artifact/profile. Review; do not blindly refresh.");
}
console.log(`SDK repack ${write ? "written" : "reproduced byte-for-byte"}: ${REPACK_FILENAME}, ${bytes.length} bytes, SHA256 ${profile.archive.sha256}.`);
console.log(`Upstream notices retained; ${Object.keys(files).length} file hashes recorded. Temporary build: ${scratch}`);
