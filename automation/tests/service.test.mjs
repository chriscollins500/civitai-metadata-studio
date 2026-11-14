import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StudioService } from "../service.mjs";
import { imageFixture } from "../../tests/fixtures.mjs";

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "studio-service-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, "input"), output = join(root, "output");
  await mkdir(input); await mkdir(output);
  const source = join(input, "source.png");
  await writeFile(source, new Uint8Array(await imageFixture().arrayBuffer()));
  const service = await new StudioService({ readRoots: [input], writeRoot: output, ...options }).initialize();
  return { root, input, output, source, service };
}

test("automation uses real pixels, omits prompts by default, and rejects paths outside roots", async (t) => {
  const { service, source, root } = await fixture(t);
  const opened = await service.call("open_image", { path: source });
  assert.deepEqual(opened.dimensions, { width: 3, height: 2 });
  assert.equal(opened.fields.width.value, 3);
  assert.equal(opened.fields.positivePrompt, undefined);
  const detailed = await service.call("read_image", { imageId: opened.imageId, includePrompts: true });
  assert.match(detailed.fields.positivePrompt.value, /observatory/);
  const outside = join(root, "outside.png"); await writeFile(outside, new Uint8Array(await imageFixture().arrayBuffer()));
  await assert.rejects(service.call("open_image", { path: outside }), { code: "read_denied" });
  await assert.rejects(service.call("hash_model", { path: `${source}:secret` }), { code: "read_denied" });
});

test("metadata edits are atomic and revisions reject stale writes", async (t) => {
  const { service, source } = await fixture(t);
  const { imageId } = await service.call("open_image", { path: source });
  await assert.rejects(service.call("edit_image", { imageId, expectedRevision: 0, fields: { steps: 12, width: -1 } }), { code: "invalid_metadata" });
  const unchanged = await service.call("read_image", { imageId });
  assert.equal(unchanged.revision, 0); assert.equal(unchanged.fields.steps.value, 8);
  assert.equal(unchanged.history.undo, 0);
  const edited = await service.call("edit_image", { imageId, expectedRevision: 0, fields: { steps: 12, width: 8192 } });
  assert.equal(edited.revision, 1); assert.equal(edited.history.undo, 1);
  await assert.rejects(service.call("edit_image", { imageId, expectedRevision: 0, fields: { steps: 99 } }), { code: "revision_conflict" });
  const undone = await service.call("undo_image", { imageId, expectedRevision: 1 });
  assert.equal(undone.fields.steps.value, 8); assert.equal(undone.fields.width.value, 3);
  const redone = await service.call("redo_image", { imageId, expectedRevision: 2 });
  assert.equal(redone.fields.steps.value, 12); assert.equal(redone.fields.width.value, 8192);
});

test("exports prove payload integrity, preserve originals and refuse overwrite and traversal", async (t) => {
  const { service, source, output } = await fixture(t);
  const original = await readFile(source);
  const { imageId } = await service.call("open_image", { path: source });
  const result = await service.call("export_image", { imageId, expectedRevision: 0 });
  assert.equal(result.integrity.preserved, true);
  assert.equal(result.filename, "source_metadata.png");
  assert.equal(result.sha256.length, 64);
  assert.notDeepEqual(await readFile(join(output, result.filename)), original);
  assert.deepEqual(await readFile(source), original);
  await assert.rejects(service.call("export_image", { imageId, expectedRevision: 0 }), { code: "file_exists" });
  for (const filename of ["../leak.png", "output.jpg", "CON.png", "source:secret.png"]) await assert.rejects(service.call("export_image", { imageId, expectedRevision: 0, filename }), { code: "invalid_filename" });
});

test("network and writes are opt-in and closed or expired sessions cannot be read", async (t) => {
  const { source, input } = await fixture(t);
  const service = await new StudioService({ readRoots: [input], maxSessions: 1 }).initialize();
  const { imageId } = await service.call("open_image", { path: source });
  await assert.rejects(service.call("search_resources", { query: "Example" }), { code: "network_denied" });
  await assert.rejects(service.call("verify_image", { imageId, expectedRevision: 0 }), { code: "network_denied" });
  await assert.rejects(service.call("export_image", { imageId, expectedRevision: 0 }), { code: "write_denied" });
  await assert.rejects(service.call("open_image", { path: source }), { code: "session_limit" });
  await service.call("close_image", { imageId });
  await assert.rejects(service.call("read_image", { imageId }), { code: "session_not_found" });
  const next = await service.call("open_image", { path: source });
  service.sessions.get(next.imageId).touched = Date.now() - service.sessionTtl - 1;
  await assert.rejects(service.call("read_image", { imageId: next.imageId }), { code: "session_not_found" });
});

test("cancelled mutations roll back and retain a usable session", async (t) => {
  const { service, source } = await fixture(t); const { imageId } = await service.call("open_image", { path: source });
  const controller = new AbortController(); const session = service.session(imageId);
  await assert.rejects(service.mutate(session, (state) => { state.updateField("steps", 20); controller.abort(); }, "Cancelled edit", controller.signal), { name: "AbortError" });
  const record = await service.call("read_image", { imageId }); assert.equal(record.revision, 0); assert.equal(record.fields.steps.value, 8);
});

test("unknown or prototype-like inputs are rejected before mutating a session", async (t) => {
  const { service } = await fixture(t);
  await assert.rejects(service.call("capabilities", { unexpected: true }), { code: "invalid_arguments" });
  await assert.rejects(service.call("edit_image", JSON.parse('{"imageId":"bad","expectedRevision":0,"fields":{"__proto__":{"polluted":true}}}')), { code: "invalid_arguments" });
  assert.equal({}.polluted, undefined);
});
