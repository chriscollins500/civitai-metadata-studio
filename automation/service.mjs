import { openAsBlob } from "node:fs";
import { realpath, stat, open, unlink } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import Studio from "../src/engine.mjs";
import { inputs } from "./schemas.mjs";

export class StudioError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new StudioError(code, message, status); };
const inside = (root, path) => { const part = relative(root, path); return part === "" || (!isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`)); };
const safeName = (name) => name && name === basename(name) && !/[<>:"/\\|?*\x00-\x1F]/.test(name) && !/[. ]$/.test(name) && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name);

export class StudioService {
  constructor({ readRoots = [], writeRoot = null, network = false, maxSessions = 32, sessionTtl = 30 * 60_000 } = {}) {
    this.readRoots = readRoots; this.writeRoot = writeRoot; this.network = network;
    this.maxSessions = maxSessions; this.sessionTtl = sessionTtl; this.sessions = new Map();
  }
  async initialize() {
    this.readRoots = await Promise.all(this.readRoots.map((root) => realpath(root)));
    if (this.writeRoot) this.writeRoot = await realpath(this.writeRoot);
    for (const root of [...this.readRoots, ...(this.writeRoot ? [this.writeRoot] : [])]) {
      if (!(await stat(root)).isDirectory()) fail("invalid_root", "Configured roots must be existing directories.");
    }
    this.pruneTimer = setInterval(() => this.prune(), 60_000);
    this.pruneTimer.unref();
    return this;
  }
  dispose() { clearInterval(this.pruneTimer); this.sessions.clear(); }
  capabilities() {
    return { name: Studio.constants.APP_NAME, version: Studio.constants.APP_VERSION, formats: ["png", "jpeg", "webp"], fields: Studio.constants.GENERATION_FIELDS,
      permissions: { readRoots: this.readRoots.length, write: Boolean(this.writeRoot), network: this.network },
      limits: { maxSessions: this.maxSessions, sessionTtlSeconds: this.sessionTtl / 1000, historyEntries: 60 },
      guarantees: { originalsNeverOverwritten: true, pixelReencoding: false, exactIdentityOnly: true, promptsPersisted: false } };
  }
  prune() { for (const [id, session] of this.sessions) if (!session.busy && Date.now() - session.touched > this.sessionTtl) this.sessions.delete(id); }
  session(id, expectedRevision) {
    this.prune();
    const session = this.sessions.get(id);
    if (!session) fail("session_not_found", "Image session was closed or expired. Open the image again.", 404);
    if (expectedRevision !== undefined && expectedRevision !== session.revision) fail("revision_conflict", `The image changed. Read revision ${session.revision} before editing.`, 409);
    session.touched = Date.now(); return session;
  }
  async permittedFile(path) {
    if (!this.readRoots.length) fail("read_denied", "Configure --read-root before opening local files.", 403);
    // Reject alternate NTFS streams and device paths, even inside a permitted directory.
    if (path.replace(/^[A-Za-z]:/, "").includes(":") || /^(?:\\\\[.?]\\)/.test(path)) fail("read_denied", "Special paths and alternate streams are not allowed.", 403);
    let target;
    try { target = await realpath(resolve(path)); } catch { fail("file_not_found", "The selected local file could not be opened.", 404); }
    if (!this.readRoots.some((root) => inside(root, target))) fail("read_denied", "The file is outside the configured read roots.", 403);
    const info = await stat(target);
    if (!info.isFile()) fail("not_a_file", "Choose a regular file.");
    const blob = await openAsBlob(target);
    Object.defineProperties(blob, { name: { value: basename(target) }, lastModified: { value: info.mtimeMs } });
    return blob;
  }
  view(session, includePrompts = false) {
    const record = session.state.current;
    const fieldValues = Object.fromEntries(Object.entries(record.fields).filter(([key]) => includePrompts || !/Prompt$/.test(key)).map(([key, value]) => [key, value]));
    return structuredClone({ imageId: session.id, revision: session.revision, filename: record.fileName, format: record.format, bytes: record.size,
      dimensions: record.dimensions, animated: record.inspection.animated, fields: fieldValues,
      resources: record.resources, verification: record.verification,
      conflicts: record.conflicts.filter((item) => includePrompts || !/Prompt$/.test(item.field)),
      warnings: record.warnings, validation: Studio.canonical.validate(record),
      preservedMetadata: record.inspection.metadataItems.map(({id, label, category, preserveSupported}) => ({id, label, category, preserveSupported, preserve: record.metadataSelections[id]})),
      history: { undo: session.state.history().undo.length, redo: session.state.history().redo.length },
      promptsIncluded: includePrompts });
  }
  async mutate(session, action, label, signal) {
    if (session.busy) fail("image_busy", "Another operation is already using this image.", 409);
    session.busy = true;
    const record = session.state.current;
    const before = Studio.editing.capture(record);
    const history = session.state.history();
    const oldUndo = history.undo.slice(), oldRedo = history.redo.slice();
    try {
      signal?.throwIfAborted();
      await action(session.state);
      signal?.throwIfAborted();
      const errors = Studio.canonical.validate(record);
      if (errors.length) fail("invalid_metadata", errors.join(" "), 422);
      const after = Studio.editing.capture(record);
      Studio.editing.restore(record, before);
      history.undo = oldUndo; history.redo = oldRedo;
      history.lastGroup = ""; history.bytes = oldUndo.reduce((sum, item) => sum + item.bytes, 0);
      history.push(record, label);
      Studio.editing.restore(record, after);
      session.revision += 1;
      return this.view(session);
    } catch (error) {
      Studio.editing.restore(record, before);
      history.undo = oldUndo; history.redo = oldRedo;
      throw error;
    } finally { session.busy = false; session.touched = Date.now(); }
  }
  requireNetwork() { if (!this.network) fail("network_denied", "Start the companion with --network to allow explicit Civitai calls.", 403); }
  async call(name, raw, { signal, onProgress } = {}) {
    const schema = Object.hasOwn(inputs, name) ? inputs[name] : null;
    if (!schema) fail("unknown_operation", "Unknown Studio operation.", 404);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) fail("invalid_arguments", parsed.error.issues.map((item) => `${item.path.join(".")}: ${item.message}`).join("; "), 422);
    const args = parsed.data;
    signal?.throwIfAborted(); this.prune();
    if (name === "capabilities") return this.capabilities();
    if (name === "civitai_reference") { this.requireNetwork(); return Studio.civitai.referenceData({ signal }); }
    if (name === "open_image") {
      if (this.sessions.size >= this.maxSessions) fail("session_limit", "Close an image session before opening another.", 429);
      const file = await this.permittedFile(args.path);
      const inspection = await Studio.canonical.inspectFile(file);
      const record = await Studio.canonical.createRecord(file, inspection);
      record.processingContext = "local-companion";
      signal?.throwIfAborted();
      // Recheck after asynchronous inspection, so simultaneous opens cannot exceed the bound.
      if (this.sessions.size >= this.maxSessions) fail("session_limit", "Close an image session before opening another.", 429);
      const state = new Studio.AppState(); state.autoVerify = false;
      state.entries = [{ file, record, state: "ready" }]; state.currentIndex = 0;
      const session = { id: randomUUID(), revision: 0, state, touched: Date.now(), busy: false };
      this.sessions.set(session.id, session); return this.view(session, args.includePrompts);
    }
    if (name === "search_resources") { this.requireNetwork(); return { candidates: await Studio.civitai.searchCandidates(args.query, { signal }) }; }
    if (name === "hash_model") {
      const file = await this.permittedFile(args.path);
      return { filename: file.name, bytes: file.size, hashes: await Studio.sha256.hashModelFile(file, { signal, onProgress }) };
    }
    const session = this.session(args.imageId, args.expectedRevision);
    if (session.busy) fail("image_busy", "Another operation is already using this image.", 409);
    if (name === "read_image") return this.view(session, args.includePrompts);
    if (name === "close_image") { this.sessions.delete(session.id); return { imageId: session.id, closed: true }; }
    if (name === "report_image") {
      const report = this.view(session, args.includePrompts);
      report.changes = Studio.canonical.diff(session.state.current).filter((row) => args.includePrompts || !/prompt/i.test(row.label));
      report.exportIntegrity = session.state.current.exportIntegrity || null;
      return report;
    }
    if (name === "undo_image" || name === "redo_image") {
      if (!session.state.travelHistory(name === "undo_image" ? "undo" : "redo")) fail("history_empty", "There is no edit to undo or redo.", 409);
      session.revision += 1; return this.view(session);
    }
    if (name === "edit_image") return this.mutate(session, (state) => {
      for (const [key, value] of Object.entries(args.fields || {})) state.updateField(key, value);
      for (const item of args.resources || []) {
        const existing = item.key ? state.current.resources.find((resource) => resource.key === item.key && !resource.removed) : state.addResource();
        if (!existing) fail("resource_not_found", "The selected resource no longer exists.", 404);
        state.updateResource(existing.key, { ...existing, ...item.values, hashes: item.values.hashes || existing.hashes });
      }
      for (const key of args.removeResources || []) {
        if (!state.current.resources.some((item) => item.key === key)) fail("resource_not_found", "The selected resource no longer exists.", 404);
        state.removeResource(key);
      }
      for (const [id, selected] of Object.entries(args.preserve || {})) {
        const item = state.current.inspection.metadataItems.find((item) => item.id === id);
        if (!item || (selected && !item.preserveSupported)) fail("preservation_denied", "This metadata item cannot be preserved.");
        state.updateMetadataSelection(id, selected);
      }
    }, "Automation edit", signal);
    if (name === "verify_image") {
      this.requireNetwork();
      return this.mutate(session, async (state) => {
        await Studio.civitai.verifyRecord(state.current, { signal, onProgress });
        state.importMissingPrimaryFields(state.current);
      }, "Civitai verification", signal);
    }
    if (name === "import_civitai_metadata") {
      this.requireNetwork();
      return this.mutate(session, async (state) => { await state.importCivitaiImage(String(args.civitaiImageId), { signal }); }, "Civitai image import", signal);
    }
    if (name === "export_image") return this.export(session, args, { signal, onProgress });
  }
  async export(session, args, options) {
    if (!this.writeRoot) fail("write_denied", "Configure --write-root before exporting images.", 403);
    session.busy = true;
    const record = session.state.current;
    let handle = null, target = null;
    try {
      const ext = { png: ".png", jpeg: ".jpg", webp: ".webp" }[record.format];
      const filename = args.filename || Studio.util.outputName(`${Studio.util.withoutExtension(record.fileName)}${ext}`, args.suffix);
      if (!safeName(filename) || !([ext, ...(record.format === "jpeg" ? [".jpeg"] : [])].includes(extname(filename).toLowerCase()))) fail("invalid_filename", "Export filename must be a plain filename in the original image format.");
      const output = Studio.canonical.rewrite(record);
      const integrity = await Studio.integrity.verifyExport(record, output, options);
      options.signal?.throwIfAborted();
      // realpath is rechecked on each write; wx makes accidental overwrite impossible.
      const currentRoot = await realpath(this.writeRoot);
      if (currentRoot !== this.writeRoot) fail("write_denied", "The configured output directory changed.", 403);
      target = resolve(currentRoot, filename);
      try { handle = await open(target, "wx"); } catch (error) {
        if (error.code === "EEXIST") fail("file_exists", "An output with that name already exists. Choose a new filename.", 409);
        fail("write_failed", "The new output could not be created.", 500);
      }
      const hash = createHash("sha256");
      for await (const chunk of output.stream()) { options.signal?.throwIfAborted(); hash.update(chunk); await handle.writeFile(chunk); }
      await handle.sync(); await handle.close(); handle = null;
      record.exportIntegrity = integrity;
      return { imageId: session.id, revision: session.revision, filename, bytes: output.size, sha256: hash.digest("hex"), integrity, originalUnchanged: true };
    } catch (error) {
      if (handle) { await handle.close().catch(() => {}); await unlink(target).catch(() => {}); }
      throw error;
    } finally { session.busy = false; session.touched = Date.now(); }
  }
}
