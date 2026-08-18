import { parseArgs } from "node:util";
import { access, readFile, readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const { values } = parseArgs({
  options: {
    root: { type: "string" }
  }
});

if (!values.root) {
  throw new Error("Usage: node scripts/paired-sidecar-regression.mjs --root <image-directory>");
}

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
const root = values.root;
const names = (await readdir(root))
  .filter((name) => [".png", ".jpg", ".jpeg", ".webp"].includes(extname(name).toLowerCase()))
  .sort();

const summary = {
  images: names.length,
  pairedSidecars: 0,
  embeddedPromptMatches: 0,
  promptSemanticsMatched: 0,
  activeResources: 0,
  canonicalResources: 0,
  inactiveWorkflowNodes: 0,
  failures: []
};

function resourceFilename(resource) {
  return basename(String(resource?.filename || resource?.selectedValue || resource?.name || "").replaceAll("\\", "/"))
    .toLowerCase();
}

function scanSignature(resource) {
  return `${resource.role || "other"}:${resourceFilename(resource)}`;
}

function activeResource(resource) {
  if (!resource || typeof resource !== "object") return false;
  if (resource.active === false || resource.enabled === false || resource.disabled === true) return false;
  if ([2, 4].includes(Number(resource.mode))) return false;
  return !["inactive", "disabled", "bypassed", "muted", "never"]
    .includes(String(resource.status || resource.state || "").trim().toLowerCase());
}

function exactKeys(resource) {
  const keys = [];
  if (resource.modelVersionId) keys.push(`version:${resource.modelVersionId}`);
  for (const [algorithm, value] of Object.entries(resource.hashes || {})) {
    if (value) keys.push(`${algorithm.toLowerCase()}:${String(value).toUpperCase()}`);
  }
  return keys;
}

for (const name of names) {
  const imagePath = join(root, name);
  const sidecarPath = join(root, `${name.slice(0, -extname(name).length)}.json`);
  try {
    await access(sidecarPath);
  } catch {
    summary.failures.push(`${name}: matching JSON sidecar is missing`);
    continue;
  }

  summary.pairedSidecars += 1;
  try {
    const [imageBytes, sidecarText] = await Promise.all([
      readFile(imagePath),
      readFile(sidecarPath, "utf8")
    ]);
    const file = new File([imageBytes], name);
    const inspection = await Studio.canonical.inspectFile(file);
    const record = await Studio.canonical.createRecord(file, inspection);
    const sidecar = JSON.parse(sidecarText);
    const sidecarPrompt = sidecar?.payloads?.prompt;
    if (!sidecarPrompt || typeof sidecarPrompt !== "object") {
      summary.failures.push(`${name}: sidecar has no payloads.prompt graph`);
      continue;
    }

    if (Studio.util.stableStringify(inspection.promptJson) !== Studio.util.stableStringify(sidecarPrompt)) {
      summary.failures.push(`${name}: embedded prompt graph differs from its sidecar`);
    } else {
      summary.embeddedPromptMatches += 1;
    }

    const embeddedScan = Studio.comfy.scan(inspection.promptJson);
    const sidecarScan = Studio.comfy.scan(sidecarPrompt);
    const embeddedSignatures = embeddedScan.resources.map(scanSignature).sort();
    const sidecarSignatures = sidecarScan.resources.map(scanSignature).sort();
    if (Studio.util.stableStringify(embeddedSignatures) !== Studio.util.stableStringify(sidecarSignatures)) {
      summary.failures.push(`${name}: embedded and sidecar active-resource scans differ`);
    }

    const expectedPrompts = sidecar?.generationRecord?.prompts;
    if (expectedPrompts && typeof expectedPrompts === "object") {
      const scannedPositive = String(sidecarScan.fields.positivePrompt || "");
      const scannedNegative = String(sidecarScan.fields.negativePrompt || "");
      const selectedPositive = String(record.fields.positivePrompt?.value || "");
      const selectedNegative = String(record.fields.negativePrompt?.value || "");
      const expectedPositive = expectedPrompts.positive?.text;
      const expectedNegative = expectedPrompts.negative?.text;
      const positiveMismatch = typeof expectedPositive === "string"
        && (scannedPositive !== expectedPositive || selectedPositive !== expectedPositive);
      const negativeMismatch = typeof expectedNegative === "string"
        ? scannedNegative !== expectedNegative || selectedNegative !== expectedNegative
        : Boolean(scannedNegative && scannedNegative === scannedPositive);
      if (positiveMismatch || negativeMismatch) {
        summary.failures.push(`${name}: prompt semantics differ from the save-node generation record`);
      } else {
        summary.promptSemanticsMatched += 1;
      }
    }

    const declared = Array.isArray(sidecar?.generationRecord?.resources)
      ? sidecar.generationRecord.resources.filter(activeResource)
      : [];
    const declaredFilenames = new Set(declared.map(resourceFilename).filter(Boolean));
    for (const resource of sidecarScan.resources) {
      const filename = resourceFilename(resource);
      if (filename && !declaredFilenames.has(filename)) {
        summary.failures.push(`${name}: browser scan resource ${filename} is absent from the authoritative save-node active record`);
      }
    }

    const recordFilenames = new Set(record.resources.map(resourceFilename).filter(Boolean));
    for (const resource of sidecarScan.resources) {
      const filename = resourceFilename(resource);
      if (filename && !recordFilenames.has(filename)) {
        summary.failures.push(`${name}: active prompt resource ${filename} is missing from the canonical record`);
      }
    }

    for (const resource of declared) {
      const filename = resourceFilename(resource);
      if (filename && !recordFilenames.has(filename)) {
        summary.failures.push(`${name}: active sidecar resource ${filename} is missing from the canonical record`);
      }
    }

    const seenExact = new Map();
    for (const resource of record.resources) {
      for (const key of exactKeys(resource)) {
        if (seenExact.has(key)) {
          summary.failures.push(`${name}: duplicate canonical identity ${key}`);
        } else {
          seenExact.set(key, resource);
        }
      }
    }

    const negative = String(record.fields.negativePrompt?.value || "");
    if (/(?:^|,\s*)(?:Steps|Sampler|Schedule type|CFG scale|Seed|Size|Hashes|Civitai resources):/iu.test(negative)) {
      summary.failures.push(`${name}: generation settings leaked into the negative prompt`);
    }
    if (
      Number(record.dimensions.width) !== Number(sidecar?.artifact?.width)
      || Number(record.dimensions.height) !== Number(sidecar?.artifact?.height)
    ) {
      summary.failures.push(`${name}: image dimensions differ from the sidecar`);
    }

    summary.activeResources += sidecarScan.resources.length;
    summary.canonicalResources += record.resources.length;
    summary.inactiveWorkflowNodes += (Array.isArray(sidecar?.payloads?.workflow?.nodes)
      ? sidecar.payloads.workflow.nodes
      : []).filter((node) =>
      [2, 4].includes(Number(node?.mode))
      || node?.enabled === false
      || node?.active === false
    ).length;
  } catch (error) {
    summary.failures.push(`${name}: ${error.message}`);
  }
}

console.log(JSON.stringify(summary, null, 2));
if (summary.failures.length) process.exitCode = 1;
