import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "model-version-id": { type: "string", default: "2734704" },
    "image-id": { type: "string", default: "137197908" }
  }
});

globalThis.CMStudio = {};
for (const module of [
  "../src/core/constants.js",
  "../src/core/util.js",
  "../src/core/air.js",
  "../src/core/civitai-contract.js"
]) {
  await import(module);
}

const Studio = globalThis.CMStudio;
const API_ROOT = Studio.constants.API_ROOT;
const MAX_BYTES = 8 * 1024 * 1024;

async function boundedJson(response) {
  if (!response.body) throw new Error("API response had no body.");
  const reader = response.body.getReader();
  const parts = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new Error("API response exceeded the 8 MiB audit limit.");
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
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    },
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}.`);
  return { status: response.status, value: await boundedJson(response) };
}

function positiveId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function versions(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  return value && typeof value === "object" ? [value] : [];
}

function versionSummary(value, sha256 = "") {
  const modelType = value?.model?.type || value?.type || value?.modelType || "";
  const files = Array.isArray(value?.files) ? value.files : [];
  return {
    id: positiveId(value?.id ?? value?.modelVersionId),
    modelId: positiveId(value?.modelId ?? value?.model?.id),
    airValid: Studio.air.parseAir(value?.air || value?.urn || "").valid,
    modelType,
    modelTypeKnown: Studio.civitaiContract.MODEL_TYPES.includes(modelType),
    fileTypes: [...new Set(files.map((file) => file?.type).filter(Boolean))],
    fileTypesKnown: files.every((file) =>
      !file?.type || Studio.civitaiContract.MODEL_FILE_TYPES.includes(file.type)
    ),
    matchingSha256Files: files.filter((file) =>
      String(file?.hashes?.SHA256 || "").toUpperCase() === sha256
    ).length
  };
}

const modelVersionId = positiveId(values["model-version-id"]);
const imageId = positiveId(values["image-id"]);
if (!modelVersionId || !imageId) throw new Error("Audit IDs must be positive integers.");

const versionResponse = await request(`/model-versions/${modelVersionId}`);
const version = versionResponse.value;
const sha256 = String(
  (Array.isArray(version?.files) ? version.files : [])
    .find((file) => /^[A-F0-9]{64}$/iu.test(String(file?.hashes?.SHA256 || "")))
    ?.hashes?.SHA256
  || ""
).toUpperCase();
if (!sha256) throw new Error("The audit model version did not expose a SHA-256 file hash.");

const [directResponse, candidateResponse, imageResponse] = await Promise.all([
  request(`/model-versions/by-hash/${sha256}`),
  request("/model-versions/by-hash", {
    method: "POST",
    body: JSON.stringify([sha256])
  }),
  request(`/images?imageId=${imageId}&limit=1`)
]);

const candidates = versions(candidateResponse.value);
const imageItems = versions(imageResponse.value);
const exactImage = imageItems.find((item) => positiveId(item?.id) === imageId);
const summaries = candidates.map((item) => versionSummary(item, sha256));
const report = {
  auditedAt: new Date().toISOString(),
  endpoints: {
    version: versionResponse.status,
    directHash: directResponse.status,
    candidateHash: candidateResponse.status,
    image: imageResponse.status
  },
  modelVersion: versionSummary(version, sha256),
  directHash: versionSummary(directResponse.value, sha256),
  candidateHash: {
    candidates: summaries.length,
    matchingCandidates: summaries.filter((item) => item.matchingSha256Files > 0).length,
    allModelTypesKnown: summaries.every((item) => item.modelTypeKnown),
    allFileTypesKnown: summaries.every((item) => item.fileTypesKnown)
  },
  image: {
    exactIdReturned: Boolean(exactImage),
    publicFieldKeys: exactImage ? Object.keys(exactImage).sort() : [],
    publicMetaPresent: Boolean(exactImage?.meta && Object.keys(exactImage.meta).length),
    modelVersionIdCount: Array.isArray(exactImage?.modelVersionIds)
      ? exactImage.modelVersionIds.filter(positiveId).length
      : positiveId(exactImage?.modelVersionId) ? 1 : 0
  }
};

console.log(JSON.stringify(report, null, 2));

if (
  !report.modelVersion.id
  || !report.modelVersion.modelTypeKnown
  || !report.modelVersion.fileTypesKnown
  || !report.directHash.id
  || report.directHash.matchingSha256Files < 1
  || report.candidateHash.candidates < 1
  || report.candidateHash.matchingCandidates !== report.candidateHash.candidates
  || !report.candidateHash.allModelTypesKnown
  || !report.candidateHash.allFileTypesKnown
  || !report.image.exactIdReturned
) {
  process.exitCode = 1;
}
