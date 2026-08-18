import { createHash } from "node:crypto";
import { open, opendir, readFile, stat } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";

globalThis.CMStudio = {};
globalThis.localStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, String(value)); },
  removeItem(key) { this.values.delete(key); },
  clear() { this.values.clear(); }
};
for (const module of [
  "../src/core/constants.js",
  "../src/core/util.js",
  "../src/core/binary.js",
  "../src/core/crc32.js",
  "../src/core/sha256.js",
  "../src/core/air.js",
  "../src/core/civitai-contract.js",
  "../src/core/a1111.js",
  "../src/core/exif.js",
  "../src/formats/png.js",
  "../src/formats/jpeg.js",
  "../src/formats/webp.js",
  "../src/core/comfy.js",
  "../src/core/canonical.js",
  "../src/core/identity-cache.js",
  "../src/core/civitai.js"
]) {
  await import(module);
}

const Studio = globalThis.CMStudio;
const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const settingLabels = new Set([
  "steps",
  "sampler",
  "schedule type",
  "scheduler",
  "cfg scale",
  "guidance",
  "seed",
  "size",
  "model",
  "model hash",
  "vae",
  "vae hash",
  "clip skip",
  "denoising strength"
]);
const strongSettingLabels = new Set([
  "steps",
  "sampler",
  "schedule type",
  "scheduler",
  "cfg scale",
  "guidance",
  "seed",
  "size",
  "clip skip",
  "denoising strength"
]);

function flagValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function mimeFor(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function containsSettingsBoundary(value) {
  for (const line of String(value || "").split(/\r?\n/)) {
    const labels = Studio.a1111.splitSettings(line).flatMap((part) => {
      const separator = part.indexOf(":");
      if (separator <= 0) return [];
      const label = part.slice(0, separator).trim().toLowerCase();
      return settingLabels.has(label) ? [label] : [];
    });
    if (labels.length >= 2 || (labels.length === 1 && strongSettingLabels.has(labels[0]))) return true;
  }
  return false;
}

function bestHash(resource) {
  return Studio.util.strongestHash(resource.hashes);
}

class DiskSlice {
  constructor(path, start, end) {
    this.path = path;
    this.start = start;
    this.end = end;
    this.size = Math.max(0, end - start);
  }

  async arrayBuffer() {
    if (!this.size) return new ArrayBuffer(0);
    const handle = await open(this.path, "r");
    const bytes = Buffer.allocUnsafe(this.size);
    let offset = 0;
    try {
      while (offset < bytes.length) {
        const result = await handle.read(bytes, offset, bytes.length - offset, this.start + offset);
        if (!result.bytesRead) break;
        offset += result.bytesRead;
      }
    } finally {
      await handle.close();
    }
    const exact = bytes.subarray(0, offset);
    return exact.buffer.slice(exact.byteOffset, exact.byteOffset + exact.byteLength);
  }
}

class DiskFile {
  constructor(path, size, modified) {
    this.path = path;
    this.name = basename(path);
    this.size = size;
    this.lastModified = modified;
    this.type = mimeFor(path);
  }

  slice(start = 0, end = this.size) {
    const from = Math.max(0, Math.min(this.size, Number(start) || 0));
    const to = Math.max(from, Math.min(this.size, end === undefined ? this.size : Number(end)));
    return new DiskSlice(this.path, from, to);
  }
}

async function collectImages(root) {
  const files = [];
  async function visit(directory) {
    const stream = await opendir(directory);
    for await (const entry of stream) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
    }
  }
  await visit(root);
  return files;
}

async function sliceHash(file, start, end) {
  return hash(Buffer.from(await file.slice(start, end).arrayBuffer()));
}

function resourceFingerprint(resource) {
  return Studio.util.stableStringify({
    name: resource.name,
    filename: resource.filename,
    role: resource.role,
    type: resource.type,
    versionName: resource.versionName,
    canonicalAir: resource.canonicalAir,
    modelId: resource.modelId,
    modelVersionId: resource.modelVersionId,
    fileId: resource.fileId,
    sourceUrl: resource.sourceUrl,
    hashes: resource.hashes,
    weight: resource.weight
  }, 0);
}

function resourcesMatch(left, right) {
  const fingerprints = (resources) => resources
    .filter((resource) => !resource.removed)
    .map(resourceFingerprint)
    .sort();
  return JSON.stringify(fingerprints(left)) === JSON.stringify(fingerprints(right));
}

async function chunkHashes(file, chunks, types) {
  const results = [];
  for (const chunk of chunks.filter((item) => types.has(item.type))) {
    results.push(`${chunk.type}:${await sliceHash(file, chunk.offset, chunk.offset + chunk.totalLength)}`);
  }
  return results;
}

async function rewriteCheck(path) {
  const bytes = await readFile(path);
  const source = new File([bytes], basename(path), { type: mimeFor(path) });
  const inspection = await Studio.canonical.inspectFile(source);
  const record = await Studio.canonical.createRecord(source, inspection);
  const output = Studio.canonical.rewrite(record);
  const edited = new File([output], `edited-${basename(path)}`, { type: inspection.mime });
  const editedInspection = await Studio.canonical.inspectFile(edited);
  const editedRecord = await Studio.canonical.createRecord(edited, editedInspection);
  let pixelPayloadIdentical = false;

  if (inspection.format === "png") {
    const types = new Set(["IDAT", "PLTE", "tRNS", "acTL", "fcTL", "fdAT"]);
    pixelPayloadIdentical = JSON.stringify(await chunkHashes(source, inspection.chunks, types))
      === JSON.stringify(await chunkHashes(edited, editedInspection.chunks, types));
  } else if (inspection.format === "jpeg") {
    pixelPayloadIdentical = await sliceHash(source, inspection.scanOffset, source.size)
      === await sliceHash(edited, editedInspection.scanOffset, edited.size);
  } else {
    const types = new Set(["VP8 ", "VP8L", "ALPH", "ANIM", "ANMF"]);
    pixelPayloadIdentical = JSON.stringify(await chunkHashes(source, inspection.chunks, types))
      === JSON.stringify(await chunkHashes(edited, editedInspection.chunks, types));
  }

  return {
    format: inspection.format,
    dimensionsEqual: inspection.width === editedInspection.width && inspection.height === editedInspection.height,
    pixelPayloadIdentical,
    outputReadable: Boolean(editedInspection.width && editedInspection.height),
    negativePromptClean: !containsSettingsBoundary(editedInspection.a1111?.fields?.negativePrompt),
    resourcesEqual: resourcesMatch(record.resources, editedRecord.resources),
    outputBytes: edited.size
  };
}

const rootIndex = process.argv.indexOf("--root");
if (rootIndex < 0 || !process.argv[rootIndex + 1]) {
  console.error("Usage: node scripts/full-regression.mjs --root <image-directory> [--limit N] [--rewrite-per-format N] [--live-api N] [--name-search N] [--api-delay-ms N]");
  process.exit(2);
}

const root = resolve(process.argv[rootIndex + 1]);
const limit = flagValue("--limit", 0);
const rewritePerFormat = flagValue("--rewrite-per-format", 2);
const liveApiLimit = flagValue("--live-api", 0);
const nameSearchLimit = flagValue("--name-search", 0);
const apiDelayMs = flagValue("--api-delay-ms", 500);
const allPaths = await collectImages(root);
const paths = limit ? allPaths.slice(0, limit) : allPaths;
const summary = {
  rootFilesFound: allPaths.length,
  filesSelected: paths.length,
  scanned: 0,
  passed: 0,
  formats: { png: 0, jpeg: 0, webp: 0 },
  a1111Carriers: 0,
  comfyPrompts: 0,
  structuredManifests: 0,
  resources: 0,
  exactEvidenceResources: 0,
  negativePromptSettingLeaks: 0,
  eightKImages: 0,
  warnings: 0,
  maxWidth: 0,
  maxHeight: 0,
  errors: []
};
const candidates = { png: [], jpeg: [], webp: [] };
const exactResources = new Map();
const unresolvedNames = new Set();
let cursor = 0;

async function scanWorker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= paths.length) return;
    const path = paths[index];
    try {
      const info = await stat(path);
      const file = new DiskFile(path, info.size, info.mtimeMs);
      const inspection = await Studio.canonical.inspectFile(file);
      const record = await Studio.canonical.createRecord(file, inspection);
      summary.passed += 1;
      summary.formats[inspection.format] += 1;
      summary.a1111Carriers += inspection.a1111 ? 1 : 0;
      summary.comfyPrompts += inspection.promptJson ? 1 : 0;
      summary.structuredManifests += inspection.manifests.length;
      summary.resources += record.resources.length;
      summary.warnings += record.warnings.length;
      summary.maxWidth = Math.max(summary.maxWidth, inspection.width || 0);
      summary.maxHeight = Math.max(summary.maxHeight, inspection.height || 0);
      if ((inspection.width || 0) >= 7680 || (inspection.height || 0) >= 4320) summary.eightKImages += 1;
      if (containsSettingsBoundary(record.fields.negativePrompt.value)) summary.negativePromptSettingLeaks += 1;
      candidates[inspection.format].push({ path, size: info.size });

      for (const resource of record.resources) {
        const evidenceHash = bestHash(resource);
        const key = resource.modelVersionId
          ? `version:${resource.modelVersionId}`
          : evidenceHash
            ? `hash:${evidenceHash}`
            : "";
        if (key) {
          summary.exactEvidenceResources += 1;
          if (!exactResources.has(key)) exactResources.set(key, structuredClone(resource));
        } else if (resource.name && !["Primary model", "VAE", "Unidentified resource"].includes(resource.name)) {
          unresolvedNames.add(resource.name);
        }
      }
    } catch (error) {
      if (summary.errors.length < 100) {
        summary.errors.push({
          file: relative(root, path),
          message: Studio.util.sanitizeText(error.message || error, 500)
        });
      }
    } finally {
      summary.scanned += 1;
      if (summary.scanned % 250 === 0 || summary.scanned === paths.length) {
        console.error(`Scanned ${summary.scanned}/${paths.length}`);
      }
    }
  }
}

await Promise.all(Array.from({ length: Math.min(8, Math.max(1, paths.length)) }, () => scanWorker()));

const rewriteResults = [];
for (const [format, items] of Object.entries(candidates)) {
  const selected = items.sort((left, right) => right.size - left.size).slice(0, rewritePerFormat);
  for (const item of selected) {
    try {
      rewriteResults.push({
        file: relative(root, item.path),
        ...(await rewriteCheck(item.path))
      });
    } catch (error) {
      rewriteResults.push({
        file: relative(root, item.path),
        format,
        error: Studio.util.sanitizeText(error.message || error, 500)
      });
    }
  }
}

const liveApi = { attempted: 0, verified: 0, unresolved: 0, conflict: 0, errors: [] };
for (const [key, resource] of [...exactResources].slice(0, liveApiLimit)) {
  liveApi.attempted += 1;
  try {
    const result = await Studio.civitai.verifyResource(resource);
    liveApi[result.status] = (liveApi[result.status] || 0) + 1;
  } catch (error) {
    liveApi.errors.push({ evidence: key, message: Studio.util.sanitizeText(error.message || error, 500) });
  }
  if (apiDelayMs) await new Promise((resolveDelay) => setTimeout(resolveDelay, apiDelayMs));
}

const nameSearch = { attempted: 0, withCandidates: 0, noCandidates: 0, errors: [] };
for (const name of [...unresolvedNames].slice(0, nameSearchLimit)) {
  nameSearch.attempted += 1;
  try {
    const results = await Studio.civitai.searchCandidates(name);
    if (results.length) nameSearch.withCandidates += 1;
    else nameSearch.noCandidates += 1;
  } catch (error) {
    nameSearch.errors.push({
      queryLength: name.length,
      message: Studio.util.sanitizeText(error.message || error, 500)
    });
  }
  if (apiDelayMs) await new Promise((resolveDelay) => setTimeout(resolveDelay, apiDelayMs));
}

const result = {
  summary,
  uniqueExactEvidenceResources: exactResources.size,
  uniqueUnresolvedNames: unresolvedNames.size,
  rewrites: rewriteResults,
  liveApi,
  nameSearch
};
console.log(JSON.stringify(result, null, 2));

const failedRewrite = rewriteResults.some((item) =>
  item.error
  || !item.dimensionsEqual
  || !item.pixelPayloadIdentical
  || !item.outputReadable
  || !item.negativePromptClean
  || !item.resourcesEqual
);
if (summary.errors.length || summary.negativePromptSettingLeaks || failedRewrite || liveApi.errors.length || nameSearch.errors.length) {
  process.exitCode = 1;
}
