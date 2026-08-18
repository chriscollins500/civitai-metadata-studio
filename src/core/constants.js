(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};

  Studio.constants = Object.freeze({
    APP_NAME: "Civitai Metadata Studio",
    APP_VERSION: "0.5.0",
    SCHEMA: "civitai-metadata-studio.record",
    API_ROOT: "https://civitai.com/api/v1",
    API_RESPONSE_LIMIT: 4 * 1024 * 1024,
    METADATA_VALUE_LIMIT: 16 * 1024 * 1024,
    HASH_CHUNK_SIZE: 8 * 1024 * 1024,
    HASH_PRIORITY: Object.freeze(["SHA256", "BLAKE3", "AutoV3", "AutoV2", "CRC32", "AutoV1"]),
    A1111_HASH_PRIORITY: Object.freeze(["AutoV2", "SHA256", "BLAKE3", "AutoV3", "AutoV1", "CRC32"]),
    HASH_LENGTHS: Object.freeze({
      SHA256: 64,
      BLAKE3: 64,
      AutoV3: 12,
      AutoV2: 10,
      CRC32: 8,
      AutoV1: 8
    }),
    SUPPORTED_FORMATS: Object.freeze(["png", "jpeg", "webp"]),
    GENERATION_FIELDS: Object.freeze([
      Object.freeze({ key: "positivePrompt", label: "Positive prompt", kind: "text" }),
      Object.freeze({ key: "negativePrompt", label: "Negative prompt", kind: "text" }),
      Object.freeze({ key: "steps", label: "Steps", kind: "integer" }),
      Object.freeze({ key: "seed", label: "Seed", kind: "integerText" }),
      Object.freeze({ key: "sampler", label: "Sampler", kind: "text" }),
      Object.freeze({ key: "scheduler", label: "Scheduler", kind: "text" }),
      Object.freeze({ key: "cfgScale", label: "CFG scale", kind: "number" }),
      Object.freeze({ key: "guidance", label: "Guidance", kind: "number" }),
      Object.freeze({ key: "denoise", label: "Denoising strength", kind: "number" }),
      Object.freeze({ key: "clipSkip", label: "Clip skip", kind: "integer" }),
      Object.freeze({ key: "width", label: "Width", kind: "integer" }),
      Object.freeze({ key: "height", label: "Height", kind: "integer" }),
      Object.freeze({ key: "modelName", label: "Primary model", kind: "text" }),
      Object.freeze({ key: "modelHash", label: "Primary model hash", kind: "hash" }),
      Object.freeze({ key: "vaeName", label: "VAE", kind: "text" }),
      Object.freeze({ key: "vaeHash", label: "VAE hash", kind: "hash" })
    ]),
    RESOURCE_ROLES: Object.freeze([
      ["checkpoint", "Checkpoint / primary model"],
      ["lora", "LoRA / LyCORIS"],
      ["vae", "VAE"],
      ["embedding", "Embedding / textual inversion"],
      ["controlnet", "ControlNet"],
      ["ipadapter", "IPAdapter"],
      ["upscaler", "Upscaler"],
      ["clip", "CLIP / text encoder"],
      ["vision_encoder", "Vision encoder / CLIP Vision"],
      ["unet", "UNet / diffusion model"],
      ["refiner", "Refiner"],
      ["motion", "Motion module"],
      ["hypernetwork", "Hypernetwork"],
      ["other", "Other"]
    ]),
    RESOURCE_TYPES: Object.freeze([
      ["Checkpoint", "Checkpoint"],
      ["LORA", "LoRA"],
      ["VAE", "VAE"],
      ["TextualInversion", "Textual inversion"],
      ["Controlnet", "ControlNet"],
      ["Upscaler", "Upscaler"],
      ["Hypernetwork", "Hypernetwork"],
      ["TextEncoder", "Text encoder"],
      ["UNet", "UNet"],
      ["CLIPVision", "CLIP Vision"],
      ["MotionModule", "Motion module"],
      ["Other", "Other"]
    ]),
    SOURCE_PRIORITY: Object.freeze({
      manual: 100,
      image_header: 95,
      api_exact: 90,
      civitai_manifest: 80,
      civitai_image: 75,
      exif: 70,
      a1111: 65,
      comfy_active: 60,
      filename: 10,
      unknown: 0
    })
  });
})();
