import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    users: { type: "string", default: "lonecatone23,Liant" },
    candidates: { type: "string", default: "20" },
    top: { type: "string", default: "8" }
  }
});

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
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const users = values.users.split(",").map((value) => value.trim()).filter(Boolean);
const candidateLimit = Math.max(1, Math.min(100, Number.parseInt(values.candidates, 10) || 20));
const topLimit = Math.max(1, Math.min(candidateLimit, Number.parseInt(values.top, 10) || 8));
const requestHeaders = {
  Accept: "application/json,image/avif,image/webp,image/png,image/jpeg",
  "User-Agent": `Civitai-Metadata-Studio-Workflow-Discovery/${Studio.constants.APP_VERSION}`
};

async function fetchUserImages(username) {
  const url = new URL("https://civitai.com/api/v1/images");
  url.searchParams.set("username", username);
  url.searchParams.set("limit", "100");
  url.searchParams.set("sort", "Newest");
  const response = await fetch(url, {
    headers: requestHeaders,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`image listing returned HTTP ${response.status}`);
  const payload = await response.json();
  const seenPosts = new Set();
  const uniquePosts = (payload.items || []).filter((item) => {
    if (item.type !== "image" || !item.url) return false;
    const postKey = item.postId == null ? `image:${item.id}` : `post:${item.postId}`;
    if (seenPosts.has(postKey)) return false;
    seenPosts.add(postKey);
    return true;
  });
  if (uniquePosts.length <= candidateLimit) {
    return { availableUniquePosts: uniquePosts.length, items: uniquePosts };
  }
  const sampled = Array.from({ length: candidateLimit }, (_, index) => {
    const position = candidateLimit === 1
      ? 0
      : Math.round(index * (uniquePosts.length - 1) / (candidateLimit - 1));
    return uniquePosts[position];
  });
  return { availableUniquePosts: uniquePosts.length, items: sampled };
}

function classCount(prompt, matcher) {
  return Object.values(prompt || {}).filter((node) => matcher(String(node?.class_type || "").toLowerCase())).length;
}

async function inspectCandidate(username, item) {
  const response = await fetch(item.url, {
    headers: requestHeaders,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`download returned HTTP ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    await response.body?.cancel();
    throw new Error("image exceeded the discovery size limit");
  }
  const blob = await response.blob();
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("image exceeded the discovery size limit");
  const file = new File([blob], `civitai-${item.id}.image`, { type: blob.type });
  const inspection = await Studio.canonical.inspectFile(file);
  const prompt = inspection.promptJson;
  const nodeCount = Object.keys(prompt || {}).length;
  if (!nodeCount) throw new Error("no embedded API-format ComfyUI graph");
  const scan = Studio.comfy.scan(prompt);
  const record = await Studio.canonical.createRecord(file, inspection);
  const switchNodes = classCount(prompt, (type) =>
    type.includes("switch") || type.includes("selector") || type.includes("conditional")
  );
  const score = nodeCount
    + (scan.activeNodeCount || 0)
    + switchNodes * 4
    + record.resources.length * 3;
  return {
    username,
    id: item.id,
    page: `https://civitai.com/images/${item.id}`,
    url: item.url,
    bytes: blob.size,
    width: inspection.width,
    height: inspection.height,
    format: inspection.format,
    nodes: nodeCount,
    activeNodes: scan.activeNodeCount || 0,
    inactiveNodes: Math.max(0, nodeCount - (scan.activeNodeCount || 0)),
    switchNodes,
    resources: record.resources.map((resource) => ({
      name: resource.name,
      role: resource.role
    })),
    warnings: scan.warnings,
    score
  };
}

async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

const report = {
  source: "Civitai public image API and original-image CDN",
  users: [],
  failures: []
};

for (const username of users) {
  try {
    const listing = await fetchUserImages(username);
    const outcomes = await mapWithConcurrency(listing.items, 3, async (item) => {
      try {
        return { workflow: await inspectCandidate(username, item) };
      } catch (error) {
        if (
          error.message === "no embedded API-format ComfyUI graph"
          || error.message === "image exceeded the discovery size limit"
        ) {
          return { skipped: error.message };
        }
        report.failures.push(`${username} image ${item.id}: ${error.message}`);
        return { failed: true };
      }
    });
    const discovered = outcomes.map((outcome) => outcome.workflow).filter(Boolean);
    const workflows = discovered
      .sort((left, right) => right.score - left.score || right.nodes - left.nodes)
      .slice(0, topLimit);
    const skipped = {};
    for (const outcome of outcomes) {
      if (outcome.skipped) skipped[outcome.skipped] = (skipped[outcome.skipped] || 0) + 1;
    }
    report.users.push({
      username,
      availableUniquePosts: listing.availableUniquePosts,
      sampledUniquePosts: listing.items.length,
      embeddedWorkflows: discovered.length,
      skipped,
      topWorkflows: workflows
    });
  } catch (error) {
    report.failures.push(`${username}: ${error.message}`);
  }
}

console.log(JSON.stringify(report, null, 2));
