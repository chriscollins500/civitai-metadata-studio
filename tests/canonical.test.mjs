import test from "node:test";
import assert from "node:assert/strict";

globalThis.CMStudio = {};
for (const module of [
  "../src/core/constants.js",
  "../src/core/util.js",
  "../src/core/air.js",
  "../src/core/civitai-contract.js",
  "../src/core/canonical.js"
]) {
  await import(module);
}

const { canonical } = globalThis.CMStudio;

test("save-node identity, hash, and active filename evidence merge into one resource", () => {
  const resources = [
    canonical.normalizeResource({
      air: "urn:air:krea2:checkpoint:civitai:2726029@3091481",
      modelId: 2726029,
      modelName: "Krea 2 Turbo",
      modelVersionId: 3091481,
      type: "checkpoint"
    }, "a1111"),
    canonical.normalizeResource({
      active: true,
      filename: "krea2_turbo.safetensors",
      role: "base_model",
      type: "diffusion_model",
      hashes: {
        SHA256: "A".repeat(64),
        AutoV2: "A".repeat(10)
      },
      identity: {
        canonicalAir: "urn:air:krea2:checkpoint:civitai:2726029@3091481",
        modelId: 2726029,
        modelName: "Krea 2 Turbo",
        modelVersionId: 3091481,
        modelVersionName: "Turbo",
        type: "checkpoint"
      }
    }, "civitai_manifest"),
    canonical.normalizeResource({
      name: "krea2_turbo.safetensors",
      filename: "krea2_turbo.safetensors",
      role: "unet",
      type: "Checkpoint",
      identitySource: "comfy_active"
    }, "comfy_active")
  ];

  const merged = canonical.mergeResources(resources);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].filename, "krea2_turbo.safetensors");
  assert.equal(merged[0].modelVersionId, 3091481);
  assert.equal(merged[0].hashes.AutoV2, "A".repeat(10));
  assert.match(merged[0].evidence, /comfy_active/i);
  assert.notEqual(merged[0].filename, "unnamed");
});

test("inactive structured manifest resources are not imported", () => {
  const parts = canonical.manifestParts({
    resources: [
      { name: "active.safetensors", active: true },
      { name: "inactive.safetensors", active: false },
      { name: "bypassed.safetensors", status: "bypassed" },
      { name: "muted.safetensors", mode: 2 }
    ]
  });

  assert.deepEqual(parts.resources.map((resource) => resource.name), ["active.safetensors"]);
});

test("conflicting IDs and distinct LoRA strengths remain separate resources", () => {
  const conflictingIds = canonical.mergeResources([
    canonical.normalizeResource({ filename: "same.safetensors", role: "checkpoint", modelVersionId: 1 }, "manual"),
    canonical.normalizeResource({ filename: "same.safetensors", role: "checkpoint", modelVersionId: 2 }, "manual")
  ]);
  const distinctStrengths = canonical.mergeResources([
    canonical.normalizeResource({ filename: "style.safetensors", role: "lora", modelVersionId: 3, weight: 0.6 }, "manual"),
    canonical.normalizeResource({ filename: "style.safetensors", role: "lora", modelVersionId: 3, weight: 0.9 }, "manual")
  ]);

  assert.equal(conflictingIds.length, 2);
  assert.equal(distinctStrengths.length, 2);
});

test("structured manifest retains every resource while parser metadata uses only verified compatible identities", () => {
  const verified = canonical.normalizeResource({
    name: "Exact LoRA",
    role: "lora",
    type: "LORA",
    modelId: 10,
    modelVersionId: 20,
    fileId: 30,
    filePrimary: false,
    format: "SafeTensor",
    rawAir: "urn:air:sdxl:lora:civitai:10@20",
    verification: "verified",
    hashes: { AutoV2: "ABCDEF1234" }
  }, "api_exact");
  const duplicate = { ...structuredClone(verified), key: "duplicate" };
  const unresolved = canonical.normalizeResource({
    name: "Name-only candidate",
    role: "lora",
    type: "LORA",
    modelVersionId: 40,
    verification: "unresolved"
  }, "prompt_name");
  const manifest = canonical.buildManifest({
    format: "png",
    fields: {},
    resources: [verified, duplicate, unresolved],
    verification: { status: "partial", checked: 3, verified: 1, unresolved: 1 }
  });

  assert.equal(manifest.resources.length, 3);
  assert.equal(manifest.civitaiResources.length, 1);
  assert.equal(manifest.civitaiResources[0].modelVersionId, 20);
  assert.equal(manifest.resources[0].identityScope, "exact_file");
  assert.equal(manifest.resources[0].parserFacing, true);
  assert.equal(manifest.resources[2].parserFacing, false);
  assert.equal(manifest.resources[2].parserExclusionReason, "identity_incomplete");
  assert.deepEqual(manifest.unresolvedResources.map((item) => item.name), ["Name-only candidate"]);
});
