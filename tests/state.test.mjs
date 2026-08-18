import test from "node:test";
import assert from "node:assert/strict";

globalThis.CMStudio = {};
for (const module of [
  "../src/core/constants.js",
  "../src/core/util.js",
  "../src/core/air.js",
  "../src/core/civitai-contract.js",
  "../src/core/canonical.js",
  "../src/app/state.js"
]) {
  await import(module);
}

test("discarding a newly added resource restores the prior dirty state", () => {
  const state = new globalThis.CMStudio.AppState();
  state.entries = [{
    record: {
      dirty: true,
      resources: [
        { key: "existing" },
        { key: "draft" }
      ]
    }
  }];
  state.currentIndex = 0;

  assert.equal(state.discardResource("draft", true), true);
  assert.deepEqual(state.current.resources, [{ key: "existing" }]);
  assert.equal(state.current.dirty, true);
  assert.equal(state.discardResource("missing", false), false);
});

test("successful verification emits after returning the entry to ready", async () => {
  const state = new globalThis.CMStudio.AppState();
  const entry = {
    state: "ready",
    record: {
      fields: {},
      resources: [],
      verification: { status: "unverified", checked: 0, verified: 0, unresolved: 0, errors: [] }
    }
  };
  state.entries = [entry];
  state.currentIndex = 0;

  globalThis.CMStudio.civitai = {
    async verifyRecord(record, { onProgress }) {
      record.verification = { status: "no-resources", checked: 0, verified: 0, unresolved: 0, errors: [] };
      onProgress(record.verification);
    }
  };
  const observedStates = [];
  state.addEventListener("change", () => observedStates.push(entry.state));

  await state.verifyEntry(entry, true);

  assert.equal(entry.state, "ready");
  assert.deepEqual(observedStates, ["verifying", "verifying", "ready"]);
});

test("multi-image verification shares one resource prefetch", async () => {
  const state = new globalThis.CMStudio.AppState();
  const entries = ["one.png", "two.png"].map((name, index) => ({
    file: { name },
    state: "ready",
    record: {
      fields: {},
      resources: [{ name: `resource-${index}`, removed: false }],
      verification: { status: "unverified", checked: 0, verified: 0, unresolved: 0, errors: [] }
    }
  }));
  state.entries = entries;
  state.currentIndex = 0;
  state.importMissingPrimaryFields = () => {};
  let prefetchCalls = 0;
  let verifyCalls = 0;

  globalThis.CMStudio.civitai = {
    async prefetchResources(resources, { metrics }) {
      prefetchCalls += 1;
      assert.equal(resources.length, 2);
      metrics.networkCalls = 1;
      metrics.batchCalls = 1;
    },
    async verifyRecord(record, { skipPrefetch, sharedBatch, onProgress }) {
      verifyCalls += 1;
      assert.equal(skipPrefetch, true);
      assert.equal(sharedBatch.images, 2);
      record.verification = {
        status: "verified",
        checked: 1,
        verified: 1,
        unresolved: 0,
        errors: [],
        networkCalls: 0,
        batchCalls: 0,
        cacheHits: 1,
        coalesced: 0,
        batchFallbacks: 0,
        sharedBatch
      };
      onProgress(record.verification);
    }
  };

  await state.verifyEntries(entries, true);

  assert.equal(prefetchCalls, 1);
  assert.equal(verifyCalls, 2);
  assert.deepEqual(entries.map((entry) => entry.state), ["ready", "ready"]);
  assert.equal(entries[0].record.verification.sharedBatch.networkCalls, 1);
  assert.equal(entries[0].record.verification.sharedBatch.cacheHits, 2);
});

test("queue removal keeps selection stable and never touches source files", () => {
  const state = new globalThis.CMStudio.AppState();
  const entries = ["a.png", "b.png", "c.png"].map((name) => ({
    id: name,
    file: { name },
    state: "ready",
    record: {}
  }));
  const [, second, third] = entries;
  state.entries = entries;
  state.currentIndex = 1;

  assert.equal(state.removeEntry(0), true);
  assert.equal(state.currentEntry, second);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.removeEntry(0), true);
  assert.equal(state.currentEntry, third);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.removeEntry(0), true);
  assert.equal(state.currentEntry, null);
  assert.equal(state.currentIndex, -1);
});

test("clearing the queue aborts verification and resets selection", () => {
  const state = new globalThis.CMStudio.AppState();
  const controller = new AbortController();
  state.entries = [{ file: { name: "one.png" }, state: "verifying", record: {} }];
  state.currentIndex = 0;
  state.verificationController = controller;
  state.verificationEntry = state.entries[0];

  assert.equal(state.clearEntries(), true);
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(state.entries, []);
  assert.equal(state.currentIndex, -1);
  assert.match(state.notice.message, /original files were not changed/i);
});

test("Civitai image import fills only missing fields and sends differences to review", async () => {
  const state = new globalThis.CMStudio.AppState();
  state.autoVerify = false;
  const record = {
    dirty: false,
    fields: Object.fromEntries(globalThis.CMStudio.constants.GENERATION_FIELDS.map(({ key }) => [
      key,
      {
        value: key === "positivePrompt" ? "local prompt" : key === "width" ? 1024 : "",
        source: key === "width" ? "image_header" : "unknown",
        evidence: "",
        confidence: "claimed",
        edited: false
      }
    ])),
    resources: [],
    conflicts: []
  };
  state.entries = [{ state: "ready", record }];
  state.currentIndex = 0;
  globalThis.CMStudio.civitai = {
    async lookupImage() {
      return {
        imageId: 123,
        sourceUrl: "https://civitai.com/images/123",
        evidence: "Civitai image 123",
        fields: {
          positivePrompt: "remote prompt",
          negativePrompt: "remote negative",
          width: 768
        },
        resources: [{
          name: "Remote model",
          role: "checkpoint",
          type: "Checkpoint",
          modelId: 12,
          modelVersionId: 34
        }]
      };
    }
  };

  const result = await state.importCivitaiImage("123");

  assert.equal(result.importedFields, 1);
  assert.equal(result.fieldConflicts, 2);
  assert.equal(record.fields.positivePrompt.value, "local prompt");
  assert.equal(record.fields.negativePrompt.value, "remote negative");
  assert.equal(record.fields.negativePrompt.source, "civitai_image");
  assert.equal(record.fields.width.value, 1024);
  assert.deepEqual(record.conflicts.map((conflict) => conflict.field).sort(), ["positivePrompt", "width"]);
  assert.equal(record.resources.length, 1);
  assert.equal(record.resources[0].verification, "claimed");
  assert.equal(record.resources[0].identitySource, "civitai_image");
});
