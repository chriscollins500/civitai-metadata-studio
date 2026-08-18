(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const {
    a1111Hash,
    integerOrNull,
    numberOrNull,
    safeJsonParse,
    sanitizeText,
    stableStringify
  } = Studio.util;

  const FIELD_MAP = Object.freeze({
    steps: ["steps", integerOrNull],
    sampler: ["sampler", String],
    "schedule type": ["scheduler", String],
    scheduler: ["scheduler", String],
    "cfg scale": ["cfgScale", numberOrNull],
    guidance: ["guidance", numberOrNull],
    seed: ["seed", String],
    size: ["size", String],
    model: ["modelName", String],
    "model hash": ["modelHash", String],
    vae: ["vaeName", String],
    "vae hash": ["vaeHash", String],
    "clip skip": ["clipSkip", integerOrNull],
    "denoising strength": ["denoise", numberOrNull]
  });

  const STRONG_SETTINGS_LABELS = new Set([
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

  function splitSettings(value) {
    const text = String(value || "");
    const parts = [];
    let start = 0;
    let quote = "";
    let escaped = false;
    let depth = 0;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (quote) {
        if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if ("[{(".includes(character)) depth += 1;
      else if ("]})".includes(character)) depth = Math.max(0, depth - 1);
      else if (character === "," && depth === 0) {
        parts.push(text.slice(start, index).trim());
        start = index + 1;
      }
    }
    parts.push(text.slice(start).trim());
    return parts.filter(Boolean);
  }

  function parseSettings(value) {
    const fields = {};
    const raw = {};
    for (const part of splitSettings(value)) {
      const separator = part.indexOf(":");
      if (separator <= 0) continue;
      const label = part.slice(0, separator).trim();
      const content = part.slice(separator + 1).trim();
      raw[label] = content;
      const mapping = FIELD_MAP[label.toLowerCase()];
      if (mapping) {
        const [key, parser] = mapping;
        const parsed = parser(content);
        if (parsed !== null && parsed !== "") fields[key] = parsed;
      }
    }
    if (typeof fields.size === "string") {
      const match = fields.size.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
      if (match) {
        fields.width = integerOrNull(match[1]);
        fields.height = integerOrNull(match[2]);
      }
      delete fields.size;
    }
    return { fields, raw };
  }

  function findSettingsStart(lines) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const recognized = splitSettings(lines[index]).flatMap((part) => {
        const separator = part.indexOf(":");
        if (separator <= 0) return [];
        const label = part.slice(0, separator).trim().toLowerCase();
        return FIELD_MAP[label] ? [label] : [];
      });
      if (recognized.length >= 2) return index;
      if (recognized.length === 1 && STRONG_SETTINGS_LABELS.has(recognized[0])) return index;
    }
    return -1;
  }

  function parse(value) {
    const text = sanitizeText(value);
    const lines = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
    const settingsStart = findSettingsStart(lines);
    const promptLines = settingsStart >= 0 ? lines.slice(0, settingsStart) : lines;
    const settingsText = settingsStart >= 0 ? lines.slice(settingsStart).join("\n") : "";
    const negativeIndex = promptLines.findIndex((line) => /^Negative prompt\s*:/i.test(line));
    const positivePrompt = (negativeIndex >= 0 ? promptLines.slice(0, negativeIndex) : promptLines).join("\n").trim();
    const negativePrompt = negativeIndex >= 0
      ? [
          promptLines[negativeIndex].replace(/^Negative prompt\s*:\s*/i, ""),
          ...promptLines.slice(negativeIndex + 1)
        ].join("\n").trim()
      : "";
    const settings = parseSettings(settingsText);
    const resources = [];
    const resourceJson = settings.raw["Civitai resources"] || settings.raw["Civitai Resources"];
    const parsedResources = safeJsonParse(resourceJson, []);
    if (Array.isArray(parsedResources)) {
      for (const item of parsedResources) {
        if (item && typeof item === "object") resources.push({ ...item, identitySource: "a1111" });
      }
    }
    const hashes = safeJsonParse(settings.raw.Hashes, {});
    for (const match of positivePrompt.matchAll(/<lora:([^:>]+)(?::(-?\d+(?:\.\d+)?))?>/gi)) {
      if (!resources.some((item) => String(item.name || item.modelName || "").toLowerCase() === match[1].toLowerCase())) {
        resources.push({
          name: match[1],
          role: "lora",
          type: "LORA",
          weight: numberOrNull(match[2]),
          identitySource: "prompt_name",
          verification: "candidate"
        });
      }
    }
    return {
      fields: { positivePrompt, negativePrompt, ...settings.fields },
      resources,
      hashes: hashes && typeof hashes === "object" ? hashes : {},
      rawSettings: settings.raw,
      raw: text
    };
  }

  function numberText(value) {
    if (value === null || value === undefined || value === "") return "";
    const number = Number(value);
    return Number.isFinite(number) ? String(Number(number.toPrecision(12))) : sanitizeText(value);
  }

  function resourceProjection(resource) {
    const modelId = Number(resource.modelId || resource.civitaiModelId) || null;
    const modelVersionId = Number(resource.modelVersionId || resource.civitaiModelVersionId) || null;
    const fileId = Number(resource.fileId) || null;
    const item = {};
    const air = resource.canonicalAir || resource.air;
    if (air) item.air = sanitizeText(air);
    if (modelId) item.modelId = modelId;
    if (resource.name) item.modelName = sanitizeText(resource.name);
    if (modelVersionId) item.modelVersionId = modelVersionId;
    if (fileId) item.fileId = fileId;
    if (resource.filename) item.filename = Studio.util.basename(resource.filename);
    if (resource.versionName) item.modelVersionName = sanitizeText(resource.versionName);
    if (resource.role) item.role = sanitizeText(resource.role);
    if (resource.type) item.type = sanitizeText(resource.type);
    if (resource.sourceUrl) item.sourceUrl = sanitizeText(resource.sourceUrl, 2048);
    if (air) item.urn = sanitizeText(air);
    if (resource.hashes && typeof resource.hashes === "object") {
      const hash = a1111Hash(resource.hashes);
      if (hash) item.hash = sanitizeText(hash);
      if (Object.keys(resource.hashes).length) item.hashes = resource.hashes;
    }
    if (resource.weight !== null && resource.weight !== undefined) item.weight = Number(resource.weight);
    return item;
  }

  function build(record) {
    const fields = record.fields || {};
    const positive = sanitizeText(fields.positivePrompt?.value ?? fields.positivePrompt ?? "");
    const negative = sanitizeText(fields.negativePrompt?.value ?? fields.negativePrompt ?? "");
    const valueOf = (key) => fields[key]?.value ?? fields[key];
    const activeResources = (record.resources || []).filter((resource) => resource.removed !== true);
    const primaryResource = activeResources.find((resource) =>
      ["checkpoint", "unet", "refiner"].includes(resource.role)
    );
    const vaeResource = activeResources.find((resource) => resource.role === "vae");
    const primaryHash = sanitizeText(a1111Hash(primaryResource?.hashes) || valueOf("modelHash") || "");
    const vaeHash = sanitizeText(a1111Hash(vaeResource?.hashes) || valueOf("vaeHash") || "");
    const settings = [];
    const add = (label, value) => {
      if (value !== null && value !== undefined && value !== "") settings.push([label, sanitizeText(value)]);
    };
    add("Steps", valueOf("steps"));
    add("Sampler", valueOf("sampler"));
    add("Schedule type", valueOf("scheduler"));
    add("CFG scale", numberText(valueOf("cfgScale")));
    if (!valueOf("cfgScale")) add("Guidance", numberText(valueOf("guidance")));
    add("Seed", valueOf("seed"));
    if (valueOf("width") && valueOf("height")) add("Size", `${valueOf("width")}x${valueOf("height")}`);
    add("Model", valueOf("modelName"));
    add("Model hash", primaryHash);
    add("VAE", valueOf("vaeName"));
    add("VAE hash", vaeHash);
    add("Clip skip", valueOf("clipSkip"));
    add("Denoising strength", numberText(valueOf("denoise")));

    const hashes = {};
    if (primaryHash) {
      hashes.Model = primaryHash;
      hashes.model = primaryHash;
    }
    if (vaeHash) hashes.VAE = vaeHash;
    if (Object.keys(hashes).length) add("Hashes", stableStringify(hashes, 0));

    const legacyLoraHashes = activeResources.flatMap((resource) => {
      if (resource.role !== "lora") return [];
      const hash = a1111Hash(resource.hashes);
      return hash ? [`${resource.name}: ${hash}`] : [];
    });
    if (legacyLoraHashes.length) add("Lora hashes", JSON.stringify(legacyLoraHashes.join(", ")));

    const resources = Studio.civitaiContract.parserResourceItems(activeResources);
    if (resources.length) add("Civitai resources", stableStringify(resources, 0));
    add("Civitai metadata", stableStringify({
      outputFormat: record.format || "unknown",
      generator: {
        name: Studio.constants.APP_NAME,
        version: Studio.constants.APP_VERSION
      },
      resources
    }, 0));

    const lines = [positive];
    if (negative || settings.length) lines.push(`Negative prompt: ${negative}`);
    if (settings.length) lines.push(settings.map(([key, value]) => `${key}: ${value}`).join(", "));
    return lines.join("\n");
  }

  Studio.a1111 = Object.freeze({ build, parse, resourceProjection, splitSettings });
})();
