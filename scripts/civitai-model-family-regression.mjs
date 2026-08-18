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
  "../src/core/air.js",
  "../src/core/civitai-contract.js",
  "../src/core/canonical.js",
  "../src/core/identity-cache.js",
  "../src/core/civitai.js",
  "../src/app/state.js"
]) {
  await import(module);
}

const Studio = globalThis.CMStudio;
const SOURCE_URL = "https://api.github.com/repos/civitai/civitai/contents/src/shared/constants/basemodel.constants.ts";
const LIVE_MODELS_URL = "https://civitai.com/api/v1/models?limit=10&types=Checkpoint&sort=Most%20Downloaded&period=AllTime&primaryFileOnly=true";
const MAX_JSON_BYTES = 8 * 1024 * 1024;

async function boundedJson(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_JSON_BYTES) throw new Error("Regression source exceeded the 8 MiB response limit.");
  if (!response.body) throw new Error("Regression source returned an empty response.");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new Error("Regression source exceeded the 8 MiB response limit while downloading.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}.`);
  return boundedJson(response);
}

function matchingDelimiter(source, start, open, close) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (["'", "\"", "`"].includes(character)) {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`Could not find the closing ${close} in Civitai's base-model source.`);
}

function propertyString(block, property) {
  const match = new RegExp(`\\b${property}\\s*:\\s*`, "u").exec(block);
  if (!match) return "";
  const start = match.index + match[0].length;
  const quote = block[start];
  if (!["'", "\""].includes(quote)) return "";
  let value = "";
  let escaped = false;
  for (let index = start + 1; index < block.length; index += 1) {
    const character = block[index];
    if (escaped) {
      const simple = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v" };
      value += simple[character] ?? character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === quote) {
      return value;
    } else {
      value += character;
    }
  }
  throw new Error(`Civitai's ${property} value was not terminated.`);
}

function propertyBoolean(block, property) {
  const match = new RegExp(`\\b${property}\\s*:\\s*(true|false)\\b`, "u").exec(block);
  return match ? match[1] === "true" : false;
}

function parseBaseModelRecords(source) {
  const marker = source.indexOf("baseModelRecords");
  if (marker < 0) throw new Error("Civitai's baseModelRecords declaration was not found.");
  const assignment = source.indexOf("=", marker);
  if (assignment < 0) throw new Error("Civitai's baseModelRecords assignment was not found.");
  const arrayStart = source.indexOf("[", assignment);
  if (arrayStart < 0) throw new Error("Civitai's baseModelRecords array was not found.");
  const arrayEnd = matchingDelimiter(source, arrayStart, "[", "]");
  const body = source.slice(arrayStart + 1, arrayEnd);
  const records = [];
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== "{") continue;
    const end = matchingDelimiter(body, index, "{", "}");
    const block = body.slice(index, end + 1);
    const name = propertyString(block, "name");
    if (name) {
      records.push({
        name,
        hidden: propertyBoolean(block, "hidden"),
        disabled: propertyBoolean(block, "disabled")
      });
    }
    index = end;
  }
  if (!records.length) throw new Error("No Civitai base-model records were parsed.");
  return records;
}

function blankFields() {
  return Object.fromEntries(
    Studio.constants.GENERATION_FIELDS.map(({ key }) => [key, { value: "" }])
  );
}

function testFamily(record, index) {
  const modelVersionId = 8_000_000 + index;
  const modelId = 7_000_000 + index;
  const filename = `family-${String(index).padStart(3, "0")}.safetensors`;
  const sha256 = (index + 1).toString(16).padStart(64, "0").toUpperCase();
  const identity = Studio.civitai.normalizeVersion({
    id: modelVersionId,
    modelId,
    name: `${record.name} regression version`,
    baseModel: record.name,
    model: {
      id: modelId,
      name: `${record.name} regression model`,
      type: "Checkpoint",
      creator: { username: "Civitai" },
      allowNoCredit: true,
      allowCommercialUse: ["Image"],
      allowDerivatives: true,
      allowDifferentLicense: false
    },
    files: [{
      id: 6_000_000 + index,
      name: filename,
      primary: true,
      hashes: { SHA256: sha256, AutoV2: sha256.slice(0, 10) }
    }]
  });
  if (identity?.baseModel !== record.name) {
    throw new Error(`${record.name}: API normalization lost the base-model label.`);
  }

  const exact = Studio.canonical.normalizeResource({
    ...identity,
    role: "checkpoint",
    identitySource: "api_exact"
  }, "api_exact");
  const workflowAlias = Studio.canonical.normalizeResource({
    name: filename,
    filename,
    role: "checkpoint",
    type: "Checkpoint",
    identitySource: "comfy_active"
  }, "comfy_active");
  const merged = Studio.canonical.mergeResources([workflowAlias, exact]);
  if (merged.length !== 1 || merged[0].baseModel !== record.name || merged[0].modelVersionId !== modelVersionId) {
    throw new Error(`${record.name}: canonical merge did not preserve a single exact resource.`);
  }

  const manifest = Studio.canonical.buildManifest({
    fields: blankFields(),
    resources: merged,
    verification: {
      status: "verified",
      checked: 1,
      verified: 1,
      unresolved: 0
    }
  });
  if (manifest.resources.length !== 1 || manifest.resources[0].baseModel !== record.name) {
    throw new Error(`${record.name}: manifest export lost the base-model label.`);
  }
}

const sourceDocument = await getJson(SOURCE_URL, {
  "User-Agent": "Civitai-Metadata-Studio-Regression"
});
if (sourceDocument.type !== "file" || typeof sourceDocument.content !== "string") {
  throw new Error("GitHub did not return Civitai's base-model source file.");
}
const source = Buffer.from(sourceDocument.content.replace(/\s/gu, ""), "base64").toString("utf8");
const families = parseBaseModelRecords(source);
families.forEach(testFamily);

const liveDocument = await getJson(LIVE_MODELS_URL);
const liveModels = Array.isArray(liveDocument.items) ? liveDocument.items : [];
const liveIdentities = [];
for (const model of liveModels) {
  const version = Array.isArray(model.modelVersions) ? model.modelVersions[0] : null;
  if (!version) continue;
  const identity = Studio.civitai.normalizeVersion({ ...version, model });
  if (identity?.modelVersionId) liveIdentities.push(identity);
}
if (liveIdentities.length !== 10) {
  throw new Error(`Expected 10 live checkpoint versions, found ${liveIdentities.length}.`);
}

Studio.civitai.clearCache();
const liveRecords = [liveIdentities.slice(0, 5), liveIdentities.slice(5)].map((identities) => ({
  dirty: false,
  resources: identities.map((identity) => Studio.canonical.normalizeResource({
    ...identity,
    role: "checkpoint",
    identitySource: "civitai_manifest"
  }, "civitai_manifest"))
}));
const state = new Studio.AppState();
state.entries = liveRecords.map((record, index) => ({
  file: { name: `live-batch-${index + 1}.png` },
  state: "ready",
  record
}));
state.currentIndex = 0;
state.importMissingPrimaryFields = () => {};
await state.verifyEntries(state.entries, true);
const sharedBatch = liveRecords[0].verification.sharedBatch;
const verification = {
  status: liveRecords.every((record) => record.verification.status === "verified") ? "verified" : "partial",
  checked: liveRecords.reduce((sum, record) => sum + record.verification.checked, 0),
  verified: liveRecords.reduce((sum, record) => sum + record.verification.verified, 0),
  unresolved: liveRecords.reduce((sum, record) => sum + record.verification.unresolved, 0),
  errors: liveRecords.flatMap((record) => record.verification.errors),
  networkCalls: sharedBatch.networkCalls,
  batchCalls: sharedBatch.batchCalls,
  cacheHits: sharedBatch.cacheHits,
  coalesced: sharedBatch.coalesced,
  batchFallbacks: sharedBatch.batchFallbacks,
  images: sharedBatch.images
};
if (
  verification.status !== "verified"
  || verification.checked !== 10
  || verification.verified !== 10
  || verification.unresolved !== 0
  || verification.networkCalls !== 1
  || verification.batchCalls !== 1
  || verification.batchFallbacks !== 0
  || verification.images !== 2
) {
  throw new Error(`Live batched verification did not meet expectations: ${JSON.stringify(verification)}`);
}

const report = {
  officialBaseModelSource: {
    repository: "civitai/civitai",
    path: sourceDocument.path,
    blobSha: sourceDocument.sha,
    fetchedAt: new Date().toISOString()
  },
  families: {
    total: families.length,
    currentSelectable: families.filter((item) => !item.hidden && !item.disabled).length,
    hidden: families.filter((item) => item.hidden).length,
    disabled: families.filter((item) => item.disabled).length,
    structurallyPassed: families.length,
    labels: families.map((item) => item.name)
  },
  liveCheckpointVerification: {
    models: liveIdentities.map((item) => ({
      name: item.name,
      versionName: item.versionName,
      baseModel: item.baseModel,
      modelVersionId: item.modelVersionId
    })),
    metrics: verification
  }
};

console.log(JSON.stringify(report, null, 2));
