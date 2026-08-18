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
  "../src/core/exif.js",
  "../src/formats/png.js",
  "../src/formats/jpeg.js",
  "../src/formats/webp.js",
  "../src/core/comfy.js",
  "../src/core/canonical.js"
]) {
  await import(module);
}

const Studio = globalThis.CMStudio;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const cases = [
  {
    id: 136215466,
    expectedNodes: 18,
    expectedActiveNodes: 15,
    expectedResources: 4,
    url: "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/af673398-2f5d-41fe-b04e-833ef65c859a/original=true/af673398-2f5d-41fe-b04e-833ef65c859a.jpeg"
  },
  {
    id: 136710538,
    expectedNodes: 21,
    expectedActiveNodes: 18,
    expectedResources: 5,
    url: "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/69542f60-b203-44f9-874d-29b698af7a6c/original=true/69542f60-b203-44f9-874d-29b698af7a6c.jpeg"
  },
  {
    id: 137069721,
    expectedNodes: 14,
    expectedActiveNodes: 11,
    expectedResources: 3,
    url: "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/8ec356cf-dcc1-4a45-b93e-82f6ae4957f3/original=true/8ec356cf-dcc1-4a45-b93e-82f6ae4957f3.jpeg"
  },
  {
    id: 137197908,
    creator: "lonecatone23",
    expectedNodes: 119,
    expectedActiveNodes: 23,
    expectedResources: 3,
    expectedAmbiguousSwitchWarnings: 0,
    url: "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/af9d35e5-cd85-4e90-a235-93ac222a8eea/original=true/af9d35e5-cd85-4e90-a235-93ac222a8eea.jpeg"
  },
  {
    id: 137199767,
    creator: "lonecatone23",
    expectedNodes: 21,
    expectedActiveNodes: 18,
    expectedResources: 0,
    expectedAmbiguousSwitchWarnings: 1,
    url: "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/464a9e8c-fc3e-495a-b29e-a9b73d9af9eb/original=true/464a9e8c-fc3e-495a-b29e-a9b73d9af9eb.jpeg"
  }
];

const report = {
  source: "Public Civitai original-image CDN",
  images: [],
  failures: []
};

function resourceFiles(value, found = new Set()) {
  if (typeof value === "string" && /\.(?:safetensors|gguf|ckpt|pt|pth|bin|onnx)$/iu.test(value.trim())) {
    found.add(Studio.util.basename(value).toLowerCase());
  } else if (Array.isArray(value)) {
    for (const item of value) resourceFiles(item, found);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) resourceFiles(item, found);
  }
  return found;
}

function inactiveNestedFiles(prompt) {
  const found = new Set();
  for (const node of Object.values(prompt || {})) {
    for (const value of Object.values(node?.inputs || {})) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const controls = ["on", "enabled", "enable", "active", "use"]
        .filter((key) => key in value)
        .map((key) => value[key]);
      if (controls.some((control) =>
        control === false
        || control === 0
        || ["false", "off", "disabled", "no"].includes(String(control).trim().toLowerCase())
      )) {
        resourceFiles(value, found);
      }
    }
  }
  return found;
}

function projection(resources) {
  return resources.map((resource) => ({
    name: resource.name,
    role: resource.role,
    weight: resource.weight,
    modelVersionId: resource.modelVersionId || null,
    hashes: resource.hashes
  }));
}

for (const fixture of cases) {
  try {
    const response = await fetch(fixture.url, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`download returned HTTP ${response.status}`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) throw new Error("image exceeded the regression size limit");
    const blob = await response.blob();
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("image exceeded the regression size limit");

    const file = new File([blob], `civitai-${fixture.id}.image`, { type: blob.type });
    const inspection = await Studio.canonical.inspectFile(file);
    const nodeCount = Object.keys(inspection.promptJson || {}).length;
    const scan = Studio.comfy.scan(inspection.promptJson);
    const record = await Studio.canonical.createRecord(file, inspection);
    const activeNames = new Set(
      scan.resources.map((resource) => Studio.util.basename(resource.filename || resource.name).toLowerCase())
    );
    const canonicalNames = new Set(
      record.resources.map((resource) => Studio.util.basename(resource.filename || resource.name).toLowerCase())
    );

    if (nodeCount !== fixture.expectedNodes) throw new Error(`expected ${fixture.expectedNodes} nodes, found ${nodeCount}`);
    if (scan.activeNodeCount !== fixture.expectedActiveNodes) {
      throw new Error(`expected ${fixture.expectedActiveNodes} active nodes, found ${scan.activeNodeCount}`);
    }
    if (record.resources.length !== fixture.expectedResources) {
      throw new Error(`expected ${fixture.expectedResources} canonical resources, found ${record.resources.length}`);
    }
    if (fixture.expectedAmbiguousSwitchWarnings !== undefined) {
      const ambiguousSwitchWarnings = scan.warnings
        .filter((warning) => /switch or selector/iu.test(warning))
        .length;
      if (ambiguousSwitchWarnings !== fixture.expectedAmbiguousSwitchWarnings) {
        throw new Error(
          `expected ${fixture.expectedAmbiguousSwitchWarnings} ambiguous-switch warnings, found ${ambiguousSwitchWarnings}`
        );
      }
    }
    for (const name of activeNames) {
      if (!canonicalNames.has(name)) throw new Error(`active resource ${name} was omitted`);
    }
    for (const name of inactiveNestedFiles(inspection.promptJson)) {
      if (!activeNames.has(name) && canonicalNames.has(name)) {
        throw new Error(`disabled nested resource ${name} was imported`);
      }
    }
    if ([...canonicalNames].some((name) => name.toLowerCase().includes("powerloraloaderheaderwidget"))) {
      throw new Error("a Power LoRA control widget was misclassified as a model");
    }
    const negative = String(record.fields.negativePrompt?.value || "");
    const positive = String(record.fields.positivePrompt?.value || "");
    if (negative && positive && negative === positive) {
      throw new Error("the positive prompt was duplicated into the negative prompt");
    }
    if (/(?:^|,\s*)(?:Steps|Sampler|Schedule type|CFG scale|Seed|Size|Hashes|Civitai resources):/iu.test(negative)) {
      throw new Error("generation settings leaked into the negative prompt");
    }

    const rewritten = Studio.canonical.rewrite(record);
    const reopenedFile = new File([rewritten], `civitai-${fixture.id}-edited.${inspection.format}`);
    const reopenedInspection = await Studio.canonical.inspectFile(reopenedFile);
    const reopenedRecord = await Studio.canonical.createRecord(reopenedFile, reopenedInspection);
    if (Studio.util.stableStringify(projection(reopenedRecord.resources)) !== Studio.util.stableStringify(projection(record.resources))) {
      throw new Error("resource metadata changed after lossless rewrite and reopen");
    }
    if (reopenedInspection.width !== inspection.width || reopenedInspection.height !== inspection.height) {
      throw new Error("dimensions changed after rewrite");
    }

    report.images.push({
      id: fixture.id,
      creator: fixture.creator || null,
      page: `https://civitai.com/images/${fixture.id}`,
      bytes: blob.size,
      format: inspection.format,
      nodes: nodeCount,
      activeNodes: scan.activeNodeCount,
      resources: projection(record.resources)
    });
  } catch (error) {
    report.failures.push(`Civitai image ${fixture.id}: ${error.message}`);
  }
}

console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
