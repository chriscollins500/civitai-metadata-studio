(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { integerOrNull, isPresent, numberOrNull, sanitizeText } = Studio.util;

  const RESOURCE_INPUTS = Object.freeze({
    ckpt_name: ["checkpoint", "Checkpoint"],
    checkpoint_name: ["checkpoint", "Checkpoint"],
    unet_name: ["unet", "Checkpoint"],
    diffusion_model: ["unet", "Checkpoint"],
    diffusion_model_name: ["unet", "Checkpoint"],
    lora_name: ["lora", "LORA"],
    vae_name: ["vae", "VAE"],
    clip_name: ["clip", "Other"],
    clip_name1: ["clip", "Other"],
    clip_name2: ["clip", "Other"],
    clip_name3: ["clip", "Other"],
    text_encoder_name: ["clip", "Other"],
    control_net_name: ["controlnet", "Controlnet"],
    controlnet_name: ["controlnet", "Controlnet"],
    ipadapter_file: ["ipadapter", "Other"],
    ipadapter_name: ["ipadapter", "Other"],
    upscale_model: ["upscaler", "Upscaler"]
  });
  const SWITCH_SELECTOR_FIELDS = Object.freeze(["select", "Input", "input", "index", "idx"]);
  const BOOLEAN_SWITCH_FIELDS = Object.freeze(["switch", "cond", "condition"]);
  const SWITCH_CONTROL_FIELDS = new Set([...SWITCH_SELECTOR_FIELDS, ...BOOLEAN_SWITCH_FIELDS, "sel_mode"]);
  const SWITCH_PREFIXES = Object.freeze([
    "input", "model", "clip", "vae", "VAE", "image", "images", "latent",
    "conditioning", "text", "control_net", "controlnet", "mask", "any_", "ctx_", "on"
  ]);
  const BOOLEAN_SWITCH_INPUTS = Object.freeze({
    true: ["on_true", "true", "tt_value", "value_true", "input_true"],
    false: ["on_false", "false", "ff_value", "value_false", "input_false"]
  });

  function graphNodes(prompt) {
    if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) return null;
    const entries = Object.entries(prompt).filter(([, node]) =>
      node && typeof node === "object" && typeof node.class_type === "string"
    );
    return entries.length ? new Map(entries.map(([id, node]) => [String(id), node])) : null;
  }

  function references(value, found = []) {
    if (Array.isArray(value) && value.length >= 2 && (typeof value[0] === "string" || typeof value[0] === "number") && Number.isInteger(Number(value[1]))) {
      found.push(String(value[0]));
      return found;
    }
    if (Array.isArray(value)) {
      for (const item of value) references(item, found);
    } else if (value && typeof value === "object") {
      for (const item of Object.values(value)) references(item, found);
    }
    return found;
  }

  function booleanOrNull(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number" && [0, 1].includes(value)) return Boolean(value);
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["true", "1", "yes", "on", "enabled"].includes(normalized)) return true;
    if (["false", "0", "no", "off", "disabled"].includes(normalized)) return false;
    return null;
  }

  function isLink(value) {
    return Array.isArray(value)
      && value.length >= 2
      && (typeof value[0] === "string" || typeof value[0] === "number")
      && Number.isInteger(Number(value[1]));
  }

  function isInactiveNode(node) {
    if (!node || typeof node !== "object") return true;
    if (node.active === false || node.enabled === false || node.disabled === true) return true;
    if ([2, 4].includes(Number(node.mode))) return true;
    const status = String(node.status || node.state || "").trim().toLowerCase();
    return ["inactive", "disabled", "bypassed", "muted", "never"].includes(status);
  }

  function isSwitchLike(node) {
    const compact = String(node?.class_type || "").toLowerCase().replace(/[^a-z0-9]+/gu, "");
    if (compact.includes("switch") || compact.includes("conditionalbranch")) return true;
    return (compact.includes("selector") || compact.includes("chooser"))
      && [...SWITCH_CONTROL_FIELDS].some((field) => field in (node.inputs || {}));
  }

  function normalizedSwitchLabel(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
  }

  function literalSwitchControl(nodes, value) {
    if (!isLink(value)) return { resolved: true, value };
    const node = nodes.get(String(value[0]));
    if (!node || isInactiveNode(node)) return { resolved: false, value: null };
    const compact = String(node.class_type || "").toLowerCase().replace(/[^a-z0-9]+/gu, "");
    if (!compact.includes("primitive") && !compact.includes("constant")) {
      return { resolved: false, value: null };
    }
    const literal = scalarInput(
      node,
      "value",
      "boolean",
      "bool",
      "select",
      "index",
      "string",
      "text",
      "number",
      "integer",
      "int",
      "float"
    );
    return isPresent(literal)
      ? { resolved: true, value: literal }
      : { resolved: false, value: null };
  }

  function switchSelection(nodes, node) {
    const inputs = node.inputs || {};
    for (const field of BOOLEAN_SWITCH_FIELDS) {
      if (!(field in inputs)) continue;
      const control = literalSwitchControl(nodes, inputs[field]);
      if (!control.resolved) return null;
      const value = booleanOrNull(control.value);
      if (value !== null) {
        const names = BOOLEAN_SWITCH_INPUTS[String(value)].filter((name) => name in inputs && references(inputs[name], []).length);
        return names.length ? names : null;
      }
    }
    for (const field of SWITCH_SELECTOR_FIELDS) {
      if (!(field in inputs)) continue;
      const control = literalSwitchControl(nodes, inputs[field]);
      if (!control.resolved) continue;
      const raw = control.value;
      if (Number.isInteger(Number(raw)) && String(raw).trim() !== "") {
        const index = Number(raw);
        const names = SWITCH_PREFIXES.flatMap((prefix) => [
          `${prefix}${index}`,
          `${prefix}_${index}`,
          `${prefix}${index}_opt`,
          `${prefix}_${index}_opt`
        ]).filter((name) => name in inputs && references(inputs[name], []).length);
        return names.length ? [...new Set(names)] : null;
      }
      const label = normalizedSwitchLabel(raw);
      if (label) {
        const names = Object.keys(inputs).filter((name) =>
          !SWITCH_CONTROL_FIELDS.has(name)
          && normalizedSwitchLabel(name) === label
          && references(inputs[name], []).length
        );
        return names.length ? names : null;
      }
    }
    return null;
  }

  function traversalValues(nodes, node) {
    const inputs = node.inputs || {};
    if (!isSwitchLike(node)) return { values: Object.values(inputs), ambiguous: false };
    const selected = switchSelection(nodes, node);
    return selected
      ? { values: selected.map((name) => inputs[name]), ambiguous: false }
      : { values: Object.values(inputs), ambiguous: true };
  }

  function activeNodeIds(nodes) {
    const outputs = [...nodes].filter(([, node]) => {
      if (isInactiveNode(node)) return false;
      const type = node.class_type.toLowerCase().replace(/[^a-z0-9]+/gu, " ");
      const compact = type.replaceAll(" ", "");
      return node._meta?.output_node === true
        || compact.includes("saveimage")
        || compact.includes("previewimage")
        || compact.includes("savevideo")
        || compact.includes("previewvideo")
        || compact.includes("saveanimation")
        || compact.includes("saveanimated");
    }).map(([id]) => id);
    if (!outputs.length) {
      return {
        ids: new Set(),
        uncertainIds: new Set(),
        ambiguous: true,
        ambiguousSwitches: []
      };
    }
    const ids = new Set();
    const uncertainIds = new Set();
    const ambiguousSwitches = [];
    const visitedStates = new Map();
    const visit = (id, uncertainPath = false) => {
      if (!nodes.has(id)) return;
      const state = uncertainPath ? 1 : 2;
      const visited = visitedStates.get(id) || 0;
      if (visited & state) return;
      visitedStates.set(id, visited | state);
      const node = nodes.get(id);
      if (isInactiveNode(node)) return;
      if (uncertainPath && !ids.has(id)) uncertainIds.add(id);
      else if (!uncertainPath) {
        ids.add(id);
        uncertainIds.delete(id);
      }
      const traversal = traversalValues(nodes, node);
      if (traversal.ambiguous) ambiguousSwitches.push(`${id}:${node.class_type}`);
      for (const value of traversal.values) {
        for (const reference of references(value)) {
          visit(reference, uncertainPath || traversal.ambiguous);
        }
      }
    };
    outputs.forEach((id) => visit(id, false));
    return {
      ids,
      uncertainIds,
      ambiguous: false,
      ambiguousSwitches: [...new Set(ambiguousSwitches)]
    };
  }

  function scalarInput(node, ...keys) {
    for (const key of keys) {
      const value = node?.inputs?.[key];
      if (!Array.isArray(value) && isPresent(value) && ["string", "number", "boolean"].includes(typeof value)) return value;
    }
    return null;
  }

  function producesEmptyConditioning(node) {
    const compact = String(node?.class_type || "").toLowerCase().replace(/[^a-z0-9]+/gu, "");
    return compact.includes("conditioningzeroout")
      || compact.includes("zeroconditioning")
      || compact.includes("emptyconditioning")
      || compact.includes("conditioningempty");
  }

  function resolveText(nodes, reference, active, visited = new Set()) {
    if (!Array.isArray(reference) || reference.length < 1) return typeof reference === "string" ? reference : "";
    const id = String(reference[0]);
    if (!active.has(id) || visited.has(id)) return "";
    visited.add(id);
    const node = nodes.get(id);
    if (!node) return "";
    if (producesEmptyConditioning(node)) return "";
    const direct = scalarInput(node, "text", "prompt", "string", "value");
    if (typeof direct === "string") return direct;
    for (const value of Object.values(node.inputs || {})) {
      if (Array.isArray(value)) {
        const resolved = resolveText(nodes, value, active, visited);
        if (resolved) return resolved;
      }
    }
    return "";
  }

  function inferRoleFromNode(node, key, mappedRole) {
    if (key !== "model_name") return mappedRole;
    const type = node.class_type.toLowerCase();
    return type.includes("upscale") ? "upscaler" : "checkpoint";
  }

  function mappingForInput(node, key) {
    if (RESOURCE_INPUTS[key]) return RESOURCE_INPUTS[key];
    const normalized = key.toLowerCase();
    const type = node.class_type.toLowerCase();
    if (normalized === "model_name") {
      if (type.includes("upscale")) return ["upscaler", "Upscaler"];
      if (type.includes("lora")) return ["lora", "LORA"];
      if (type.includes("checkpoint")) return ["checkpoint", "Checkpoint"];
      if (type.includes("unet") || type.includes("diffusion") || type.includes("gguf")) return ["unet", "Checkpoint"];
      return null;
    }
    if (normalized.includes("lora")) return ["lora", "LORA"];
    if (normalized.includes("control") && normalized.includes("name")) return ["controlnet", "Controlnet"];
    if (normalized.includes("ipadapter")) return ["ipadapter", "Other"];
    if (normalized.includes("upscale") && (normalized.includes("model") || type.includes("loader"))) return ["upscaler", "Upscaler"];
    return null;
  }

  function slotIsEnabled(node, key) {
    const match = String(key).match(/_?(\d+)$/u);
    if (!match) return true;
    const suffix = match[1];
    const inputs = node.inputs || {};
    for (const control of [`switch_${suffix}`, `switch${suffix}`, `enabled_${suffix}`, `enable_${suffix}`, `active_${suffix}`, `use_${suffix}`]) {
      if (!(control in inputs)) continue;
      const enabled = booleanOrNull(inputs[control]);
      if (enabled === false) return false;
    }
    return true;
  }

  function usableResourceValue(node, key, value) {
    if (!slotIsEnabled(node, key)) return false;
    const normalized = String(value || "").trim().toLowerCase();
    return !["", "none", ".none", "disabled", "disable", "null", "undefined"].includes(normalized);
  }

  function nestedResourceEnabled(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    for (const key of ["on", "enabled", "enable", "active", "use"]) {
      if (!(key in value)) continue;
      if (booleanOrNull(value[key]) === false) return false;
    }
    return true;
  }

  function resourceFromInput(node, key, value, mapping = mappingForInput(node, key), nestedInputs = null) {
    const [mappedRole, mappedType] = mapping;
    const role = inferRoleFromNode(node, key, mappedRole);
    const type = role === "checkpoint" ? "Checkpoint" : mappedType;
    const weight = role === "lora"
      ? numberOrNull(
        nestedInputs?.strength_model
        ?? nestedInputs?.model_strength
        ?? nestedInputs?.strength
        ?? nestedInputs?.weight
        ?? scalarInput(node, "strength_model", "strength", "weight")
      )
      : null;
    return {
      name: Studio.util.basename(value),
      filename: Studio.util.basename(value),
      role,
      type,
      weight,
      identitySource: "comfy_active",
      verification: "unresolved",
      evidence: `${node.class_type}.${key}`
    };
  }

  function addPromptEmbeddings(resources, text) {
    for (const match of String(text || "").matchAll(/\bembedding:([^\s,;]+)/gi)) {
      resources.push({
        name: sanitizeText(match[1], 512),
        role: "embedding",
        type: "TextualInversion",
        identitySource: "comfy_active",
        verification: "unresolved",
        evidence: "Prompt embedding token"
      });
    }
  }

  function scan(prompt) {
    const nodes = graphNodes(prompt);
    if (!nodes) return { fields: {}, resources: [], warnings: ["No API-format ComfyUI prompt graph was found."] };
    const active = activeNodeIds(nodes);
    const fields = {};
    const resources = [];
    const warnings = [];
    if (active.ambiguous) {
      warnings.push("No output node was identifiable, so workflow resources were not inferred from potentially unused nodes.");
    }
    if (active.ambiguousSwitches.length) {
      warnings.push(`${active.ambiguousSwitches.length} active switch or selector could not be resolved, so branch-only metadata from ${active.uncertainIds.size} uncertain node${active.uncertainIds.size === 1 ? "" : "s"} was excluded.`);
    }

    for (const id of active.ids) {
      const node = nodes.get(id);
      if (!node) continue;
      const type = node.class_type.toLowerCase();
      const generationNode = type.includes("sampler")
        || type.includes("scheduler")
        || type.includes("guider")
        || type.includes("randomnoise")
        || type.includes("random noise");
      if (generationNode) {
        const values = {
          steps: integerOrNull(scalarInput(node, "steps")),
          seed: scalarInput(node, "seed", "noise_seed"),
          sampler: scalarInput(node, "sampler_name", "sampler"),
          scheduler: scalarInput(node, "scheduler"),
          cfgScale: numberOrNull(scalarInput(node, "cfg")),
          guidance: numberOrNull(scalarInput(node, "guidance")),
          denoise: numberOrNull(scalarInput(node, "denoise"))
        };
        for (const [key, value] of Object.entries(values)) if (isPresent(value) && !isPresent(fields[key])) fields[key] = value;
        const positive = resolveText(nodes, node.inputs?.positive, active.ids);
        const negative = resolveText(nodes, node.inputs?.negative, active.ids);
        if (positive && !fields.positivePrompt) {
          fields.positivePrompt = sanitizeText(positive);
          addPromptEmbeddings(resources, positive);
        }
        if (negative && !fields.negativePrompt) {
          fields.negativePrompt = sanitizeText(negative);
          addPromptEmbeddings(resources, negative);
        }
      }
      if (type.includes("emptylatent") || type.includes("empty latent")) {
        const width = integerOrNull(scalarInput(node, "width"));
        const height = integerOrNull(scalarInput(node, "height"));
        if (width && !fields.width) fields.width = width;
        if (height && !fields.height) fields.height = height;
      }
      for (const [key, value] of Object.entries(node.inputs || {})) {
        const mapping = mappingForInput(node, key);
        if (mapping && typeof value === "string" && usableResourceValue(node, key, value)) {
          resources.push(resourceFromInput(node, key, value, mapping));
          continue;
        }
        if (value && typeof value === "object" && !Array.isArray(value)) {
          if (!nestedResourceEnabled(value)) continue;
          for (const [nestedKey, nestedValue] of Object.entries(value)) {
            const nestedMapping = mappingForInput(node, nestedKey);
            if (nestedMapping && typeof nestedValue === "string" && usableResourceValue(node, nestedKey, nestedValue)) {
              resources.push(resourceFromInput(node, nestedKey, nestedValue, nestedMapping, value));
            }
          }
        }
      }
    }
    return { fields, resources, warnings, activeNodeCount: active.ids.size, totalNodeCount: nodes.size };
  }

  Studio.comfy = Object.freeze({ activeNodeIds, graphNodes, scan });
})();
