import test from "node:test";
import assert from "node:assert/strict";

const values = new Map();
globalThis.CMStudio = {};
globalThis.localStorage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};

const now = Date.now();
values.set("civitai-metadata-studio.identity-cache.v3", JSON.stringify({
  "version:77": {
    cachedAt: now - 1_000,
    negative: false,
    value: {
      id: 77,
      modelId: 7,
      name: "Legacy cached version",
      files: []
    }
  }
}));

await import("../src/core/identity-cache.js");

const cache = globalThis.CMStudio.identityCache;

test("legacy localStorage entries migrate into the bounded fallback", async () => {
  const result = await cache.get("version:77");
  const stats = await cache.stats();
  const fallback = JSON.parse(values.get("civitai-metadata-studio.identity-cache.v4"));

  assert.equal(result.hit, true);
  assert.equal(result.value.id, 77);
  assert.equal(stats.backend, "localStorage");
  assert.equal(stats.versions, 1);
  assert.equal(fallback.schema, "civitai-metadata-studio.identity-cache");
  assert.ok(fallback.entries["version:77"]);
  assert.equal(values.has("civitai-metadata-studio.identity-cache.v3"), false);

  await cache.clear();
});

test("pruning evicts complete least-recently-used version groups", () => {
  const current = Date.now();
  const records = [];
  for (let id = 1; id <= 2_001; id += 1) {
    const groupId = `version:${id}`;
    const lastUsedAt = current - (2_002 - id) * 1_000;
    records.push(
      {
        key: groupId,
        kind: "version",
        groupId,
        cachedAt: lastUsedAt,
        lastUsedAt,
        expiresAt: current + 60_000,
        negative: false,
        value: { id, modelId: id, files: [] }
      },
      {
        key: `hash-id:SHA256:${String(id).padStart(64, "A")}`,
        kind: "hash-id",
        groupId,
        cachedAt: lastUsedAt,
        lastUsedAt,
        expiresAt: current + 60_000,
        negative: false,
        value: { hash: String(id).padStart(64, "A"), modelVersionId: id }
      }
    );
  }
  records.push({
    key: "search:expired",
    kind: "search",
    groupId: "search:expired",
    cachedAt: current - 20_000,
    lastUsedAt: current - 20_000,
    expiresAt: current - 1,
    negative: false,
    value: { items: [] }
  });

  const plan = cache.planPrune(records, current);
  const keptVersionGroups = new Set(
    plan.kept.filter((record) => record.kind === "version").map((record) => record.groupId)
  );

  assert.equal(plan.stats.versions, 2_000);
  assert.ok(plan.removed.includes("version:1"));
  assert.ok(plan.removed.includes("search:expired"));
  assert.ok(plan.kept
    .filter((record) => record.kind === "hash-id")
    .every((record) => keptVersionGroups.has(record.groupId)));
});
