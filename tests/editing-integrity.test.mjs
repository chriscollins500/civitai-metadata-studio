import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { imageFixture, recordFixture, Studio } from "./fixtures.mjs";

test("undo and redo restore fields, resource identity, conflicts, and provenance together", async () => {
  const record = await recordFixture({ resources: [{ name: "Example", role: "checkpoint", modelId: 12, modelVersionId: 34 }] });
  const state = new Studio.AppState(); state.autoVerify = false;
  state.entries = [{ record, file: record.file, state: "ready" }]; state.currentIndex = 0;
  const original = record.fields.modelName.value;
  const model = record.resources.find((item) => item.role === "checkpoint");
  model.verification = "verified"; model.verificationEvidence = { kind: "modelVersionId", value: 34 };
  state.updateField("modelName", "Different name");
  assert.equal(model.verification, "unresolved");
  assert.equal(model.verificationEvidence, undefined);
  assert.equal(record.verification.status, "unverified");
  assert.equal(state.travelHistory("undo"), true);
  assert.equal(record.fields.modelName.value, original);
  assert.equal(record.resources[0].verification, "verified");
  assert.equal(state.travelHistory("redo"), true);
  assert.equal(record.fields.modelName.value, "Different name");
  assert.equal(record.resources[0].verificationEvidence, undefined);
});

test("history coalesces typing and discards redo after a new edit", async () => {
  const record = await recordFixture(); const history = new Studio.editing.History();
  history.push(record, "Typing", "positivePrompt");
  Studio.canonical.setField(record, "positivePrompt", "one");
  history.push(record, "Typing", "positivePrompt");
  Studio.canonical.setField(record, "positivePrompt", "two");
  assert.equal(history.undo.length, 1);
  history.move(record, "undo");
  assert.equal(record.fields.positivePrompt.value, "A quiet observatory above the clouds");
  assert.equal(history.redo.length, 1);
  history.push(record, "New edit");
  assert.equal(history.redo.length, 0);
});

test("canceling local model hashing restores identity proof and unlocks the image", async () => {
  const record = await recordFixture({ resources: [{ name: "Example", role: "checkpoint", modelId: 12, modelVersionId: 34 }] });
  const state = new Studio.AppState(); state.autoVerify = false;
  const entry = { record, file: record.file, state: "ready" };
  state.entries = [entry]; state.currentIndex = 0;
  const resource = record.resources[0];
  resource.verification = "verified";
  resource.verificationEvidence = { kind: "modelVersionId", value: 34 };
  const before = Studio.editing.capture(record);
  const file = new File([new Uint8Array(128 * 1024)], "example.bin");
  await assert.rejects(state.hashResourceFile(resource.key, file, () => state.hashingController.abort()), { name: "AbortError" });
  assert.equal(entry.state, "ready");
  assert.equal(state.hashingController, null);
  assert.equal(state.hashingEntry, null);
  assert.deepEqual(Studio.editing.capture(record), before);
});

test("removing a primary resource hash also clears its generation-field projection", async () => {
  const record = await recordFixture({ resources: [{ name: "Example", role: "checkpoint", hashes: { AutoV2: "AABBCCDDEE" } }] });
  const state = new Studio.AppState(); state.autoVerify = false;
  state.entries = [{ record, file: record.file, state: "ready" }]; state.currentIndex = 0;
  const resource = record.resources[0];
  state.updateResource(resource.key, { ...resource, hashes: {} });
  assert.deepEqual(resource.hashes, {});
  assert.equal(record.fields.modelHash.value, "");
});

test("identity imports never attach exact IDs by matching name or a different hash algorithm", async () => {
  const record = await recordFixture({ resources: [{ name: "Same name", role: "lora", hashes: { CRC32: "AABBCCDD" } }] });
  const state = new Studio.AppState(); state.autoVerify = false;
  state.entries = [{ record, file: record.file, state: "ready" }]; state.currentIndex = 0;
  await state.importIdentities(new File([JSON.stringify({ schema: "civitai-metadata-studio.identity-cache", resources: [{ name: "Same name", role: "lora", modelVersionId: 99, hashes: { AutoV1: "AABBCCDD" } }] })], "identities.json"));
  assert.equal(record.resources.length, 2);
  assert.equal(record.resources[0].modelVersionId, null);
  assert.equal(record.resources[1].modelVersionId, 99);
});

for (const format of ["png", "jpeg", "webp"]) test(`${format} export proof compares original encoded image payloads`, async () => {
  const source = imageFixture(format);
  const record = await Studio.canonical.createRecord(source, await Studio.canonical.inspectFile(source));
  Studio.canonical.setField(record, "positivePrompt", "Edited recipe");
  const output = Studio.canonical.rewrite(record);
  const proof = await Studio.integrity.verifyExport(record, output);
  assert.equal(proof.preserved, true);
  assert.equal(proof.before.digest, proof.after.digest);
  assert.equal(proof.before.bytes, proof.after.bytes);
  assert.equal(proof.before.digest.length, 64);
});

for (const format of ["jpeg", "webp"]) test(`${format} exports preserve unresolved version claims and local-only resources`, async () => {
  const source = imageFixture(format);
  const record = await Studio.canonical.createRecord(source, await Studio.canonical.inspectFile(source));
  record.resources = [
    { name: "Unknown checkpoint", role: "checkpoint", type: "Checkpoint", modelVersionId: 345685 },
    { name: "Local adapter", role: "lora", type: "LORA", weight: 0.65 }
  ].map((resource) => Studio.canonical.normalizeResource(resource));
  const output = Studio.canonical.rewrite(record);
  const reopened = await Studio.canonical.createRecord(output, await Studio.canonical.inspectFile(output));
  assert.equal(reopened.resources.length, 2);
  assert.equal(reopened.resources.find((resource) => resource.role === "checkpoint").modelVersionId, 345685);
  assert.equal(reopened.resources.find((resource) => resource.role === "lora").weight, 0.65);
  assert.equal(reopened.resources.some((resource) => resource.verification === "verified"), false);
});

test("integrity failure prevents claiming an altered pixel payload is preserved", async () => {
  const record = await recordFixture();
  const bytes = new Uint8Array(await record.file.arrayBuffer());
  const idat = record.inspection.chunks.find((chunk) => chunk.type === "IDAT");
  bytes[idat.offset + 8] ^= 0x01;
  await assert.rejects(Studio.integrity.verifyExport(record, new Blob([bytes])), /integrity check failed/);
});

test("compressed metadata is stopped during inflation at the configured decoding bound", async () => {
  const file = imageFixture(); const inspection = await Studio.canonical.inspectFile(file);
  const oversized = deflateSync(Buffer.alloc(Studio.constants.METADATA_VALUE_LIMIT + 1, 65));
  const chunk = Studio.png.chunkBytes("zTXt", Studio.binary.concatBytes(Uint8Array.from("oversized", (char) => char.charCodeAt(0)), Uint8Array.of(0,0), oversized));
  const source = new File([file.slice(0, inspection.chunks[0].offset + inspection.chunks[0].totalLength), chunk, file.slice(inspection.chunks[1].offset)], "oversized.png");
  const parsed = await Studio.canonical.inspectFile(source);
  assert.ok(parsed.warnings.some((message) => /safety limit/.test(message)));
  assert.equal(parsed.carriers.some((carrier) => carrier.value?.length > Studio.constants.METADATA_VALUE_LIMIT), false);
});
