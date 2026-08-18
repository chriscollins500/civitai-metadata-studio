import test from "node:test";
import assert from "node:assert/strict";

globalThis.CMStudio = {};
for (const module of [
  "../src/core/constants.js",
  "../src/core/util.js",
  "../src/core/binary.js",
  "../src/core/crc32.js",
  "../src/core/sha256.js",
  "../src/core/air.js",
  "../src/core/civitai-contract.js",
  "../src/core/a1111.js",
  "../src/core/exif.js"
]) {
  await import(module);
}

const Studio = globalThis.CMStudio;

test("unified hash priority falls back from strongest to weakest", () => {
  const hashes = {
    SHA256: "A".repeat(64),
    BLAKE3: "B".repeat(64),
    AutoV3: "C".repeat(12),
    AutoV2: "D".repeat(10),
    CRC32: "E".repeat(8),
    AutoV1: "F".repeat(8)
  };

  for (const algorithm of Studio.constants.HASH_PRIORITY) {
    assert.deepEqual(Studio.util.selectHash(hashes), {
      algorithm,
      value: hashes[algorithm]
    });
    delete hashes[algorithm];
  }
  assert.deepEqual(Studio.util.selectHash(hashes), { algorithm: "", value: "" });
  assert.deepEqual(
    Studio.util.selectHash({ autov3: "abcdef123456" }),
    { algorithm: "AutoV3", value: "ABCDEF123456" }
  );
});

test("A1111 projection intentionally keeps its AutoV2 compatibility preference", () => {
  const hashes = {
    SHA256: "A".repeat(64),
    BLAKE3: "B".repeat(64),
    AutoV3: "C".repeat(12),
    AutoV2: "D".repeat(10)
  };
  const output = Studio.a1111.build({
    format: "png",
    fields: {
      positivePrompt: { value: "test prompt" },
      negativePrompt: { value: "" },
      modelName: { value: "example model" },
      modelHash: { value: hashes.SHA256 }
    },
    resources: [{
      name: "example model",
      role: "checkpoint",
      type: "Checkpoint",
      modelId: 12,
      modelVersionId: 34,
      verification: "verified",
      hashes
    }]
  });
  const parsed = Studio.a1111.parse(output);

  assert.equal(parsed.fields.modelHash, hashes.AutoV2);
  assert.equal(parsed.resources[0].hash, hashes.AutoV2);
  assert.deepEqual(parsed.resources[0].hashes, hashes);
});

test("incremental SHA-256 matches the standard abc vector", () => {
  const hash = new Studio.sha256.SHA256();
  hash.update(new TextEncoder().encode("a"));
  hash.update(new TextEncoder().encode("bc"));
  assert.equal(hash.hex(), "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD");
});

test("CRC-32 matches the standard 123456789 vector", () => {
  const bytes = new TextEncoder().encode("123456789");
  assert.equal(Studio.crc32.crc32(bytes).toString(16).toUpperCase(), "CBF43926");
});

test("Comfy JSON repair replaces only bare non-finite numbers", () => {
  assert.deepEqual(
    Studio.util.safeComfyJsonParse('{"changed":NaN,"upper":Infinity,"lower":-Infinity,"prompt":"NaN Infinity"}'),
    {
      changed: null,
      upper: null,
      lower: null,
      prompt: "NaN Infinity"
    }
  );
  assert.equal(Studio.util.safeJsonParse('{"changed":NaN}'), null);
});

test("AIR parser canonicalizes documented forms without guessing", () => {
  const parsed = Studio.air.parseAir("air:flux2:checkpoint:civitai:2432159@2734704");
  assert.equal(parsed.valid, true);
  assert.equal(parsed.canonicalAir, "urn:air:flux2:checkpoint:civitai:2432159@2734704");
  assert.equal(parsed.id, 2432159);
  assert.equal(parsed.version, 2734704);

  const malformed = Studio.air.parseAir("not-an-air");
  assert.equal(malformed.valid, false);
  assert.equal(malformed.rawAir, "not-an-air");
  assert.match(malformed.warning, /preserved/i);
});

test("AIR parser preserves documented bare, file-qualified, and non-Civitai identities", () => {
  const qualified = Studio.air.parseAir(
    "sdxl:checkpoint:civitai:827184@2514310+2402203.safetensor"
  );
  assert.equal(qualified.valid, true);
  assert.equal(
    qualified.canonicalAir,
    "urn:air:sdxl:checkpoint:civitai:827184@2514310+2402203.safetensor"
  );
  assert.equal(qualified.fileId, "2402203");
  assert.equal(qualified.format, "safetensor");

  const remoteAsset = Studio.air.parseAir(
    "urn:air:other:other:civitai-r2:civitai-worker-assets@sam_vit_b_01ec64.pth"
  );
  assert.equal(remoteAsset.valid, true);
  assert.equal(remoteAsset.id, null);
  assert.equal(remoteAsset.version, null);
  assert.equal(remoteAsset.format, "pth");

  const oci = Studio.air.parseAir(
    "urn:air:oci:image:ghcr:civitai/training-toolkit@sha256:abc123"
  );
  assert.equal(oci.valid, true);
  assert.equal(oci.identityId, "civitai/training-toolkit");
  assert.equal(oci.identityVersion, "sha256:abc123");

  const attached = Studio.air.attachFile(
    "urn:air:krea2:checkpoint:civitai:2786809@3140084",
    { fileId: "3000000", format: "SafeTensor" }
  );
  assert.equal(attached.valid, true);
  assert.equal(
    attached.canonicalAir,
    "urn:air:krea2:checkpoint:civitai:2786809@3140084+3000000.safetensor"
  );
  assert.equal(attached.rawAir, "urn:air:krea2:checkpoint:civitai:2786809@3140084");
});

test("Civitai URL parser enforces the exact host boundary", () => {
  assert.deepEqual(
    Studio.air.parseCivitaiUrl("https://civitai.com/models/123?modelVersionId=456"),
    { modelId: 123, modelVersionId: 456, url: "https://civitai.com/models/123?modelVersionId=456" }
  );
  assert.equal(Studio.air.parseCivitaiUrl("https://civitai.com.evil.test/models/123?modelVersionId=456"), null);
});

test("Civitai resource links use canonical HTTPS model and version pages", () => {
  assert.equal(
    Studio.air.civitaiResourceUrl({
      modelId: 123,
      modelVersionId: 456,
      sourceUrl: "http://www.civitai.com/models/999?modelVersionId=888"
    }),
    "https://civitai.com/models/123?modelVersionId=456"
  );
  assert.equal(
    Studio.air.civitaiResourceUrl({
      canonicalAir: "urn:air:sdxl:lora:civitai:321@654"
    }),
    "https://civitai.com/models/321?modelVersionId=654"
  );
  assert.equal(
    Studio.air.civitaiResourceUrl({
      sourceUrl: "https://civitai.com.evil.test/models/123?modelVersionId=456"
    }),
    ""
  );
});

test("A1111 parser keeps JSON commas intact and round-trips core fields", () => {
  const input = [
    "a luminous city",
    "Negative prompt: blur, noise",
    'Steps: 24, Sampler: DPM++ 2M, Schedule type: Karras, CFG scale: 4.5, Seed: 123, Size: 1024x768, Civitai resources: [{"modelId":12,"modelVersionId":34,"type":"Checkpoint"}]'
  ].join("\n");
  const parsed = Studio.a1111.parse(input);
  assert.equal(parsed.fields.positivePrompt, "a luminous city");
  assert.equal(parsed.fields.negativePrompt, "blur, noise");
  assert.equal(parsed.fields.steps, 24);
  assert.equal(parsed.fields.width, 1024);
  assert.equal(parsed.resources[0].modelVersionId, 34);
});

test("A1111 parser separates sampler-first settings from an empty negative prompt", () => {
  const parsed = Studio.a1111.parse([
    "portrait prompt",
    "Negative prompt: ",
    "Sampler: Euler, CFG scale: 2, Seed: 123, Model: example.gguf, Model hash: abcdef1234"
  ].join("\n"));

  assert.equal(parsed.fields.positivePrompt, "portrait prompt");
  assert.equal(parsed.fields.negativePrompt, "");
  assert.equal(parsed.fields.sampler, "Euler");
  assert.equal(parsed.fields.cfgScale, 2);
  assert.equal(parsed.fields.seed, "123");
  assert.equal(parsed.fields.modelName, "example.gguf");
  assert.equal(parsed.fields.modelHash, "abcdef1234");
});

test("A1111 parser does not mistake a prompt beginning with Model for settings", () => {
  const parsed = Studio.a1111.parse("Model: a person posing in soft studio light");

  assert.equal(parsed.fields.positivePrompt, "Model: a person posing in soft studio light");
  assert.equal(parsed.fields.negativePrompt, "");
  assert.equal(parsed.fields.modelName, undefined);
});

test("EXIF builder and parser preserve Unicode UserComment", () => {
  const record = {
    fields: {
      positivePrompt: { value: "portrait of 雪" },
      negativePrompt: { value: "artifact" },
      steps: { value: 20 },
      seed: { value: "99" },
      sampler: { value: "Euler" },
      scheduler: { value: "Normal" },
      cfgScale: { value: 7 },
      guidance: { value: "" },
      denoise: { value: "" },
      clipSkip: { value: 2 },
      width: { value: 768 },
      height: { value: 1024 },
      modelName: { value: "Example" },
      modelHash: { value: "ABCDEF1234" },
      vaeName: { value: "" },
      vaeHash: { value: "" }
    },
    resources: []
  };
  const bytes = Studio.exif.build(record);
  const parsed = Studio.exif.parse(bytes);
  assert.match(parsed.userComment, /portrait of 雪/);
  assert.match(parsed.userComment, /Steps: 20/);
  assert.equal(parsed.tagValues["exif:Exif:a002"].value, 768);
  assert.equal(parsed.tagValues["exif:Exif:a003"].value, 1024);
});

test("AutoV3 hashes the safetensors tensor payload and ignores metadata hash claims", async () => {
  const header = new TextEncoder().encode(JSON.stringify({
    __metadata__: { sshs_model_hash: "abcdef1234567890" }
  }));
  const payload = new TextEncoder().encode("tensor payload bytes");
  const model = new File(
    [Studio.binary.putU64le(header.length), header, payload],
    "payload.safetensors"
  );
  const expected = new Studio.sha256.SHA256().update(payload).hex().slice(0, 12);
  const hashes = await Studio.sha256.hashModelFile(model);
  assert.equal(hashes.AutoV3, expected);
  assert.notEqual(hashes.AutoV3, "ABCDEF123456");
});
