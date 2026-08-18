import test from "node:test";
import assert from "node:assert/strict";

globalThis.CMStudio = {};
globalThis.localStorage = {
  values: new Map(),
  setCalls: 0,
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) {
    this.setCalls += 1;
    this.values.set(key, String(value));
  },
  removeItem(key) { this.values.delete(key); },
  clear() {
    this.values.clear();
    this.setCalls = 0;
  }
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
  "../src/core/identity-cache.js",
  "../src/core/civitai.js"
]) {
  await import(module);
}

const Studio = globalThis.CMStudio;
async function clearCaches() {
  localStorage.clear();
  await Studio.civitai.clearCache();
}

const payload = {
  id: 34,
  modelId: 12,
  name: "Version One",
  baseModel: "SDXL 1.0",
  air: "urn:air:sdxl:checkpoint:civitai:12@34",
  trainedWords: ["example"],
  model: {
    id: 12,
    name: "Official Model",
    type: "Checkpoint",
    creator: { username: "creator" },
    allowNoCredit: false,
    allowCommercialUse: "Image",
    allowDerivatives: true,
    allowDifferentLicense: false
  },
  files: [{
    id: 56,
    name: "official.safetensors",
    primary: true,
    hashes: {
      AutoV2: "ABCDEF1234",
      SHA256: "A".repeat(64)
    }
  }]
};

function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("hash lookup requires the queried hash in a returned file", async () => {
  await clearCaches();
  let requested = "";
  globalThis.fetch = async (url, options) => {
    requested = String(url);
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    return response(payload);
  };
  const result = await Studio.civitai.lookupByHash("abcdef1234");
  assert.match(requested, /model-versions\/by-hash\/ABCDEF1234$/);
  assert.equal(result.identity.modelId, 12);
  assert.equal(result.identity.modelVersionId, 34);
  assert.equal(result.evidence.fileId, 56);
});

test("hash lookup rejects a response that does not echo the evidence", async () => {
  await clearCaches();
  globalThis.fetch = async () => response({
    ...payload,
    files: [{ ...payload.files[0], hashes: { AutoV2: "0000000000" } }]
  });
  await assert.rejects(
    Studio.civitai.lookupByHash("ABCDEF1234"),
    /did not contain the hash/i
  );
});

test("an empty successful role-aware hash response is a cached no-match", async () => {
  await clearCaches();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return response([]);
  };
  const resource = {
    name: "unlisted text encoder",
    role: "clip",
    type: "TextEncoder",
    hashes: { SHA256: "F".repeat(64) }
  };

  assert.equal((await Studio.civitai.verifyResource(resource)).status, "unresolved");
  assert.equal((await Studio.civitai.verifyResource(resource)).status, "unresolved");
  assert.equal(calls, 1);
});

test("temporary Civitai failures are retried before lookup fails", async () => {
  await clearCaches();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response("temporarily unavailable", { status: 503, headers: { "retry-after": "0" } })
      : response(payload);
  };

  const result = await Studio.civitai.lookupByVersion(34);

  assert.equal(result.identity.modelVersionId, 34);
  assert.equal(calls, 2);
});

test("version lookup enriches creator and license flags from the model endpoint", async () => {
  await clearCaches();
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url).endsWith("/model-versions/34")) {
      return response({
        ...payload,
        model: {
          name: payload.model.name,
          type: payload.model.type
        }
      });
    }
    if (String(url).endsWith("/models/12")) return response(payload.model);
    return response({}, 404);
  };

  const result = await Studio.civitai.lookupByVersion(34);

  assert.equal(result.identity.creator, "creator");
  assert.match(result.identity.license, /credit required/);
  assert.match(result.identity.license, /commercial: Image/);
  assert.deepEqual(requested.map((url) => new URL(url).pathname), [
    "/api/v1/model-versions/34",
    "/api/v1/models/12"
  ]);
});

test("empty Civitai commercial-use flags are displayed as none", () => {
  const identity = Studio.civitai.normalizeVersion({
    ...payload,
    model: {
      ...payload.model,
      allowCommercialUse: "{}"
    }
  });
  assert.match(identity.license, /commercial: none/);
});

test("re-verifying an ID-enriched resource retains its stronger hash evidence", async () => {
  await clearCaches();
  globalThis.fetch = async () => response(payload);
  const resource = {
    name: "Local filename",
    type: "Checkpoint",
    role: "checkpoint",
    modelId: 12,
    modelVersionId: 34,
    hashes: { AutoV2: "ABCDEF1234" }
  };

  const result = await Studio.civitai.verifyResource(resource);

  assert.deepEqual(result, { status: "verified" });
  assert.equal(resource.verificationMessage, "Exact AutoV2 match");
});

test("resource verification prefers AutoV3 over AutoV2", async () => {
  await clearCaches();
  const autoV3 = "C".repeat(12);
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return response({
      ...payload,
      files: [{
        ...payload.files[0],
        hashes: {
          AutoV2: "ABCDEF1234",
          AutoV3: autoV3
        }
      }]
    });
  };
  const resource = {
    name: "Local filename",
    type: "Checkpoint",
    role: "checkpoint",
    hashes: {
      AutoV2: "ABCDEF1234",
      AutoV3: autoV3
    }
  };

  const result = await Studio.civitai.verifyResource(resource);

  assert.deepEqual(result, { status: "verified" });
  assert.match(requested[0], new RegExp(`/model-versions/by-hash/${autoV3}$`, "u"));
  assert.equal(resource.verificationMessage, "Exact AutoV3 match");
});

test("a weaker matching hash cannot mask a stronger hash conflict", async () => {
  await clearCaches();
  globalThis.fetch = async () => response(payload);
  const resource = {
    name: "Conflicting local file",
    type: "Checkpoint",
    role: "checkpoint",
    modelId: 12,
    modelVersionId: 34,
    hashes: {
      AutoV2: "ABCDEF1234",
      SHA256: "B".repeat(64)
    }
  };

  const result = await Studio.civitai.verifyResource(resource);

  assert.deepEqual(result, { status: "conflict" });
  assert.match(resource.verificationMessage, /local hash does not match/i);
});

test("exact API verification enriches missing fields without replacing an existing name", () => {
  const resource = {
    name: "Local filename",
    type: "Checkpoint",
    role: "checkpoint",
    modelId: null,
    modelVersionId: null,
    hashes: { AutoV2: "ABCDEF1234" }
  };
  const result = {
    identity: Studio.civitai.normalizeVersion(payload, payload.files[0]),
    evidence: { kind: "hash", value: "ABCDEF1234", algorithm: "AutoV2" }
  };
  assert.deepEqual(Studio.civitai.applyIdentity(resource, result), { status: "verified" });
  assert.equal(resource.name, "Local filename");
  assert.equal(resource.modelId, 12);
  assert.equal(resource.modelVersionId, 34);
  assert.equal(resource.baseModel, "SDXL 1.0");
  assert.equal(resource.apiReference.name, "Official Model");
  assert.equal(resource.verification, "verified");
  assert.deepEqual(resource.verificationEvidence, {
    kind: "hash",
    algorithm: "AutoV2",
    value: "ABCDEF1234",
    fileId: null,
    claimedModelVersionId: null
  });
});

test("claimed IDs that disagree with exact API evidence remain a conflict", () => {
  const resource = {
    name: "Claimed",
    type: "Checkpoint",
    role: "checkpoint",
    modelId: 99,
    modelVersionId: 34,
    hashes: { AutoV2: "ABCDEF1234" }
  };
  const result = {
    identity: Studio.civitai.normalizeVersion(payload, payload.files[0]),
    evidence: { kind: "hash", value: "ABCDEF1234", algorithm: "AutoV2" }
  };
  assert.equal(Studio.civitai.applyIdentity(resource, result).status, "conflict");
  assert.equal(resource.modelId, 99);
  assert.equal(resource.verification, "conflict");
  assert.equal(resource.apiCandidate.modelId, 12);
});

test("record verification batches multiple model version IDs into one API request", async () => {
  await clearCaches();
  const second = {
    ...payload,
    id: 35,
    name: "Version Two",
    air: "urn:air:sdxl:checkpoint:civitai:12@35",
    files: [{
      ...payload.files[0],
      id: 57,
      name: "second.safetensors",
      hashes: { AutoV2: "BBBBBBBBBB", SHA256: "B".repeat(64) }
    }]
  };
  const requested = [];
  globalThis.fetch = async (url, options) => {
    requested.push({ url: String(url), method: options.method });
    return response({
      items: [{
        ...payload.model,
        modelVersions: [
          { ...payload, model: undefined },
          { ...second, model: undefined }
        ]
      }]
    });
  };
  const record = {
    dirty: false,
    resources: [
      { name: "one", type: "Checkpoint", role: "checkpoint", modelVersionId: 34, hashes: {} },
      { name: "two", type: "Checkpoint", role: "checkpoint", modelVersionId: 35, hashes: {} }
    ]
  };

  const verification = await Studio.civitai.verifyRecord(record);

  assert.equal(verification.verified, 2);
  assert.equal(verification.networkCalls, 1);
  assert.equal(verification.batchCalls, 1);
  assert.equal(requested.length, 1);
  assert.equal(requested[0].method, "GET");
  assert.match(requested[0].url, /models\?limit=100&modelVersionIds=34,35$/);
});

test("a model-version batch omission falls back to one direct exact lookup", async () => {
  await clearCaches();
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url).includes("/models?")) return response({ items: [] });
    if (String(url).endsWith("/model-versions/34")) return response(payload);
    return response({}, 404);
  };
  const resource = {
    name: "AIR-backed resource",
    type: "Checkpoint",
    role: "checkpoint",
    modelId: 12,
    modelVersionId: 34,
    canonicalAir: "urn:air:sdxl:checkpoint:civitai:12@34",
    hashes: {}
  };
  const record = { dirty: false, resources: [resource] };

  const first = await Studio.civitai.verifyRecord(record);
  const callsAfterFirst = requested.length;
  const firstMessage = resource.verificationMessage;
  const firstEvidence = { ...resource.verificationEvidence };
  const second = await Studio.civitai.verifyRecord(record);

  assert.equal(first.verified, 1);
  assert.equal(first.networkCalls, 2);
  assert.equal(first.batchCalls, 1);
  assert.equal(resource.canonicalAir, payload.air);
  assert.equal(firstMessage, "Exact model version ID 34");
  assert.equal(firstEvidence.kind, "modelVersionId");
  assert.deepEqual(requested.map((url) => new URL(url).pathname), [
    "/api/v1/models",
    "/api/v1/model-versions/34"
  ]);
  assert.equal(second.verified, 1);
  assert.equal(second.networkCalls, 0);
  assert.equal(requested.length, callsAfterFirst);
});

test("SHA256-only resources use one full-candidate batch for all exact identities", async () => {
  await clearCaches();
  const second = {
    ...payload,
    id: 35,
    name: "Version Two",
    air: "urn:air:sdxl:checkpoint:civitai:12@35",
    files: [{
      ...payload.files[0],
      id: 57,
      name: "second.safetensors",
      hashes: { AutoV2: "BBBBBBBBBB", SHA256: "B".repeat(64) }
    }]
  };
  const requested = [];
  globalThis.fetch = async (url, options) => {
    requested.push({ url: String(url), method: options.method, body: options.body });
    if (String(url).endsWith("/model-versions/by-hash")) {
      return response([payload, second]);
    }
    return response({
      items: [{
        ...payload.model,
        modelVersions: [
          { ...payload, model: undefined },
          { ...second, model: undefined }
        ]
      }]
    });
  };
  const record = {
    dirty: false,
    resources: [
      { name: "one", type: "Checkpoint", role: "checkpoint", hashes: { SHA256: "A".repeat(64) } },
      { name: "two", type: "Checkpoint", role: "checkpoint", hashes: { SHA256: "B".repeat(64) } }
    ]
  };

  const first = await Studio.civitai.verifyRecord(record);
  const callsAfterFirst = requested.length;
  const secondVerification = await Studio.civitai.verifyRecord(record);

  assert.equal(first.verified, 2);
  assert.equal(first.networkCalls, 1);
  assert.equal(first.batchCalls, 1);
  assert.equal(callsAfterFirst, 1);
  assert.equal(requested[0].method, "POST");
  assert.deepEqual(JSON.parse(requested[0].body), ["A".repeat(64), "B".repeat(64)]);
  assert.equal(secondVerification.verified, 2);
  assert.equal(secondVerification.networkCalls, 0);
  assert.equal(requested.length, callsAfterFirst);
});

test("shared SHA256 candidates are disambiguated by resource role without extra API calls", async () => {
  await clearCaches();
  const shared = "C".repeat(64);
  const checkpoint = {
    ...payload,
    files: [{ ...payload.files[0], hashes: { SHA256: shared } }]
  };
  const vae = {
    ...payload,
    id: 99,
    name: "VAE version",
    air: "urn:air:sdxl:vae:civitai:88@99",
    modelId: 88,
    model: {
      ...payload.model,
      id: 88,
      name: "Exact VAE",
      type: "VAE"
    },
    files: [{
      ...payload.files[0],
      id: 100,
      name: "vae.safetensors",
      type: "VAE",
      hashes: { SHA256: shared }
    }]
  };
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.match(String(url), /model-versions\/by-hash$/u);
    assert.equal(options.method, "POST");
    return response([checkpoint, vae]);
  };
  const record = {
    dirty: false,
    resources: [{
      name: "local VAE",
      role: "vae",
      type: "VAE",
      hashes: { SHA256: shared }
    }]
  };

  const verification = await Studio.civitai.verifyRecord(record);

  assert.equal(verification.verified, 1);
  assert.equal(calls, 1);
  assert.equal(record.resources[0].modelVersionId, 99);
  assert.equal(record.resources[0].fileId, 100);
  assert.equal(record.resources[0].lookupDiagnostics.candidateCount, 2);
  assert.equal(record.resources[0].lookupDiagnostics.compatibleCandidateCount, 1);
});

test("multiple role-compatible shared-hash identities remain an explicit conflict", async () => {
  await clearCaches();
  const shared = "D".repeat(64);
  const second = {
    ...payload,
    id: 35,
    air: "urn:air:sdxl:checkpoint:civitai:12@35",
    files: [{ ...payload.files[0], id: 57, hashes: { SHA256: shared } }]
  };
  globalThis.fetch = async () => response([
    { ...payload, files: [{ ...payload.files[0], hashes: { SHA256: shared } }] },
    second
  ]);
  const resource = {
    name: "ambiguous checkpoint",
    role: "checkpoint",
    type: "Checkpoint",
    hashes: { SHA256: shared }
  };

  const result = await Studio.civitai.verifyResource(resource);

  assert.equal(result.status, "conflict");
  assert.match(resource.verificationMessage, /multiple compatible/i);
  assert.equal(resource.lookupDiagnostics.candidateCount, 2);
  assert.equal(resource.parserFacing, false);
});

test("version responses cross-fill the hash cache", async () => {
  await clearCaches();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return response(payload);
  };

  await Studio.civitai.lookupByVersion(34);
  const result = await Studio.civitai.lookupByHash("A".repeat(64));

  assert.equal(result.identity.modelVersionId, 34);
  assert.equal(calls, 1);
});

test("algorithm-qualified hash mappings keep CRC32 and AutoV1 identities separate", async () => {
  await clearCaches();
  const sharedHash = "DEADBEEF";
  const crcVersion = {
    ...payload,
    id: 40,
    name: "CRC version",
    air: "urn:air:sdxl:lora:civitai:12@40",
    model: { ...payload.model, type: "LORA" },
    files: [{
      ...payload.files[0],
      id: 60,
      hashes: { CRC32: sharedHash }
    }]
  };
  const autoV1Version = {
    ...payload,
    id: 41,
    name: "AutoV1 version",
    air: "urn:air:sdxl:lora:civitai:12@41",
    model: { ...payload.model, type: "LORA" },
    files: [{
      ...payload.files[0],
      id: 61,
      hashes: { AutoV1: sharedHash }
    }]
  };
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    return response(String(url).endsWith("/40") ? crcVersion : autoV1Version);
  };

  await Studio.civitai.lookupByVersion(40);
  await Studio.civitai.lookupByVersion(41);
  const resource = {
    name: "AutoV1 resource",
    type: "LORA",
    role: "lora",
    hashes: { AutoV1: sharedHash }
  };

  const result = await Studio.civitai.verifyResource(resource);

  assert.equal(result.status, "verified");
  assert.equal(resource.modelVersionId, 41);
  assert.equal(resource.verificationMessage, "Exact AutoV1 match");
  assert.equal(calls, 2);
});

test("identity cache stores one version payload and candidate sets per algorithm", async () => {
  await clearCaches();
  globalThis.fetch = async () => response(payload);

  await Studio.civitai.lookupByVersion(34);

  const stored = JSON.parse([...localStorage.values.values()][0]).entries;
  assert.ok(stored["version:34"]);
  assert.equal(stored[`hash-miss:${"A".repeat(64)}`], undefined);
  assert.equal(stored[`hash-candidates:SHA256:${"A".repeat(64)}`].value.candidates[0].modelVersionId, 34);
  assert.equal(stored["hash-candidates:AutoV2:ABCDEF1234"].value.candidates[0].modelVersionId, 34);
  assert.ok(localStorage.setCalls <= 3);
  const stats = await Studio.civitai.cacheStats();
  assert.equal(stats.backend, "localStorage");
  assert.equal(stats.versions, 1);
  assert.equal(stats.records, 4);
});

test("404 misses are negatively cached for repeated lookups", async () => {
  await clearCaches();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return response({}, 404);
  };

  assert.equal(await Studio.civitai.lookupByVersion(999), null);
  assert.equal(await Studio.civitai.lookupByVersion(999), null);
  assert.equal(calls, 1);
});

test("HTTP 429 is not retried and opens a shared cooldown", async () => {
  await clearCaches();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
  };

  await assert.rejects(
    Studio.civitai.lookupByVersion(34),
    /rate-limited/i
  );
  assert.equal(calls, 1);
  await assert.rejects(
    Studio.civitai.lookupByVersion(35),
    /no additional requests/i
  );
  assert.equal(calls, 1);
});

test("explicit Civitai image lookup normalizes aliases without caching prompt data", async () => {
  await clearCaches();
  let requested = "";
  globalThis.fetch = async (url) => {
    requested = String(url);
    return response({
      items: [{
        id: 123456,
        width: 1024,
        height: 1536,
        modelVersionId: 34,
        modelVersionIds: [34, 35],
        meta: {
          prompt: "public prompt",
          "Negative prompt": "public negative",
          Steps: 24,
          "CFG scale": 4.5,
          Size: "768x1152",
          resources: [{ modelId: 12, modelVersionId: 34, type: "Checkpoint" }]
        }
      }]
    });
  };

  const result = await Studio.civitai.lookupImage("https://civitai.com/images/123456");

  assert.match(requested, /\/images\?imageId=123456&limit=1$/u);
  assert.equal(result.fields.positivePrompt, "public prompt");
  assert.equal(result.fields.negativePrompt, "public negative");
  assert.equal(result.fields.cfgScale, 4.5);
  assert.equal(result.fields.width, 768);
  assert.equal(result.fields.height, 1152);
  assert.deepEqual(
    [...new Set(result.resources.map((resource) => resource.modelVersionId))].sort(),
    [34, 35]
  );
  const stored = [...localStorage.values.values()].join("\n");
  assert.doesNotMatch(stored, /public prompt/u);
  assert.equal(Studio.civitai.parseCivitaiImageId("https://civitai.com.evil.test/images/123456"), null);
});
