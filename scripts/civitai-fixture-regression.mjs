import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

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
const allowedImageHosts = new Set([
  "image.civitai.com",
  "imagecache.civitai.com",
  "image-b2.civitai.com"
]);
const maximumImageBytes = 64 * 1024 * 1024;

function flagValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileType(url, contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (["image/png", "image/jpeg", "image/webp"].includes(type)) return type;
  const extension = extname(new URL(url).pathname).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function extensionFor(type) {
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  return ".jpg";
}

async function boundedBytes(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maximumImageBytes) throw new Error("Civitai image exceeds the 64 MiB fixture limit.");
  if (!response.body) throw new Error("Civitai image response has no body.");
  const reader = response.body.getReader();
  const parts = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumImageBytes) {
        await reader.cancel();
        throw new Error("Civitai image exceeded the 64 MiB fixture limit while downloading.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
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

async function pixelPayloadMatches(source, inspection, edited, editedInspection) {
  if (inspection.format === "png") {
    const types = new Set(["IDAT", "PLTE", "tRNS", "acTL", "fcTL", "fdAT"]);
    return JSON.stringify(await chunkHashes(source, inspection.chunks, types))
      === JSON.stringify(await chunkHashes(edited, editedInspection.chunks, types));
  }
  if (inspection.format === "jpeg") {
    return await sliceHash(source, inspection.scanOffset, source.size)
      === await sliceHash(edited, editedInspection.scanOffset, edited.size);
  }
  const types = new Set(["VP8 ", "VP8L", "ALPH", "ANIM", "ANMF"]);
  return JSON.stringify(await chunkHashes(source, inspection.chunks, types))
    === JSON.stringify(await chunkHashes(edited, editedInspection.chunks, types));
}

const imageLimit = flagValue("--images", 8);
const versionLimit = flagValue("--versions", 20);
const imageResponse = await fetch(
  "https://civitai.com/api/v1/images?limit=100&nsfw=false&sort=Most%20Reactions&period=AllTime",
  { headers: { Accept: "application/json" }, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" }
);
if (!imageResponse.ok) throw new Error(`Civitai images API returned HTTP ${imageResponse.status}.`);
const imageDocument = await imageResponse.json();
const selected = (Array.isArray(imageDocument.items) ? imageDocument.items : [])
  .filter((item) =>
    item
    && item.type === "image"
    && item.nsfw === false
    && item.nsfwLevel === "None"
    && Array.isArray(item.modelVersionIds)
    && item.modelVersionIds.length
    && allowedImageHosts.has(new URL(item.url).hostname)
  )
  .slice(0, imageLimit);
if (!selected.length) throw new Error("Civitai returned no safe public image fixtures with model-version evidence.");

const directory = await mkdtemp(join(tmpdir(), "civitai-metadata-regression-"));
const results = [];
const versionIds = new Set();
const apiMetaKeys = new Set();
try {
  for (const item of selected) {
    for (const key of Object.keys(item.meta || {})) apiMetaKeys.add(key);
    for (const id of item.modelVersionIds) {
      const value = Studio.util.positiveIdOrNull(id);
      if (value) versionIds.add(value);
    }
    const response = await fetch(item.url, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,*/*" },
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "follow"
    });
    if (!response.ok) throw new Error(`Civitai image ${item.id} returned HTTP ${response.status}.`);
    if (!allowedImageHosts.has(new URL(response.url).hostname)) {
      throw new Error(`Civitai image ${item.id} redirected to an unapproved host.`);
    }
    const bytes = await boundedBytes(response);
    const type = fileType(response.url, response.headers.get("content-type"));
    const path = join(directory, `${item.id}${extensionFor(type)}`);
    await writeFile(path, bytes);
    const source = new File([bytes], `${item.id}${extensionFor(type)}`, { type });
    const inspection = await Studio.canonical.inspectFile(source);
    const record = await Studio.canonical.createRecord(source, inspection);
    const output = Studio.canonical.rewrite(record);
    const edited = new File([output], `edited-${source.name}`, { type: inspection.mime });
    const editedInspection = await Studio.canonical.inspectFile(edited);
    const editedRecord = await Studio.canonical.createRecord(edited, editedInspection);
    results.push({
      id: item.id,
      format: inspection.format,
      apiDimensions: `${item.width}x${item.height}`,
      fileDimensions: `${inspection.width}x${inspection.height}`,
      dimensionsMatch: item.width === inspection.width && item.height === inspection.height,
      a1111Carrier: Boolean(inspection.a1111),
      embeddedCarrierCount: inspection.carriers.length,
      embeddedMetadataItems: inspection.metadataItems.length,
      apiMetaPresent: Boolean(item.meta && Object.keys(item.meta).length),
      modelVersionIds: item.modelVersionIds.length,
      rewrittenDimensionsMatch: inspection.width === editedInspection.width && inspection.height === editedInspection.height,
      pixelPayloadIdentical: await pixelPayloadMatches(source, inspection, edited, editedInspection),
      resourcesRoundTrip: resourcesMatch(record.resources, editedRecord.resources)
    });
  }

  const selectedVersionIds = [...versionIds].slice(0, versionLimit);
  Studio.civitai.clearCache();
  const versionRecord = {
    dirty: false,
    resources: selectedVersionIds.map((id) => Studio.canonical.normalizeResource({
      modelVersionId: id,
      role: "other",
      type: "Other",
      identitySource: "civitai_manifest"
    }, "civitai_manifest"))
  };
  const versionVerification = await Studio.civitai.verifyRecord(versionRecord);
  const versionResults = versionRecord.resources.map((identity, index) => ({
    id: selectedVersionIds[index],
    found: identity.verification === "verified",
    modelId: Boolean(identity.modelId),
    modelVersionId: identity.modelVersionId === selectedVersionIds[index],
    name: Boolean(identity.name && identity.name !== "Unidentified resource"),
    versionName: Boolean(identity.versionName),
    baseModel: Boolean(identity.baseModel),
    type: Boolean(identity.type && identity.type !== "Other"),
    hashes: Object.keys(identity.hashes || {}).length,
    trainedWords: Array.isArray(identity.trainedWords),
    sourceUrl: Boolean(identity.sourceUrl),
    creator: Boolean(identity.creator),
    license: Boolean(identity.license),
    error: identity.verification === "error" ? identity.verificationMessage : undefined
  }));
  const expectedVersionBatches = Math.ceil(selectedVersionIds.length / 20);

  const summary = {
    apiImagesReturned: Array.isArray(imageDocument.items) ? imageDocument.items.length : 0,
    safeFixturesTested: results.length,
    apiImageMetaPresent: selected.filter((item) => item.meta && Object.keys(item.meta).length).length,
    apiMetaKeys: [...apiMetaKeys].sort(),
    formats: Object.fromEntries(["png", "jpeg", "webp"].map((format) => [
      format,
      results.filter((item) => item.format === format).length
    ])),
    dimensionsMatched: results.filter((item) => item.dimensionsMatch).length,
    embeddedA1111Carriers: results.filter((item) => item.a1111Carrier).length,
    embeddedMetadataCarriers: results.reduce((sum, item) => sum + item.embeddedCarrierCount, 0),
    rewritesPassed: results.filter((item) =>
      item.rewrittenDimensionsMatch && item.pixelPayloadIdentical && item.resourcesRoundTrip
    ).length,
    modelVersionLookupsAttempted: versionResults.length,
    modelVersionLookupsFound: versionResults.filter((item) => item.found).length,
    modelVersionLookupsNotFound: versionResults.filter((item) => item.found === false).length,
    modelVersionLookupErrors: versionResults.filter((item) => item.error).length,
    modelVersionBatchMetrics: versionVerification,
    modelVersionBatchEfficient: versionVerification.batchFallbacks === 0
      && versionVerification.networkCalls === expectedVersionBatches
      && versionVerification.batchCalls === expectedVersionBatches,
    versionFieldCoverage: {
      modelId: versionResults.filter((item) => item.modelId).length,
      modelVersionId: versionResults.filter((item) => item.modelVersionId).length,
      name: versionResults.filter((item) => item.name).length,
      versionName: versionResults.filter((item) => item.versionName).length,
      baseModel: versionResults.filter((item) => item.baseModel).length,
      type: versionResults.filter((item) => item.type).length,
      hashes: versionResults.filter((item) => item.hashes > 0).length,
      trainedWords: versionResults.filter((item) => item.trainedWords).length,
      sourceUrl: versionResults.filter((item) => item.sourceUrl).length,
      creator: versionResults.filter((item) => item.creator).length,
      license: versionResults.filter((item) => item.license).length
    }
  };
  console.log(JSON.stringify({ summary, images: results, versions: versionResults }, null, 2));

  if (
    results.some((item) =>
      !item.dimensionsMatch
      || !item.rewrittenDimensionsMatch
      || !item.pixelPayloadIdentical
      || !item.resourcesRoundTrip
    )
    || versionResults.some((item) => item.error || (item.found && !item.modelVersionId))
    || !summary.modelVersionBatchEfficient
  ) {
    process.exitCode = 1;
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
