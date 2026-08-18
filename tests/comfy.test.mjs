import test from "node:test";
import assert from "node:assert/strict";

globalThis.CMStudio = {};
for (const module of [
  "../src/core/constants.js",
  "../src/core/util.js",
  "../src/core/comfy.js"
]) {
  await import(module);
}

const { comfy } = globalThis.CMStudio;

test("Comfy scanner follows only nodes upstream of an output and handles custom sampler families", () => {
  const graph = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "models\\primary.safetensors" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "portrait embedding:detail" } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: "blur" } },
    "4": { class_type: "CFGGuider", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], cfg: 3.5 } },
    "5": { class_type: "RandomNoise", inputs: { noise_seed: 12345 } },
    "6": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "7": { class_type: "BasicScheduler", inputs: { model: ["1", 0], scheduler: "normal", steps: 20, denoise: 1 } },
    "8": { class_type: "SamplerCustomAdvanced", inputs: { guider: ["4", 0], noise: ["5", 0], sampler: ["6", 0], sigmas: ["7", 0] } },
    "9": { class_type: "SaveImage", inputs: { images: ["8", 0] } },
    "99": { class_type: "LoraLoader", inputs: { lora_name: "disconnected.safetensors", model: ["1", 0] } }
  };
  const result = comfy.scan(graph);
  assert.equal(result.fields.positivePrompt, "portrait embedding:detail");
  assert.equal(result.fields.negativePrompt, "blur");
  assert.equal(result.fields.seed, 12345);
  assert.equal(result.fields.steps, 20);
  assert.equal(result.fields.sampler, "euler");
  assert.equal(result.fields.scheduler, "normal");
  assert.ok(result.resources.some((resource) => resource.role === "checkpoint" && resource.name === "primary.safetensors"));
  assert.ok(result.resources.some((resource) => resource.role === "embedding" && resource.name === "detail"));
  assert.ok(!result.resources.some((resource) => resource.name === "disconnected.safetensors"));
});

test("zeroed conditioning is an empty prompt rather than its upstream text", () => {
  const prompt = "A positive prompt that must not become negative";
  const result = comfy.scan({
    "1": { class_type: "CLIPTextEncode", inputs: { text: prompt } },
    "2": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["1", 0] } },
    "3": {
      class_type: "ClownsharKSampler_Beta",
      inputs: {
        positive: ["1", 0],
        negative: ["2", 0],
        steps: 8,
        sampler_name: "euler",
        scheduler: "normal"
      }
    },
    "4": { class_type: "SaveImage", inputs: { images: ["3", 0] } }
  });

  assert.equal(result.fields.positivePrompt, prompt);
  assert.equal(result.fields.negativePrompt, undefined);
});

test("Comfy scanner does not infer resources when no output root is identifiable", () => {
  const result = comfy.scan({
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "possibly-unused.safetensors" } },
    "2": { class_type: "MysteryTransform", inputs: { model: ["1", 0] } }
  });

  assert.deepEqual(result.resources, []);
  assert.match(result.warnings.join(" "), /no output node was identifiable/i);
});

test("Comfy scanner follows only the selected branch of a literal switch", () => {
  const result = comfy.scan({
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "selected.safetensors" } },
    "2": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "inactive.safetensors" } },
    "3": {
      class_type: "ModelSwitch",
      inputs: { select: 1, model1: ["1", 0], model2: ["2", 0] }
    },
    "4": { class_type: "KSampler", inputs: { model: ["3", 0], steps: 10 } },
    "5": { class_type: "SaveImage", inputs: { images: ["4", 0] } }
  });

  const names = result.resources.map((resource) => resource.name);
  assert.ok(names.includes("selected.safetensors"));
  assert.ok(!names.includes("inactive.safetensors"));
  assert.equal(result.warnings.some((warning) => /switch or selector/i.test(warning)), false);
});

test("Comfy scanner resolves a linked PrimitiveBoolean before following a switch branch", () => {
  const result = comfy.scan({
    "1": { class_type: "UNETLoader", inputs: { unet_name: "krea2-base.safetensors" } },
    "2": {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        lora_name: "configured-but-disabled.safetensors",
        model: ["1", 0],
        strength_model: 0.8
      }
    },
    "3": { class_type: "PrimitiveBoolean", inputs: { value: false } },
    "4": {
      class_type: "ComfySwitchNode",
      inputs: {
        on_false: ["1", 0],
        on_true: ["2", 0],
        switch: ["3", 0]
      }
    },
    "5": { class_type: "KSampler", inputs: { model: ["4", 0], steps: 8 } },
    "6": { class_type: "SaveImage", inputs: { images: ["5", 0] } }
  });

  const names = result.resources.map((resource) => resource.name);
  assert.ok(names.includes("krea2-base.safetensors"));
  assert.ok(!names.includes("configured-but-disabled.safetensors"));
  assert.equal(result.warnings.some((warning) => /switch or selector/i.test(warning)), false);
});

test("unresolved switch branches are diagnostic-only and cannot become resource claims", () => {
  const result = comfy.scan({
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "branch-one.safetensors" } },
    "2": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "branch-two.safetensors" } },
    "3": { class_type: "RuntimeSelector", inputs: { seed: 123 } },
    "4": {
      class_type: "ModelSwitch",
      inputs: { select: ["3", 0], model1: ["1", 0], model2: ["2", 0] }
    },
    "5": { class_type: "KSampler", inputs: { model: ["4", 0], steps: 10 } },
    "6": { class_type: "SaveImage", inputs: { images: ["5", 0] } }
  });

  assert.deepEqual(result.resources, []);
  assert.match(result.warnings.join(" "), /branch-only metadata.*excluded/i);
});

test("Comfy scanner excludes explicitly disabled stack slots", () => {
  const result = comfy.scan({
    "1": {
      class_type: "CR LoRA Stack",
      inputs: {
        switch_1: "On",
        lora_name_1: "active-lora.safetensors",
        switch_2: "Off",
        lora_name_2: "disabled-lora.safetensors"
      }
    },
    "2": { class_type: "StackConsumer", inputs: { lora_stack: ["1", 0] } },
    "3": { class_type: "SaveImage", inputs: { images: ["2", 0] } }
  });

  const names = result.resources.map((resource) => resource.name);
  assert.ok(names.includes("active-lora.safetensors"));
  assert.ok(!names.includes("disabled-lora.safetensors"));
});

test("rgthree Power LoRA objects include only enabled entries", () => {
  const result = comfy.scan({
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "base.safetensors" } },
    "2": {
      class_type: "Power Lora Loader (rgthree)",
      inputs: {
        PowerLoraLoaderHeaderWidget: { type: "PowerLoraLoaderHeaderWidget" },
        lora_1: { on: false, lora: "disabled.safetensors", strength: 0.7 },
        lora_2: { on: true, lora: "active.safetensors", strength: 0.85 },
        model: ["1", 0]
      }
    },
    "3": { class_type: "KSampler", inputs: { model: ["2", 0], steps: 10 } },
    "4": { class_type: "SaveImage", inputs: { images: ["3", 0] } }
  });

  assert.deepEqual(
    result.resources.map(({ name, role, weight }) => ({ name, role, weight })),
    [
      { name: "active.safetensors", role: "lora", weight: 0.85 },
      { name: "base.safetensors", role: "checkpoint", weight: null }
    ]
  );
});
