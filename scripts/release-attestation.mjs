import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RELEASE_ASSETS = Object.freeze(["civitai-metadata-studio.html", "civitai-metadata-studio.zip", "SHA256SUMS.txt"]);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function buildDate(epoch, now = new Date()) {
  if (epoch === undefined) return now.toISOString().slice(0, 10);
  if (typeof epoch !== "string" || !/^\d+$/u.test(epoch)) throw new Error("SOURCE_DATE_EPOCH must be whole Unix seconds.");
  const seconds = Number(epoch);
  const date = new Date(seconds * 1000);
  if (!Number.isSafeInteger(seconds) || !Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) throw new Error("SOURCE_DATE_EPOCH is outside the supported range.");
  return date.toISOString().slice(0, 10);
}

export function validateReleaseTag(tag, version) {
  if (typeof tag !== "string" || !/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(tag) || tag !== `v${version}`) throw new Error("Release tag must match package.json exactly.");
  return tag;
}

export function recordedBuildEpoch(html, version) {
  const match = html.match(/Version ([0-9A-Za-z.+-]+) · (\d{4}-\d{2}-\d{2})/u);
  if (!match || match[1] !== version) throw new Error("Committed portable artifact version does not match package.json.");
  const milliseconds = Date.parse(`${match[2]}T00:00:00Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== match[2]) throw new Error("Committed portable artifact has an invalid build date.");
  const epoch = String(milliseconds / 1000);
  buildDate(epoch);
  return epoch;
}

export async function assetManifest(directory) {
  const result = {};
  for (const name of RELEASE_ASSETS) {
    const path = join(directory, name);
    const info = await stat(path);
    if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new Error(`Invalid or oversized release asset: ${name}`);
    const bytes = await readFile(path);
    result[name] = { size: bytes.length, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
  }
  return result;
}

export function validatePublishedRelease(release, tag, manifest) {
  if (release?.draft !== false || release.tag_name !== tag || !Array.isArray(release.assets)) throw new Error("The requested release must already be published.");
  for (const name of RELEASE_ASSETS) {
    const matches = release.assets.filter((asset) => asset.name === name);
    if (matches.length !== 1 || matches[0].state !== "uploaded" || matches[0].size !== manifest[name].size || matches[0].digest !== manifest[name].digest) throw new Error(`Published release metadata differs from the verified build: ${name}`);
  }
}

export async function compareAssets(builtDirectory, publishedDirectory) {
  for (const name of RELEASE_ASSETS) {
    const [built, published] = await Promise.all([readFile(join(builtDirectory, name)), readFile(join(publishedDirectory, name))]);
    if (!built.equals(published)) throw new Error(`Published bytes differ from the verified build: ${name}`);
  }
}

async function main() {
  const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const tag = validateReleaseTag(process.env.RELEASE_TAG, version);
  if (process.argv[2] === "--prepare" && process.argv.length === 3) {
    const epoch = recordedBuildEpoch(await readFile(join(root, "dist/civitai-metadata-studio.html"), "utf8"), version);
    if (!process.env.GITHUB_ENV) throw new Error("Preparation requires the GitHub Actions environment file.");
    await appendFile(process.env.GITHUB_ENV, `SOURCE_DATE_EPOCH=${epoch}\n`, "utf8");
    console.log(`Reproducible release build date: ${buildDate(epoch)}`);
    return;
  }
  if (process.argv[2] !== "--verify" || process.argv.length !== 3) throw new Error("Use --prepare or --verify.");
  const manifest = await assetManifest(join(root, "dist"));
  if (process.env.ATTEST_EXISTING_RELEASE === "false") {
    console.log(`Verified artifact version for ${tag}; the new tag build is ready for attestation.`);
    return;
  }
  if (process.env.ATTEST_EXISTING_RELEASE !== "true") throw new Error("An explicit attestation verification mode is required.");
  const repo = process.env.GITHUB_REPOSITORY || "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo)) throw new Error("Invalid GitHub repository.");
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 });
  const release = JSON.parse(gh(["api", `repos/${repo}/releases/tags/${tag}`]));
  validatePublishedRelease(release, tag, manifest);
  const directory = await mkdtemp(join(tmpdir(), "studio-release-attestation-"));
  try {
    gh(["release", "download", tag, "--repo", repo, "--dir", directory, ...RELEASE_ASSETS.flatMap((name) => ["--pattern", name])]);
    await compareAssets(join(root, "dist"), directory);
    for (const name of RELEASE_ASSETS) console.log(`${name}: published bytes match ${manifest[name].digest}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
