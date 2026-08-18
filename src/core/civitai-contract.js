(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { positiveIdOrNull, sanitizeText } = Studio.util;

  const MODEL_TYPES = Object.freeze([
    "Checkpoint",
    "TextualInversion",
    "Hypernetwork",
    "AestheticGradient",
    "LORA",
    "LoCon",
    "DoRA",
    "Controlnet",
    "Upscaler",
    "MotionModule",
    "VAE",
    "TextEncoder",
    "UNet",
    "CLIPVision",
    "Poses",
    "Wildcards",
    "Workflows",
    "Detection",
    "VisionLanguage",
    "CLIP",
    "LLM",
    "Other"
  ]);

  const MODEL_FILE_TYPES = Object.freeze([
    "Model",
    "Text Encoder",
    "Vision Encoder",
    "Pruned Model",
    "Negative",
    "Training Data",
    "VAE",
    "Config",
    "Archive",
    "UNet",
    "Diffusion Model",
    "CLIPVision",
    "ControlNet",
    "Workflow",
    "Upscaler",
    "Enhancement LoRA",
    "Other"
  ]);

  const MODEL_TYPE_MAP = Object.freeze({
    checkpoint: "checkpoint",
    controlnet: "controlnet",
    dora: "dora",
    hypernetwork: "hypernet",
    locon: "locon",
    lora: "lora",
    motionmodule: "motion",
    textencoder: "text_encoders",
    textualinversion: "embedding",
    unet: "unet",
    upscaler: "upscaler",
    vae: "vae"
  });

  const ROLE_TYPES = Object.freeze({
    checkpoint: Object.freeze(["checkpoint", "diffusionmodel", "unet"]),
    unet: Object.freeze(["checkpoint", "diffusionmodel", "unet"]),
    refiner: Object.freeze(["checkpoint", "diffusionmodel", "unet"]),
    controlnet: Object.freeze(["controlnet"]),
    embedding: Object.freeze(["embedding"]),
    hypernetwork: Object.freeze(["hypernet"]),
    ipadapter: Object.freeze(["controlnet"]),
    lora: Object.freeze(["dora", "locon", "lora", "lycoris"]),
    clip: Object.freeze(["text_encoders", "textencoder"]),
    vision_encoder: Object.freeze(["unknown"]),
    motion: Object.freeze(["motion"]),
    upscaler: Object.freeze(["upscaler"]),
    vae: Object.freeze(["vae"])
  });

  const AMBIGUOUS_ROLE_TYPES = Object.freeze({
    checkpoint: Object.freeze(["other", "unknown"]),
    unet: Object.freeze(["other", "unknown"]),
    refiner: Object.freeze(["other", "unknown"]),
    controlnet: Object.freeze(["other", "unknown"]),
    embedding: Object.freeze(["other", "unknown"]),
    hypernetwork: Object.freeze(["other", "unknown"]),
    ipadapter: Object.freeze(["checkpoint", "other", "unknown"]),
    lora: Object.freeze(["other", "unknown"]),
    clip: Object.freeze([]),
    vision_encoder: Object.freeze(["other"]),
    motion: Object.freeze(["other", "unknown"]),
    upscaler: Object.freeze(["other", "unknown"]),
    vae: Object.freeze(["other", "unknown"])
  });

  const FILE_TYPE_ROLES = Object.freeze({
    clipvision: Object.freeze(["vision_encoder"]),
    controlnet: Object.freeze(["controlnet", "ipadapter"]),
    "diffusion model": Object.freeze(["checkpoint", "unet", "refiner"]),
    "enhancement lora": Object.freeze(["lora"]),
    negative: Object.freeze(["embedding"]),
    "pruned model": Object.freeze(["checkpoint", "unet", "refiner"]),
    "text encoder": Object.freeze(["clip"]),
    unet: Object.freeze(["checkpoint", "unet", "refiner"]),
    upscaler: Object.freeze(["upscaler"]),
    vae: Object.freeze(["vae"]),
    "vision encoder": Object.freeze(["vision_encoder"])
  });

  const ROLE_OUTPUT_TYPE = Object.freeze({
    checkpoint: "checkpoint",
    unet: "unet",
    refiner: "checkpoint",
    controlnet: "controlnet",
    embedding: "embedding",
    hypernetwork: "hypernet",
    ipadapter: "controlnet",
    lora: "lora",
    clip: "text_encoders",
    vision_encoder: "unknown",
    motion: "motion",
    upscaler: "upscaler",
    vae: "vae"
  });

  const knownModelTypes = new Set(MODEL_TYPES.map((value) => value.toLowerCase()));
  const canonicalFileTypes = new Map(MODEL_FILE_TYPES.map((value) => [value.toLowerCase(), value]));
  const FORMAT_ALIASES = Object.freeze({
    safetensor: "safetensor",
    safetensors: "safetensor"
  });

  function modelTypeToResourceType(value) {
    const normalized = sanitizeText(value || "", 80).trim().toLowerCase();
    if (!normalized || !knownModelTypes.has(normalized)) return null;
    return MODEL_TYPE_MAP[normalized] || "unknown";
  }

  function normalizeModelFileType(value) {
    return canonicalFileTypes.get(sanitizeText(value || "", 80).trim().toLowerCase()) || null;
  }

  function normalizeModelFileFormat(value) {
    const normalized = sanitizeText(value || "", 40).trim().toLowerCase();
    if (!normalized || normalized === "other") return null;
    return FORMAT_ALIASES[normalized] || normalized;
  }

  function modelFileTypeMatchesRole(role, fileType) {
    const normalized = normalizeModelFileType(fileType);
    if (!normalized) return false;
    return (FILE_TYPE_ROLES[normalized.toLowerCase()] || []).includes(role);
  }

  function resourceTypeMatchesRole(role, resourceType, { allowAmbiguous = false } = {}) {
    const normalized = sanitizeText(resourceType || "", 80).trim().toLowerCase();
    if (!normalized || !ROLE_TYPES[role]) return false;
    if (ROLE_TYPES[role].includes(normalized)) return true;
    return allowAmbiguous && (AMBIGUOUS_ROLE_TYPES[role] || []).includes(normalized);
  }

  function identityResourceType(identity) {
    const parsed = Studio.air?.parseAir(identity?.canonicalAir || identity?.rawAir || "");
    if (parsed?.valid && parsed.type) return parsed.type;
    return identity?.resourceType
      || modelTypeToResourceType(identity?.type)
      || sanitizeText(identity?.type || "", 80).trim().toLowerCase()
      || null;
  }

  function identityMatchesRole(role, identity, { allowAmbiguous = false, allowFileEvidence = true } = {}) {
    return resourceTypeMatchesRole(role, identityResourceType(identity), { allowAmbiguous })
      || (allowFileEvidence && modelFileTypeMatchesRole(role, identity?.fileType));
  }

  function outputResourceType(resource) {
    const identityType = identityResourceType(resource);
    if (resourceTypeMatchesRole(resource?.role, identityType, { allowAmbiguous: false })) return identityType;
    if (modelFileTypeMatchesRole(resource?.role, resource?.fileType)) return ROLE_OUTPUT_TYPE[resource.role] || null;
    if (resourceTypeMatchesRole(resource?.role, identityType, { allowAmbiguous: true })) {
      return ROLE_OUTPUT_TYPE[resource.role] || identityType;
    }
    return null;
  }

  function identityScope(resource) {
    if (!resource) return null;
    if (resource.fileId && resource.filePrimary !== true) return "exact_file";
    if (resource.canonicalAir || resource.modelVersionId) return "model_version";
    return null;
  }

  function parserResourceDecision(resource) {
    const scope = identityScope(resource);
    if (!resource || resource.removed) {
      return { item: null, identityScope: scope, parserFacing: false, reason: "inactive_resource" };
    }
    const modelVersionId = positiveIdOrNull(resource.modelVersionId);
    if (!modelVersionId) {
      return { item: null, identityScope: scope, parserFacing: false, reason: "model_version_id_missing" };
    }
    if (resource.verification !== "verified") {
      return {
        item: null,
        identityScope: scope,
        parserFacing: false,
        reason: resource.verification === "conflict" ? "identity_conflict" : "identity_incomplete"
      };
    }
    const resourceType = outputResourceType(resource);
    if (!resourceType) {
      return { item: null, identityScope: scope, parserFacing: false, reason: "resource_type_mismatch" };
    }
    const item = {
      type: resourceType,
      modelVersionId
    };
    const modelId = positiveIdOrNull(resource.modelId);
    if (modelId) item.modelId = modelId;
    if (resource.canonicalAir?.toLowerCase().startsWith("urn:air:")) {
      item.air = resource.canonicalAir;
      item.urn = resource.canonicalAir;
    }
    if (resource.fileId) item.fileId = resource.fileId;
    if (resource.format) item.format = resource.format;
    if (resource.name) item.modelName = resource.name;
    if (resource.filename) item.filename = Studio.util.basename(resource.filename);
    if (resource.versionName) item.modelVersionName = resource.versionName;
    if (resource.role) item.role = resource.role;
    if (resource.sourceUrl) item.sourceUrl = resource.sourceUrl;
    if (resource.hashes && Object.keys(resource.hashes).length) {
      item.hashes = { ...resource.hashes };
      const selected = Studio.util.selectHash(resource.hashes, Studio.constants.A1111_HASH_PRIORITY);
      if (selected.value) item.hash = selected.value;
    }
    if (Number.isFinite(resource.weight)) item.weight = Number(resource.weight);
    return { item, identityScope: scope, parserFacing: true, reason: null };
  }

  function parserResourceItems(resources) {
    const output = [];
    const seen = new Set();
    for (const resource of resources || []) {
      const decision = parserResourceDecision(resource);
      if (!decision.item) continue;
      const key = `${decision.item.type}:${decision.item.modelVersionId}:${decision.item.fileId || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(decision.item);
    }
    return output;
  }

  Studio.civitaiContract = Object.freeze({
    MODEL_FILE_TYPES,
    MODEL_TYPES,
    identityMatchesRole,
    identityResourceType,
    identityScope,
    modelFileTypeMatchesRole,
    modelTypeToResourceType,
    normalizeModelFileFormat,
    normalizeModelFileType,
    outputResourceType,
    parserResourceDecision,
    parserResourceItems,
    resourceTypeMatchesRole
  });
})();
