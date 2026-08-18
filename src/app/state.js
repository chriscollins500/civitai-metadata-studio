(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const {
    clone,
    integerOrNull,
    normalizeHash,
    numberOrNull,
    randomId,
    safeJsonParse,
    sameValue,
    sanitizeText,
    stableStringify,
    strongestHash
  } = Studio.util;

  class AppState extends EventTarget {
    constructor() {
      super();
      this.entries = [];
      this.currentIndex = -1;
      this.autoVerify = true;
      this.busy = false;
      this.notice = null;
      this.verificationController = null;
      this.verificationEntry = null;
      this.verificationEntries = new Set();
    }

    emit() {
      this.dispatchEvent(new Event("change"));
    }

    announce(message, tone = "info") {
      this.notice = { id: randomId("notice"), message: sanitizeText(message, 2000), tone };
      this.emit();
    }

    get currentEntry() {
      return this.entries[this.currentIndex] || null;
    }

    get current() {
      return this.currentEntry?.record || null;
    }

    async addFiles(fileList) {
      const files = [...fileList].filter((file) => file instanceof File);
      if (!files.length) return;
      const firstNewIndex = this.entries.length;
      const newEntries = files.map((file) => ({
          id: randomId("queue"),
          file,
          state: "queued",
          record: null,
          error: ""
      }));
      this.entries.push(...newEntries);
      if (this.currentIndex < 0) this.currentIndex = firstNewIndex;
      this.emit();

      const readyEntries = [];
      for (const entry of newEntries) {
        if (!this.entries.includes(entry)) continue;
        entry.state = "inspecting";
        this.emit();
        try {
          const inspection = await Studio.canonical.inspectFile(entry.file);
          if (!this.entries.includes(entry)) continue;
          entry.record = await Studio.canonical.createRecord(entry.file, inspection);
          if (!this.entries.includes(entry)) continue;
          entry.state = "ready";
          readyEntries.push(entry);
          this.emit();
        } catch (error) {
          if (!this.entries.includes(entry)) continue;
          entry.state = "error";
          entry.error = sanitizeText(error.message || error);
          this.announce(`${Studio.util.basename(entry.file.name)}: ${entry.error}`, "error");
        }
      }
      const verifiable = readyEntries.filter((entry) => this.entries.includes(entry) && entry.record);
      if (this.autoVerify && verifiable.length === 1) await this.verifyEntry(verifiable[0], true);
      else if (this.autoVerify && verifiable.length > 1) await this.verifyEntries(verifiable, true);
    }

    select(index) {
      const number = Number(index);
      if (!Number.isInteger(number) || number < 0 || number >= this.entries.length) return;
      this.currentIndex = number;
      this.emit();
    }

    removeEntry(index) {
      if (this.busy) return false;
      const number = Number(index);
      if (!Number.isInteger(number) || number < 0 || number >= this.entries.length) return false;
      const [removed] = this.entries.splice(number, 1);
      if (removed === this.verificationEntry || this.verificationEntries.has(removed)) {
        this.verificationController?.abort();
      }
      if (!this.entries.length) {
        this.currentIndex = -1;
      } else if (number < this.currentIndex) {
        this.currentIndex -= 1;
      } else if (number === this.currentIndex) {
        this.currentIndex = Math.min(number, this.entries.length - 1);
      }
      this.announce(`${Studio.util.basename(removed.file.name)} removed from the queue. The original file was not changed.`, "info");
      return true;
    }

    clearEntries() {
      if (this.busy || !this.entries.length) return false;
      const count = this.entries.length;
      this.verificationController?.abort();
      this.verificationController = null;
      this.verificationEntry = null;
      this.verificationEntries.clear();
      this.entries = [];
      this.currentIndex = -1;
      this.announce(`${count} image${count === 1 ? "" : "s"} cleared from the queue. Original files were not changed.`, "info");
      return true;
    }

    setAutoVerify(value) {
      this.autoVerify = Boolean(value);
      if (!this.autoVerify) this.verificationController?.abort();
      this.emit();
    }

    parseField(key, value) {
      const definition = Studio.constants.GENERATION_FIELDS.find((field) => field.key === key);
      if (!definition) return value;
      if (value === "") return "";
      if (definition.kind === "integer") return integerOrNull(value) ?? value;
      if (definition.kind === "number") return numberOrNull(value) ?? value;
      if (definition.kind === "hash") return normalizeHash(value);
      return sanitizeText(value);
    }

    updateField(key, value) {
      const record = this.current;
      if (!record) return;
      Studio.canonical.setField(record, key, this.parseField(key, value));
      this.syncResourceFromFields(record, key);
      this.emit();
    }

    syncResourceFromFields(record, key) {
      const checkpointKeys = new Set(["modelName", "modelHash"]);
      const vaeKeys = new Set(["vaeName", "vaeHash"]);
      if (!checkpointKeys.has(key) && !vaeKeys.has(key)) return;
      const role = checkpointKeys.has(key) ? "checkpoint" : "vae";
      let resource = record.resources.find((item) => item.role === role && !item.removed);
      if (!resource) {
        resource = Studio.canonical.normalizeResource({
          name: role === "checkpoint" ? "Primary model" : "VAE",
          role,
          type: role === "checkpoint" ? "Checkpoint" : "VAE",
          identitySource: "manual"
        }, "manual");
        record.resources.push(resource);
      }
      const nameKey = role === "checkpoint" ? "modelName" : "vaeName";
      const hashKey = role === "checkpoint" ? "modelHash" : "vaeHash";
      if (key === nameKey) resource.name = sanitizeText(record.fields[key].value || resource.name);
      if (key === hashKey) {
        const hash = normalizeHash(record.fields[key].value);
        resource.hashes = hash
          ? { ...resource.hashes, [hash.length === 64 ? "SHA256" : hash.length === 10 ? "AutoV2" : "hash"]: hash }
          : {};
      }
      resource.identitySource = "manual";
      resource.verification = "unresolved";
    }

    updateMetadataSelection(id, preserve) {
      if (!this.current || !(id in this.current.metadataSelections)) return;
      this.current.metadataSelections[id] = Boolean(preserve);
      this.current.dirty = true;
      this.emit();
    }

    addResource() {
      const record = this.current;
      if (!record) return null;
      const resource = Studio.canonical.normalizeResource({
        name: "New resource",
        role: "other",
        type: "Other",
        identitySource: "manual",
        verification: "unresolved"
      }, "manual");
      record.resources.push(resource);
      record.dirty = true;
      this.emit();
      return resource;
    }

    discardResource(key, restoreDirty = false) {
      const record = this.current;
      const index = record?.resources.findIndex((resource) => resource.key === key) ?? -1;
      if (!record || index < 0) return false;
      record.resources.splice(index, 1);
      record.dirty = Boolean(restoreDirty);
      this.emit();
      return true;
    }

    updateResource(key, data) {
      const record = this.current;
      const resource = record?.resources.find((item) => item.key === key);
      if (!resource) return null;
      const parsedAir = Studio.air.parseAir(data.rawAir || data.canonicalAir || "");
      resource.name = sanitizeText(data.name || "Unidentified resource", 512);
      resource.role = sanitizeText(data.role || "other", 80);
      resource.type = sanitizeText(data.type || "Other", 80);
      resource.versionName = sanitizeText(data.versionName || "", 512);
      resource.baseModel = sanitizeText(data.baseModel || "", 160);
      resource.rawAir = parsedAir.rawAir;
      resource.canonicalAir = parsedAir.canonicalAir;
      resource.airWarning = parsedAir.warning || "";
      resource.modelId = Studio.util.positiveIdOrNull(data.modelId);
      resource.modelVersionId = Studio.util.positiveIdOrNull(data.modelVersionId);
      resource.fileId = Studio.util.positiveIdOrNull(data.fileId ?? parsedAir.fileId);
      resource.format = resource.format || parsedAir.format || "";
      resource.weight = numberOrNull(data.weight);
      resource.hashes = Object.fromEntries(
        Object.entries(data.hashes || {})
          .map(([algorithm, value]) => [algorithm, normalizeHash(value)])
          .filter(([, value]) => value)
      );
      const civitaiUrl = Studio.air.parseCivitaiUrl(data.sourceUrl);
      resource.sourceUrl = sanitizeText(data.sourceUrl || "", 2048);
      if (resource.sourceUrl && !civitaiUrl) {
        resource.verificationMessage = "The model URL is not a recognized Civitai model URL.";
      }
      if (civitaiUrl) {
        resource.modelId ||= civitaiUrl.modelId;
        resource.modelVersionId ||= civitaiUrl.modelVersionId;
      }
      if (parsedAir.valid && parsedAir.source === "civitai") {
        resource.modelId ||= parsedAir.id;
        resource.modelVersionId ||= parsedAir.version;
      }
      resource.identitySource = "manual";
      resource.verification = "unresolved";
      if (!resource.verificationMessage?.includes("not a recognized")) resource.verificationMessage = "";
      resource.apiCandidate = null;
      resource.lookupDiagnostics = null;
      const projection = Studio.civitaiContract.parserResourceDecision(resource);
      resource.identityScope = projection.identityScope;
      resource.parserFacing = projection.parserFacing;
      resource.parserExclusionReason = projection.reason;
      record.dirty = true;
      this.syncFieldsFromEditedResource(record, resource);
      this.emit();
      return resource;
    }

    syncFieldsFromEditedResource(record, resource) {
      const mapping = resource.role === "checkpoint"
        ? { name: "modelName", hash: "modelHash" }
        : resource.role === "vae"
          ? { name: "vaeName", hash: "vaeHash" }
          : null;
      if (!mapping) return;
      Studio.canonical.setField(record, mapping.name, resource.name);
      const hash = strongestHash(resource.hashes);
      if (hash) Studio.canonical.setField(record, mapping.hash, hash);
    }

    removeResource(key) {
      const resource = this.current?.resources.find((item) => item.key === key);
      if (!resource) return;
      resource.removed = true;
      this.current.dirty = true;
      this.emit();
    }

    useConflictValue(conflictId, optionIndex) {
      const record = this.current;
      const conflict = record?.conflicts.find((item) => item.id === conflictId);
      const option = conflict?.alternatives[Number(optionIndex)];
      if (!conflict || !option) return;
      Studio.canonical.setField(record, conflict.field, option.value);
      conflict.resolved = true;
      this.emit();
    }

    async hashResourceFile(key, file, onProgress) {
      const record = this.current;
      const resource = record?.resources.find((item) => item.key === key);
      if (!resource || !(file instanceof File)) return null;
      resource.verification = "hashing";
      resource.verificationMessage = "Hashing local model file…";
      this.emit();
      const hashes = await Studio.sha256.hashModelFile(file, {
        onProgress: (processed, total) => {
          resource.verificationMessage = `Hashing ${Math.round(processed / Math.max(1, total) * 100)}%`;
          onProgress?.(processed, total);
          this.emit();
        }
      });
      resource.hashes = { ...resource.hashes, ...hashes };
      resource.filename ||= Studio.util.basename(file.name);
      resource.verification = "unresolved";
      resource.verificationMessage = "Local hash complete. Ready for Civitai verification.";
      record.dirty = true;
      this.emit();
      return hashes;
    }

    async verifyEntry(entry, automatic = false) {
      if (!entry?.record || entry.state === "verifying" || !this.entries.includes(entry)) return;
      this.verificationController?.abort();
      const controller = new AbortController();
      this.verificationController = controller;
      this.verificationEntry = entry;
      this.verificationEntries = new Set([entry]);
      entry.state = "verifying";
      this.emit();
      try {
        await Studio.civitai.verifyRecord(entry.record, {
          signal: controller.signal,
          onProgress: () => this.emit()
        });
        if (!this.entries.includes(entry)) return;
        this.importMissingPrimaryFields(entry.record);
        entry.state = "ready";
        this.emit();
        if (!automatic) {
          const status = entry.record.verification;
          this.announce(
            status.verified
              ? `Verified ${status.verified} resource${status.verified === 1 ? "" : "s"} with exact Civitai evidence.`
              : "No resources could be positively identified yet.",
            status.errors.length ? "warning" : "success"
          );
        }
      } catch (error) {
        if (!this.entries.includes(entry)) return;
        if (error.name === "AbortError") {
          entry.state = "ready";
        } else {
          entry.state = "ready";
          entry.record.verification.status = "warning";
          entry.record.verification.errors.push(error.message);
          if (!automatic) this.announce(error.message, "error");
        }
        this.emit();
      } finally {
        if (this.verificationController === controller) {
          this.verificationController = null;
          this.verificationEntry = null;
          this.verificationEntries.clear();
        }
      }
    }

    async verifyEntries(entries, automatic = false) {
      const candidates = [...new Set(entries)].filter((entry) =>
        entry?.record
        && entry.state !== "verifying"
        && this.entries.includes(entry)
      );
      if (!candidates.length) return;
      if (candidates.length === 1) {
        await this.verifyEntry(candidates[0], automatic);
        return;
      }

      this.verificationController?.abort();
      const controller = new AbortController();
      this.verificationController = controller;
      this.verificationEntry = null;
      this.verificationEntries = new Set(candidates);
      for (const entry of candidates) entry.state = "verifying";
      this.emit();

      const sharedMetrics = {
        networkCalls: 0,
        batchCalls: 0,
        cacheHits: 0,
        coalesced: 0,
        batchFallbacks: 0
      };
      const sharedBatch = {
        images: candidates.length,
        ...sharedMetrics
      };
      try {
        const resources = candidates.flatMap((entry) =>
          entry.record.resources.filter((resource) => !resource.removed)
        );
        await Studio.civitai.prefetchResources(resources, {
          signal: controller.signal,
          metrics: sharedMetrics
        });
        Object.assign(sharedBatch, sharedMetrics);

        for (const entry of candidates) {
          if (controller.signal.aborted) throw new DOMException("Verification was cancelled.", "AbortError");
          if (!this.entries.includes(entry)) continue;
          await Studio.civitai.verifyRecord(entry.record, {
            signal: controller.signal,
            skipPrefetch: true,
            sharedBatch,
            onProgress: () => this.emit()
          });
          for (const key of ["networkCalls", "batchCalls", "cacheHits", "coalesced", "batchFallbacks"]) {
            sharedBatch[key] += Number(entry.record.verification[key] || 0);
          }
          if (!this.entries.includes(entry)) continue;
          this.importMissingPrimaryFields(entry.record);
          entry.state = "ready";
          this.emit();
        }

        if (!automatic) {
          const verified = candidates.reduce((sum, entry) => sum + Number(entry.record.verification.verified || 0), 0);
          this.announce(
            `Verified ${verified} resource${verified === 1 ? "" : "s"} across ${candidates.length} images with ${sharedBatch.networkCalls} API request${sharedBatch.networkCalls === 1 ? "" : "s"}.`,
            "success"
          );
        }
      } catch (error) {
        for (const entry of candidates) {
          if (this.entries.includes(entry) && entry.state === "verifying") entry.state = "ready";
        }
        if (error.name !== "AbortError" && !automatic) this.announce(error.message, "error");
        this.emit();
      } finally {
        if (this.verificationController === controller) {
          this.verificationController = null;
          this.verificationEntry = null;
          this.verificationEntries.clear();
        }
      }
    }

    async verifyCurrent() {
      if (this.currentEntry) await this.verifyEntry(this.currentEntry, false);
    }

    async importCivitaiImage(value) {
      const record = this.current;
      if (!record) throw new Error("Open an image before importing Civitai image metadata.");
      const remote = await Studio.civitai.lookupImage(value);
      let importedFields = 0;
      let matchingFields = 0;
      let fieldConflicts = 0;
      for (const [key, rawValue] of Object.entries(remote.fields || {})) {
        const outcome = Studio.canonical.addFieldEvidence(
          record,
          key,
          this.parseField(key, rawValue),
          "civitai_image",
          `${remote.evidence} public metadata`,
          "api_reported"
        );
        if (outcome.status === "imported") importedFields += 1;
        else if (outcome.status === "matched") matchingFields += 1;
        else if (outcome.status === "conflict") fieldConflicts += 1;
      }

      const incoming = (remote.resources || [])
        .map((resource) => Studio.canonical.normalizeResource({
          ...resource,
          identitySource: "civitai_image",
          verification: "claimed",
          evidence: `${remote.evidence} public resource metadata`
        }, "civitai_image"))
        .filter(Boolean);
      const beforeKeys = new Set(record.resources.map((resource) => resource.key));
      record.resources = Studio.canonical.mergeResources([...record.resources, ...incoming]);
      const importedResources = record.resources.filter((resource) => !beforeKeys.has(resource.key)).length;
      record.civitaiImports ||= [];
      if (!record.civitaiImports.some((item) => item.imageId === remote.imageId)) {
        record.civitaiImports.push({
          imageId: remote.imageId,
          sourceUrl: remote.sourceUrl,
          importedAt: new Date().toISOString()
        });
      }
      if (importedFields || fieldConflicts || incoming.length) record.dirty = true;
      this.announce(
        `Read Civitai image ${remote.imageId}: ${importedFields} missing field${importedFields === 1 ? "" : "s"} imported, ${matchingFields} confirmed, ${fieldConflicts} difference${fieldConflicts === 1 ? "" : "s"} queued for review, and ${incoming.length} resource claim${incoming.length === 1 ? "" : "s"} found.`,
        fieldConflicts ? "warning" : "success"
      );
      if (this.autoVerify && incoming.length) await this.verifyCurrent();
      return {
        imageId: remote.imageId,
        importedFields,
        matchingFields,
        fieldConflicts,
        importedResources,
        resourceClaims: incoming.length
      };
    }

    importMissingPrimaryFields(record) {
      const apply = (role, nameKey, hashKey) => {
        const resource = record.resources.find((item) => item.role === role && item.verification === "verified" && !item.removed);
        if (!resource) return;
        if (!record.fields[nameKey].value && resource.name) {
          record.fields[nameKey] = {
            value: resource.name,
            source: "api_exact",
            evidence: resource.verificationMessage,
            confidence: "verified",
            edited: false
          };
        }
        const hash = strongestHash(resource.hashes);
        if (!record.fields[hashKey].value && hash) {
          record.fields[hashKey] = {
            value: hash,
            source: "api_exact",
            evidence: resource.verificationMessage,
            confidence: "verified",
            edited: false
          };
        }
      };
      apply("checkpoint", "modelName", "modelHash");
      apply("vae", "vaeName", "vaeHash");
    }

    resetCurrent() {
      if (!this.current) return;
      Studio.canonical.reset(this.current);
      this.announce("Edits for the current image were reset.", "info");
    }

    identityDocument() {
      const resources = [];
      for (const entry of this.entries) {
        for (const resource of entry.record?.resources || []) {
          if (resource.removed) continue;
          resources.push({
            name: resource.name,
            filename: resource.filename || undefined,
            role: resource.role,
            type: resource.type,
            canonicalAir: resource.canonicalAir || undefined,
            rawAir: resource.rawAir || undefined,
            modelId: resource.modelId || undefined,
            modelVersionId: resource.modelVersionId || undefined,
            fileId: resource.fileId || undefined,
            fileType: resource.fileType || undefined,
            filePrimary: typeof resource.filePrimary === "boolean" ? resource.filePrimary : undefined,
            format: resource.format || undefined,
            hashes: Object.keys(resource.hashes || {}).length ? resource.hashes : undefined,
            identitySource: resource.identitySource,
            verification: resource.verification
          });
        }
      }
      return {
        schema: "civitai-metadata-studio.identity-cache",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        resources: Studio.canonical.mergeResources(resources)
          .map((resource) => {
            const clean = { ...resource };
            delete clean.key;
            delete clean.sourceUrl;
            delete clean.creator;
            delete clean.license;
            delete clean.trainedWords;
            delete clean.apiCandidate;
            delete clean.verificationMessage;
            delete clean.removed;
            return clean;
          })
      };
    }

    exportIdentities() {
      const blob = new Blob([stableStringify(this.identityDocument())], { type: "application/json" });
      Studio.util.downloadBlob(blob, "civitai-metadata-identities.json");
    }

    async importIdentities(file) {
      if (!(file instanceof File)) return;
      if (file.size > 4 * 1024 * 1024) throw new Error("Identity import exceeds the 4 MiB safety limit.");
      const document = safeJsonParse(await file.text());
      if (document?.schema !== "civitai-metadata-studio.identity-cache" || !Array.isArray(document.resources)) {
        throw new Error("This is not a Civitai Metadata Studio identity export.");
      }
      const record = this.current;
      if (!record) throw new Error("Open an image before importing identity data.");
      let imported = 0;
      for (const raw of document.resources.slice(0, 5000)) {
        const candidate = Studio.canonical.normalizeResource({ ...raw, verification: "claimed", identitySource: "imported" }, "imported");
        const match = record.resources.find((resource) => {
          if (candidate.modelVersionId && resource.modelVersionId === candidate.modelVersionId) return true;
          const candidateHashes = new Set(Object.values(candidate.hashes || {}));
          if (Object.values(resource.hashes || {}).some((hash) => candidateHashes.has(hash))) return true;
          return resource.role === candidate.role && resource.name.toLowerCase() === candidate.name.toLowerCase();
        });
        if (!match) {
          record.resources.push(candidate);
          imported += 1;
          continue;
        }
        for (const key of [
          "modelId",
          "modelVersionId",
          "fileId",
          "fileType",
          "filePrimary",
          "format",
          "canonicalAir",
          "rawAir",
          "versionName",
          "baseModel"
        ]) {
          if (!match[key] && candidate[key]) match[key] = candidate[key];
          else if (match[key] && candidate[key] && !sameValue(match[key], candidate[key])) {
            match.verification = "conflict";
            match.verificationMessage = `Imported ${key} conflicts with the existing value.`;
            match.apiCandidate = candidate;
          }
        }
        match.hashes = { ...candidate.hashes, ...match.hashes };
        imported += 1;
      }
      record.dirty = true;
      this.announce(`Imported identity evidence for ${imported} resource${imported === 1 ? "" : "s"}. Exact values will be rechecked with Civitai.`, "success");
      if (this.autoVerify) await this.verifyCurrent();
    }

    exportReport() {
      const record = this.current;
      if (!record) return;
      const report = {
        schema: "civitai-metadata-studio.audit-report",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        image: {
          filename: record.fileName,
          format: record.format,
          bytes: record.size,
          width: record.dimensions.width,
          height: record.dimensions.height,
          animated: record.inspection.animated,
          pixelDataReencoded: false
        },
        manifest: Studio.canonical.buildManifest(record),
        changes: Studio.canonical.diff(record),
        conflicts: record.conflicts,
        warnings: record.warnings,
        civitaiImports: record.civitaiImports || [],
        preservedMetadata: record.inspection.metadataItems
          .filter((item) => record.metadataSelections[item.id])
          .map(({ id, carrier, label, category }) => ({ id, carrier, label, category }))
      };
      Studio.util.downloadBlob(
        new Blob([stableStringify(report)], { type: "application/json" }),
        `${Studio.util.withoutExtension(record.fileName)}-metadata-report.json`
      );
    }

    async save(suffix, onProgress) {
      if (this.entries.some((entry) => ["queued", "inspecting", "verifying"].includes(entry.state))) {
        throw new Error("Wait for inspection and verification to finish before saving.");
      }
      const ready = this.entries.filter((entry) => entry.record && entry.state !== "error");
      if (!ready.length) throw new Error("There are no inspected images to save.");
      const invalid = ready.flatMap((entry) =>
        Studio.canonical.validate(entry.record).map((message) => `${entry.record.fileName}: ${message}`)
      );
      if (invalid.length) throw new Error(`Review invalid fields before saving. ${invalid.join(" ")}`);
      this.busy = true;
      this.emit();
      try {
        const outputs = [];
        for (let index = 0; index < ready.length; index += 1) {
          const entry = ready[index];
          onProgress?.(`Preparing ${entry.record.fileName}`, index, ready.length);
          const blob = Studio.canonical.rewrite(entry.record);
          const formatExtension = { png: "png", jpeg: "jpg", webp: "webp" }[entry.record.format];
          const baseOutputName = `${Studio.util.withoutExtension(entry.record.fileName)}.${formatExtension}`;
          outputs.push({
            name: Studio.util.outputName(baseOutputName, suffix),
            blob,
            date: new Date(entry.file.lastModified || Date.now())
          });
          await Studio.util.yieldToBrowser();
        }
        if (outputs.length === 1) {
          Studio.util.downloadBlob(outputs[0].blob, outputs[0].name);
          this.announce(`Saved a new ${outputs[0].name} copy. The original was not changed.`, "success");
          return { count: 1, filename: outputs[0].name };
        }
        onProgress?.("Building ZIP archive", outputs.length, outputs.length);
        const zip = await Studio.zip.build(outputs, {
          onProgress: (processed, total) => onProgress?.(`Building ZIP · ${Math.round(processed / Math.max(1, total) * 100)}%`, outputs.length, outputs.length)
        });
        const filename = `civitai-metadata-edited-${new Date().toISOString().slice(0, 10)}.zip`;
        Studio.util.downloadBlob(zip, filename);
        this.announce(`Saved ${outputs.length} new image copies in ${filename}. Originals were not changed.`, "success");
        return { count: outputs.length, filename };
      } finally {
        this.busy = false;
        this.emit();
      }
    }
  }

  Studio.state = new AppState();
  Studio.AppState = AppState;
})();
