(() => {
  "use strict";
  const Studio = globalThis.CMStudio ||= {};
  const mutableKeys = ["fields", "resources", "metadataSelections", "conflicts", "verification", "dirty", "civitaiImports"];

  function capture(record) {
    return structuredClone(Object.fromEntries(mutableKeys.filter((key) => key in record).map((key) => [key, record[key]])));
  }

  function restore(record, snapshot) {
    for (const key of mutableKeys) {
      if (key in snapshot) record[key] = structuredClone(snapshot[key]);
      else delete record[key];
    }
  }

  function invalidate(resource, record) {
    resource.verification = "unresolved";
    resource.verificationMessage = "Identity evidence changed. Verify this resource again.";
    for (const key of ["verificationEvidence", "apiCandidate", "apiReference", "lookupDiagnostics", "verifiedAt", "creator", "trainedWords", "license"]) delete resource[key];
    resource.parserFacing = false;
    resource.parserExclusionReason = "Identity evidence has not been reverified.";
    if (record) record.verification = { status: "unverified", checked: 0, verified: 0, unresolved: record.resources.filter((item) => !item.removed).length, errors: [] };
  }

  // A matching name is a clue, never authority to import an identity.
  function exactOverlap(left, right) {
    if (left.role !== right.role) return false;
    if (left.modelVersionId && right.modelVersionId) return left.modelVersionId === right.modelVersionId;
    return Object.entries(left.hashes || {}).some(([algorithm, hash]) =>
      hash && Studio.util.normalizeHash(hash) === Studio.util.normalizeHash(right.hashes?.[algorithm])
    );
  }

  class History {
    constructor() { this.undo = []; this.redo = []; this.bytes = 0; this.lastGroup = ""; this.lastTime = 0; }
    push(record, label, group = "") {
      const now = Date.now();
      if (group && group === this.lastGroup && now - this.lastTime < 750) { this.lastTime = now; this.redo = []; return; }
      const snapshot = capture(record);
      const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
      this.redo = [];
      this.lastGroup = group; this.lastTime = now;
      if (bytes > 8 * 1024 * 1024) { this.undo = []; this.bytes = 0; return; }
      this.undo.push({ snapshot, label, bytes }); this.trim();
    }
    trim() {
      this.bytes = [...this.undo, ...this.redo].reduce((sum, item) => sum + item.bytes, 0);
      while (this.undo.length + this.redo.length > 60 || this.bytes > 8 * 1024 * 1024) {
        const list = this.undo.length > this.redo.length ? this.undo : this.redo;
        const item = list.shift();
        if (!item) break;
        this.bytes -= item.bytes;
      }
    }
    move(record, direction) {
      const from = direction === "undo" ? this.undo : this.redo;
      const to = direction === "undo" ? this.redo : this.undo;
      const item = from.pop();
      if (!item) return "";
      const snapshot = capture(record);
      const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
      if (bytes <= 8 * 1024 * 1024) to.push({ snapshot, label: item.label, bytes });
      else to.length = 0;
      restore(record, item.snapshot);
      this.trim();
      this.lastGroup = "";
      return item.label;
    }
  }
  Studio.editing = Object.freeze({ capture, restore, invalidate, exactOverlap, History });
})();
