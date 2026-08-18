(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};
  const { createElement: el, formatBytes, formatDimensions, limitPreview, sanitizeText, selectHash } = Studio.util;

  const SOURCE_LABELS = Object.freeze({
    manual: "Manual edit",
    api_exact: "Civitai exact verification",
    civitai_image: "Civitai image import",
    civitai_manifest: "Structured Civitai metadata",
    exif: "EXIF UserComment",
    a1111: "A1111 parameters",
    comfy_active: "Active ComfyUI graph",
    image_header: "Image header",
    filename: "Filename candidate",
    unknown: "Not detected"
  });

  function replace(target, children) {
    target.replaceChildren(...(Array.isArray(children) ? children : [children]).filter(Boolean));
  }

  function empty(message) {
    return el("p", { className: "empty-state", text: message });
  }

  function badge(text, tone = "neutral") {
    return el("span", { className: `badge ${tone}`, text });
  }

  function valueText(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") return Studio.util.stableStringify(value, 0);
    return String(value);
  }

  class AppUI {
    constructor(state) {
      this.state = state;
      this.previewUrl = "";
      this.previewFile = null;
      this.resourceKey = null;
      this.resourceIsNew = false;
      this.resourceWasDirty = false;
      this.candidates = [];
      this.activeSection = "generationSection";
      this.workspaceActive = Boolean(state.entries.length);
      this.workspaceFocusPending = false;
      this.nodes = Object.fromEntries(
        [...document.querySelectorAll("[id]")].map((node) => [node.id, node])
      );
      this.bind();
      state.addEventListener("change", () => this.render());
      this.render();
    }

    bind() {
      const n = this.nodes;
      const openPicker = () => n.fileInput.click();
      n.openButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openPicker();
      });
      n.addImagesButton.addEventListener("click", openPicker);
      n.headerAddImagesButton.addEventListener("click", openPicker);
      n.headerClearQueueButton.addEventListener("click", () => this.state.clearEntries());
      n.fileInput.addEventListener("change", async () => {
        const files = [...n.fileInput.files];
        const opensWorkspace = this.state.entries.length === 0 && files.length > 0;
        n.fileInput.value = "";
        await this.state.addFiles(files);
        if (opensWorkspace && this.state.entries.length) {
          this.workspaceFocusPending = false;
          this.focusWorkspaceStart(true);
        }
      });
      n.dropZone.addEventListener("click", (event) => {
        if (event.target !== n.openButton) openPicker();
      });
      n.dropZone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPicker();
        }
      });
      for (const eventName of ["dragenter", "dragover"]) {
        n.dropZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          n.dropZone.dataset.dragging = "true";
        });
      }
      for (const eventName of ["dragleave", "drop"]) {
        n.dropZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          n.dropZone.dataset.dragging = "false";
        });
      }
      n.dropZone.addEventListener("drop", async (event) => {
        const opensWorkspace = this.state.entries.length === 0 && event.dataTransfer.files.length > 0;
        await this.state.addFiles(event.dataTransfer.files);
        if (opensWorkspace && this.state.entries.length) {
          this.workspaceFocusPending = false;
          this.focusWorkspaceStart(true);
        }
      });
      n.autoVerify.addEventListener("change", () => this.state.setAutoVerify(n.autoVerify.checked));
      const sectionTabs = [...document.querySelectorAll("[data-section-target]")];
      for (const [index, tab] of sectionTabs.entries()) {
        tab.addEventListener("click", () => this.selectEditorSection(tab.dataset.sectionTarget));
        tab.addEventListener("keydown", (event) => {
          const keyOffsets = { ArrowLeft: -1, ArrowRight: 1 };
          let nextIndex = null;
          if (event.key in keyOffsets) {
            nextIndex = (index + keyOffsets[event.key] + sectionTabs.length) % sectionTabs.length;
          } else if (event.key === "Home") {
            nextIndex = 0;
          } else if (event.key === "End") {
            nextIndex = sectionTabs.length - 1;
          }
          if (nextIndex === null) return;
          event.preventDefault();
          const next = sectionTabs[nextIndex];
          this.selectEditorSection(next.dataset.sectionTarget, { focusTab: true });
        });
      }
      n.verifyButton.addEventListener("click", () => this.state.verifyCurrent());
      n.resetButton.addEventListener("click", () => this.state.resetCurrent());
      n.importCivitaiImageButton.addEventListener("click", () => {
        n.civitaiImageInput.value = "";
        n.imageLookupStatus.textContent = "Ready to look up public metadata.";
        n.submitImageLookupButton.disabled = false;
        n.imageLookupDialog.showModal();
        n.civitaiImageInput.focus();
      });
      const closeImageLookup = () => n.imageLookupDialog.close();
      n.closeImageLookupDialog.addEventListener("click", closeImageLookup);
      n.cancelImageLookupButton.addEventListener("click", closeImageLookup);
      n.imageLookupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        n.submitImageLookupButton.disabled = true;
        n.imageLookupStatus.textContent = "Looking up the exact public image ID…";
        try {
          const result = await this.state.importCivitaiImage(n.civitaiImageInput.value);
          n.imageLookupStatus.textContent = `Image ${result.imageId} imported. Differences are ready in Review.`;
          n.imageLookupDialog.close();
          this.selectEditorSection("reviewSection", { focusPanel: true });
        } catch (error) {
          n.imageLookupStatus.textContent = error.message;
        } finally {
          n.submitImageLookupButton.disabled = false;
        }
      });
      n.fileQueue.addEventListener("click", (event) => {
        const removeButton = event.target.closest("button[data-remove-index]");
        if (removeButton) {
          this.state.removeEntry(removeButton.dataset.removeIndex);
          return;
        }
        const button = event.target.closest("button[data-index]");
        if (button) this.state.select(button.dataset.index);
      });
      n.clearQueueButton.addEventListener("click", () => this.state.clearEntries());
      n.generationForm.addEventListener("input", (event) => {
        const input = event.target.closest("[name]");
        if (input) this.state.updateField(input.name, input.value);
      });
      n.otherMetadataList.addEventListener("change", (event) => {
        const input = event.target.closest("input[data-metadata-id]");
        if (input) this.state.updateMetadataSelection(input.dataset.metadataId, input.checked);
      });
      n.resourcesList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-resource-key]");
        if (button) this.openResource(button.dataset.resourceKey);
      });
      n.addResourceButton.addEventListener("click", () => {
        const wasDirty = Boolean(this.state.current?.dirty);
        const resource = this.state.addResource();
        if (resource) this.openResource(resource.key, true, wasDirty);
      });
      n.conflictList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-conflict-id]");
        if (button) this.state.useConflictValue(button.dataset.conflictId, button.dataset.optionIndex);
      });
      n.rawCarrierSelect.addEventListener("change", () => this.renderRaw());
      n.copyRawButton.addEventListener("click", () => this.copyRaw());
      n.exportReportButton.addEventListener("click", () => this.state.exportReport());
      n.exportIdentityButton.addEventListener("click", () => this.state.exportIdentities());
      n.importIdentityButton.addEventListener("click", () => n.identityImportInput.click());
      n.cacheButton.addEventListener("click", () => this.openCacheDialog());
      n.closeCacheDialog.addEventListener("click", () => n.cacheDialog.close());
      n.doneCacheButton.addEventListener("click", () => n.cacheDialog.close());
      n.clearCacheButton.addEventListener("click", () => this.clearModelCache());
      n.identityImportInput.addEventListener("change", async () => {
        const [file] = n.identityImportInput.files;
        n.identityImportInput.value = "";
        try {
          if (file) await this.state.importIdentities(file);
        } catch (error) {
          this.state.announce(error.message, "error");
        }
      });
      n.saveButton.addEventListener("click", async () => {
        try {
          await this.state.save(n.outputSuffix.value, (message) => {
            n.outputSummary.textContent = message;
          });
        } catch (error) {
          this.state.announce(error.message, "error");
        }
      });
      n.themeButton.addEventListener("click", () => this.toggleTheme());
      n.closeResourceDialog.addEventListener("click", () => n.resourceDialog.close("cancel"));
      n.saveResourceButton.addEventListener("click", () => {
        this.applyResourceForm();
        n.resourceDialog.close("save");
      });
      n.removeResourceButton.addEventListener("click", () => {
        if (this.resourceKey) this.state.removeResource(this.resourceKey);
        n.resourceDialog.close("remove");
      });
      n.searchResourceButton.addEventListener("click", () => this.searchResource());
      n.resourceModelFile.addEventListener("change", async () => {
        const [file] = n.resourceModelFile.files;
        if (!file || !this.resourceKey) return;
        try {
          this.applyResourceForm(false);
          const hashes = await this.state.hashResourceFile(this.resourceKey, file);
          n.resourceSha256.value = hashes.SHA256 || "";
          n.resourceAutoV3.value = hashes.AutoV3 || "";
          n.resourceAutoV2.value = hashes.AutoV2 || "";
          n.resourceCrc32.value = hashes.CRC32 || "";
          n.resourceAutoV1.value = hashes.AutoV1 || "";
          n.resourceDialogStatus.textContent = "Exact SHA-256 complete. Checking Civitai…";
          await this.state.verifyCurrent();
          this.refreshOpenResource();
        } catch (error) {
          n.resourceDialogStatus.textContent = error.message;
        } finally {
          n.resourceModelFile.value = "";
        }
      });
      n.resourceCandidateList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-candidate-index][data-version-index]");
        if (!button) return;
        const candidate = this.candidates[Number(button.dataset.candidateIndex)];
        const version = candidate?.versions[Number(button.dataset.versionIndex)];
        if (!candidate || !version) return;
        n.resourceName.value = candidate.name;
        n.resourceType.value = this.closestResourceType(candidate.type);
        n.resourceModelId.value = candidate.modelId || "";
        n.resourceVersionId.value = version.modelVersionId || "";
        n.resourceVersionName.value = version.versionName || "";
        n.resourceBaseModel.value = version.baseModel || "";
        n.resourceFileId.value = version.fileId || "";
        n.resourceUrl.value = version.sourceUrl || "";
        n.resourceSha256.value = version.hashes?.SHA256 || "";
        n.resourceBlake3.value = version.hashes?.BLAKE3 || "";
        n.resourceAutoV3.value = version.hashes?.AutoV3 || "";
        n.resourceAutoV2.value = version.hashes?.AutoV2 || "";
        n.resourceCrc32.value = version.hashes?.CRC32 || "";
        n.resourceAutoV1.value = version.hashes?.AutoV1 || "";
        n.resourceDialogStatus.textContent = "Candidate selected. Apply it to verify the exact version ID and any hash evidence.";
        replace(n.resourceCandidateList, []);
      });
      n.resourceDialog.addEventListener("close", () => {
        const discardKey = this.resourceIsNew && n.resourceDialog.returnValue !== "save"
          ? this.resourceKey
          : null;
        const restoreDirty = this.resourceWasDirty;
        this.resourceKey = null;
        this.resourceIsNew = false;
        this.resourceWasDirty = false;
        this.candidates = [];
        replace(n.resourceCandidateList, []);
        if (discardKey) this.state.discardResource(discardKey, restoreDirty);
      });
      addEventListener("beforeunload", () => {
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      });
    }

    focusWorkspaceStart(hasEntries) {
      requestAnimationFrame(() => {
        const focusTarget = hasEntries ? this.nodes.statusTitle : this.nodes.heroTitle;
        scrollTo({ top: 0, left: 0, behavior: "instant" });
        if (hasEntries) {
          this.nodes.main.scrollTop = 0;
          this.nodes.workspace.querySelector(".rail").scrollTop = 0;
          this.nodes.workspace.querySelector(".editor-column").scrollTop = 0;
        }
        focusTarget.focus({ preventScroll: true });
      });
    }

    selectEditorSection(sectionId, { focusTab = false, focusPanel = false } = {}) {
      const sections = [...document.querySelectorAll(".editor-section[role='tabpanel']")];
      const tabs = [...document.querySelectorAll("[data-section-target]")];
      if (!sections.some((section) => section.id === sectionId)) return;
      this.activeSection = sectionId;
      for (const section of sections) section.hidden = section.id !== sectionId;
      for (const tab of tabs) {
        const selected = tab.dataset.sectionTarget === sectionId;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focusTab) tab.focus();
      }
      if (focusPanel) document.getElementById(sectionId)?.focus();
    }

    render() {
      const entry = this.state.currentEntry;
      const record = this.state.current;
      const hasEntries = this.state.entries.length > 0;
      const workspaceChanged = hasEntries !== this.workspaceActive;
      document.body.classList.toggle("working-state", hasEntries);
      this.nodes.autoVerify.checked = this.state.autoVerify;
      this.nodes.headerAddImagesButton.hidden = !hasEntries;
      this.nodes.headerClearQueueButton.hidden = !hasEntries;
      this.nodes.headerClearQueueButton.disabled = this.state.busy || !hasEntries;
      this.nodes.workspace.hidden = !hasEntries;
      this.nodes.saveBar.hidden = !hasEntries;
      this.nodes.clearQueueButton.disabled = this.state.busy || !hasEntries;
      if (workspaceChanged) {
        this.workspaceActive = hasEntries;
        this.workspaceFocusPending = hasEntries;
        this.focusWorkspaceStart(hasEntries);
      }
      if (hasEntries && this.workspaceFocusPending && record) {
        this.workspaceFocusPending = false;
        this.focusWorkspaceStart(true);
      } else if (!hasEntries) {
        this.workspaceFocusPending = false;
      }
      this.renderQueue();
      this.renderNotice();
      if (!entry || !record) {
        if (!entry) this.clearPreview();
        this.renderPending(entry);
        return;
      }
      this.renderPreview(record);
      this.renderStatus(record, entry);
      this.renderGeneration(record);
      this.renderResources(record);
      this.renderMetadata(record);
      this.renderReview(record);
      this.nodes.saveButton.disabled = this.state.busy
        || this.state.entries.some((item) => ["queued", "inspecting", "verifying"].includes(item.state));
      this.nodes.verifyButton.disabled = entry.state === "verifying";
      this.nodes.resetButton.disabled = this.state.busy;
      this.nodes.outputSummary.textContent = this.state.busy
        ? this.nodes.outputSummary.textContent
        : `${this.state.entries.filter((item) => item.record).length} new ${this.state.entries.filter((item) => item.record).length === 1 ? "copy" : "copies"} · original pixels retained`;
    }

    renderPending(entry) {
      this.nodes.currentFileName.textContent = entry ? Studio.util.basename(entry.file.name) : "No image selected";
      this.nodes.fileFormatBadge.textContent = entry?.state === "error" ? "Error" : entry ? "Reading" : "—";
      this.nodes.statusTitle.textContent = entry?.state === "error"
        ? "This image could not be opened"
        : entry
          ? "Inspecting metadata…"
          : "Open an image to begin";
      this.nodes.statusSummary.textContent = entry?.error
        || (entry
          ? "Reading bounded metadata ranges without decoding the image pixels."
          : "Images remain local until you explicitly verify model identities with Civitai.");
      this.nodes.saveButton.disabled = true;
      this.nodes.verifyButton.disabled = true;
      this.nodes.resetButton.disabled = true;
      replace(this.nodes.resourcesList, empty("Resources will appear after inspection."));
      replace(this.nodes.otherMetadataList, empty("Other metadata will appear after inspection."));
      replace(this.nodes.diffList, []);
      replace(this.nodes.conflictList, []);
    }

    clearPreview() {
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = "";
      this.previewFile = null;
      this.nodes.previewImage.removeAttribute("src");
      this.nodes.previewImage.alt = "";
      this.nodes.previewImage.hidden = true;
      this.nodes.previewFallback.hidden = false;
      this.nodes.previewFallback.querySelector("p").textContent = "Preview will appear here";
      replace(this.nodes.fileFacts, []);
    }

    renderQueue() {
      this.nodes.queueCount.textContent = String(this.state.entries.length);
      replace(this.nodes.fileQueue, this.state.entries.map((entry, index) => {
        const stateText = {
          queued: "Queued",
          inspecting: "Inspecting",
          verifying: "Verifying",
          ready: entry.record?.verification?.status === "verified" ? "Verified" : "Ready",
          error: "Error"
        }[entry.state] || entry.state;
        const name = Studio.util.basename(entry.file.name);
        return el("li", { className: "queue-row" }, [
          el("button", {
            type: "button",
            className: "queue-item",
            dataset: { index },
            attributes: { "aria-current": index === this.state.currentIndex ? "true" : "false" }
          }, [
            el("span", { className: "queue-item-name", text: name }),
            el("span", { className: "queue-state", text: stateText })
          ]),
          el("button", {
            type: "button",
            className: "queue-remove",
            text: "×",
            title: `Remove ${name} from queue`,
            dataset: { removeIndex: index },
            attributes: { "aria-label": `Remove ${name} from queue` }
          })
        ]);
      }));
    }

    renderNotice() {
      const notice = this.state.notice;
      if (!notice) {
        replace(this.nodes.alertRegion, []);
        return;
      }
      replace(this.nodes.alertRegion, el("div", {
        className: "alert-message",
        dataset: { tone: notice.tone },
        text: notice.message
      }));
      this.nodes.statusAnnouncer.textContent = notice.message;
    }

    renderPreview(record) {
      this.nodes.currentFileName.textContent = record.fileName;
      this.nodes.fileFormatBadge.textContent = record.format.toUpperCase();
      this.nodes.fileFormatBadge.className = "badge neutral";
      if (this.previewFile !== record.file) {
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
        this.previewUrl = URL.createObjectURL(record.file);
        this.previewFile = record.file;
        this.nodes.previewImage.hidden = false;
        this.nodes.previewFallback.hidden = true;
        this.nodes.previewImage.alt = `Preview of ${record.fileName}`;
        this.nodes.previewImage.src = this.previewUrl;
        this.nodes.previewImage.onerror = () => {
          this.nodes.previewImage.hidden = true;
          this.nodes.previewFallback.hidden = false;
          this.nodes.previewFallback.querySelector("p").textContent = "Preview unavailable; metadata editing and lossless export still work.";
        };
      }
      const facts = [
        ["Dimensions", formatDimensions(record.inspection.width, record.inspection.height)],
        ["File size", formatBytes(record.size)],
        ["Pixels", record.inspection.width && record.inspection.height ? (record.inspection.width * record.inspection.height).toLocaleString() : "Unknown"],
        ["Animation", record.inspection.animated ? "Preserved" : "Still image"],
        ["Alpha", record.inspection.hasAlpha ? "Present" : "Not reported"]
      ];
      replace(this.nodes.fileFacts, facts.flatMap(([label, value]) => [
        el("dt", { text: label }),
        el("dd", { text: value })
      ]));
    }

    renderStatus(record, entry) {
      const verification = record.verification;
      const validationErrors = Studio.canonical.validate(record);
      const unresolvedConflicts = record.conflicts.filter((conflict) => !conflict.resolved).length
        + record.resources.filter((resource) => resource.verification === "conflict" && !resource.removed).length;
      const statuses = {
        checking: ["Verifying exact identity…", `Checked ${verification.checked} of ${record.resources.filter((item) => !item.removed).length} resources.`],
        verified: ["Verified with Civitai", `${verification.verified} resource${verification.verified === 1 ? "" : "s"} matched exact API evidence.`],
        partial: ["Partially verified", `${verification.verified} verified · ${verification.unresolved} still need exact evidence.`],
        conflict: ["Review identity conflicts", "Existing values were kept. API alternatives are shown for your decision."],
        warning: ["Verification needs attention", verification.errors[0] || "Some checks could not be completed."],
        "no-resources": ["No resources to verify", "Add a resource, hash, AIR, or model version ID when one is known."],
        unverified: ["Ready to verify", "Metadata is local. Exact hashes and model version IDs can be checked with Civitai."]
      };
      const [title, summary] = statuses[verification.status] || statuses.unverified;
      const shared = verification.sharedBatch;
      const apiSummary = shared?.images > 1
        ? ` · ${shared.networkCalls} shared API request${shared.networkCalls === 1 ? "" : "s"} across ${shared.images} images${shared.cacheHits ? ` · ${shared.cacheHits} cache reuse${shared.cacheHits === 1 ? "" : "s"}` : ""}`
        : Number.isFinite(verification.networkCalls)
          ? ` · ${verification.networkCalls} API request${verification.networkCalls === 1 ? "" : "s"}${verification.cacheHits ? ` · ${verification.cacheHits} cache reuse${verification.cacheHits === 1 ? "" : "s"}` : ""}`
        : "";
      this.nodes.statusTitle.textContent = entry.state === "verifying" ? statuses.checking[0] : title;
      this.nodes.statusSummary.textContent = `${entry.state === "verifying" ? statuses.checking[1] : summary}${apiSummary}`;
      const issueCount = unresolvedConflicts + validationErrors.length;
      this.nodes.generationIssueCount.textContent = issueCount ? `${issueCount} to review` : "No unresolved conflicts";
      this.nodes.generationIssueCount.className = `badge ${issueCount ? "conflict" : "verified"}`;
    }

    renderGeneration(record) {
      for (const definition of Studio.constants.GENERATION_FIELDS) {
        const input = this.nodes[definition.key];
        const field = record.fields[definition.key];
        if (!input || !field) continue;
        const value = field.value ?? "";
        if (document.activeElement !== input && input.value !== String(value)) input.value = String(value);
        const invalid = value !== "" && (
          (definition.kind === "integer" && !Number.isSafeInteger(Number(value)))
          || (definition.kind === "number" && !Number.isFinite(Number(value)))
          || (definition.kind === "hash" && !/^[A-Fa-f0-9]{8,128}$/.test(String(value).replace(/\s+/g, "")))
        );
        input.setAttribute("aria-invalid", invalid ? "true" : "false");
        const meta = this.nodes[`${definition.key}Meta`];
        if (meta) {
          const source = SOURCE_LABELS[field.source] || field.source || "Unknown";
          meta.textContent = invalid ? "Review this value before saving" : `${source}${field.evidence ? ` · ${field.evidence}` : ""}`;
        }
      }
    }

    resourceTone(resource) {
      if (resource.verification === "verified") return "verified";
      if (resource.verification === "conflict") return "conflict";
      if (["error", "hashing"].includes(resource.verification)) return "warning";
      return "neutral";
    }

    resourceEvidence(label, value, { href = "", hint = "", primary = false } = {}) {
      const text = valueText(value);
      const valueNode = href && value
        ? el("a", {
            className: "evidence-value evidence-link",
            href,
            target: "_blank",
            rel: "noopener noreferrer",
            referrerPolicy: "no-referrer",
            text,
            title: text,
            attributes: { "aria-label": `${label}: ${text} (opens the Civitai resource in a new tab)` }
          })
        : el("strong", { className: "evidence-value", text, title: text });
      return el("div", { className: `evidence-item${primary ? " primary" : ""}` }, [
        el("span", { text: label }),
        valueNode,
        hint ? el("small", { text: hint }) : null
      ]);
    }

    resourceCivitaiUrl(resource) {
      return Studio.air.civitaiResourceUrl(resource);
    }

    resourceTitle(resource) {
      const url = this.resourceCivitaiUrl(resource);
      if (!url) return el("h3", { className: "resource-title", text: resource.name });
      return el("h3", { className: "resource-title" }, el("a", {
        className: "resource-link",
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
        referrerPolicy: "no-referrer",
        attributes: {
          "aria-label": `${resource.name} on Civitai (opens in a new tab)`,
          title: "Open the exact Civitai resource in a new tab"
        }
      }, [
        resource.name,
        el("span", {
          className: "resource-link-mark",
          text: "↗",
          attributes: { "aria-hidden": "true" }
        })
      ]));
    }

    originalResource(record, resource) {
      return record.original?.resources?.find((item) => item.key === resource.key) || null;
    }

    resourceAirOrigin(record, resource) {
      if (!resource.canonicalAir && !resource.rawAir) return "Not available";
      const original = this.originalResource(record, resource);
      if (original?.canonicalAir || original?.rawAir) return "Embedded in original";
      if (resource.apiReference?.canonicalAir || resource.identitySource === "api_exact") return "Returned by Civitai API";
      if (resource.identitySource === "manual") return "Entered manually";
      if (resource.identitySource === "imported") return "Imported identity";
      return "Metadata record";
    }

    resourceMatchInfo(record, resource) {
      const original = this.originalResource(record, resource);
      const originalHasAir = Boolean(original?.canonicalAir || original?.rawAir);
      const evidence = resource.verificationEvidence;
      if (resource.verification === "verified" && evidence?.kind === "hash") {
        return {
          label: "Matched using",
          value: originalHasAir
            ? `AIR + ${evidence.algorithm || "hash"}`
            : `${evidence.algorithm || "Hash"} · ${evidence.value || ""}`,
          hint: originalHasAir
            ? "Embedded identity and exact file hash agreed"
            : "Exact file-hash evidence"
        };
      }
      if (resource.verification === "verified" && (originalHasAir || evidence?.kind === "modelVersionId")) {
        return {
          label: "Matched using",
          value: originalHasAir
            ? `Embedded AIR · ${resource.modelVersionId || evidence?.value || ""}`
            : `Model version ID · ${evidence?.value || resource.modelVersionId || ""}`,
          hint: "Exact Civitai version lookup"
        };
      }
      return {
        label: resource.verificationMessage ? "Verification evidence" : "Detection source",
        value: resource.verificationMessage || resource.evidence || resource.identitySource,
        hint: ""
      };
    }

    renderResources(record) {
      const resources = record.resources.filter((resource) => !resource.removed);
      if (!resources.length) {
        replace(this.nodes.resourcesList, empty("No resources were identified. Add one when you know what was used."));
        return;
      }
      replace(this.nodes.resourcesList, resources.map((resource) => {
        const hash = selectHash(resource.hashes);
        const official = resource.apiReference;
        const civitaiUrl = this.resourceCivitaiUrl(resource);
        const match = this.resourceMatchInfo(record, resource);
        const projection = Studio.civitaiContract.parserResourceDecision(resource);
        const diagnosticBits = [
          projection.identityScope === "exact_file"
            ? `Exact file${resource.fileId ? ` ${resource.fileId}` : ""}`
            : projection.identityScope === "model_version"
              ? "Model-version identity"
              : "Identity scope unknown",
          projection.parserFacing
            ? "Included in parser metadata"
            : `Structured only · ${(projection.reason || "not eligible").replaceAll("_", " ")}`,
          Number.isFinite(resource.lookupDiagnostics?.candidateCount)
            ? `${resource.lookupDiagnostics.compatibleCandidateCount ?? 0}/${resource.lookupDiagnostics.candidateCount} role-compatible API candidates`
            : "",
          resource.fileType ? `API file type: ${resource.fileType}` : ""
        ].filter(Boolean);
        const referenceBits = [
          resource.creator ? `Creator: ${resource.creator}` : "",
          resource.trainedWords?.length ? `Trained words (reference only): ${resource.trainedWords.slice(0, 6).join(", ")}` : "",
          resource.license ? `License flags (reference only): ${resource.license}` : ""
        ].filter(Boolean);
        const evidence = [
          this.resourceEvidence("Canonical AIR", resource.canonicalAir || resource.rawAir, {
            href: civitaiUrl,
            hint: this.resourceAirOrigin(record, resource),
            primary: Boolean(resource.canonicalAir || resource.rawAir)
          }),
          this.resourceEvidence("Civitai IDs", resource.modelVersionId ? `${resource.modelId || "?"} @ ${resource.modelVersionId}` : resource.modelId),
          this.resourceEvidence(hash.algorithm ? `Strongest hash · ${hash.algorithm}` : "Strongest hash", hash.value),
          ...(official && (official.name !== resource.name || official.versionName !== resource.versionName)
            ? [this.resourceEvidence("Civitai record", `${official.name}${official.versionName ? ` · ${official.versionName}` : ""}`)]
            : []),
          this.resourceEvidence(match.label, match.value, { hint: match.hint })
        ];
        return el("article", { className: "resource-card" }, [
          el("div", { className: "resource-icon", text: resource.role.slice(0, 2).toUpperCase(), attributes: { "aria-hidden": "true" } }),
          el("div", { className: "resource-main" }, [
            el("div", { className: "resource-title-row" }, [
              this.resourceTitle(resource),
              badge(resource.verification === "verified" ? "Verified" : resource.verification === "conflict" ? "Conflict" : resource.verification === "hashing" ? "Hashing" : "Unresolved", this.resourceTone(resource)),
              badge(projection.parserFacing ? "Parser-safe" : "Structured only", projection.parserFacing ? "verified" : "neutral")
            ]),
            el("p", { className: "resource-subtitle", text: `${resource.role} · ${resource.type}${resource.versionName ? ` · ${resource.versionName}` : ""}${resource.baseModel ? ` · ${resource.baseModel}` : ""}${referenceBits.length ? ` · ${referenceBits.join(" · ")}` : ""}` }),
            el("p", { className: "resource-diagnostics", text: diagnosticBits.join(" · ") }),
            el("div", { className: "resource-evidence" }, evidence)
          ]),
          el("div", { className: "resource-actions" }, el("button", {
            type: "button",
            className: "button quiet small",
            text: "Edit",
            dataset: { resourceKey: resource.key },
            attributes: { "aria-label": `Edit ${resource.name}` }
          }))
        ]);
      }));
    }

    async openCacheDialog() {
      const n = this.nodes;
      n.cacheBackend.textContent = "Checking…";
      n.cacheVersionCount.textContent = "—";
      n.cacheRecordCount.textContent = "—";
      n.cacheByteCount.textContent = "—";
      n.cacheDialogStatus.textContent = "Reading cache statistics…";
      n.cacheDialog.showModal();
      await this.renderCacheStats();
    }

    async renderCacheStats() {
      const n = this.nodes;
      try {
        const stats = await Studio.civitai.cacheStats();
        const backendLabels = {
          indexeddb: "IndexedDB",
          localStorage: "Local storage fallback",
          memory: "Memory only",
          initializing: "Initializing"
        };
        n.cacheBackend.textContent = backendLabels[stats.backend] || stats.backend;
        n.cacheVersionCount.textContent = Number(stats.versions || 0).toLocaleString();
        n.cacheRecordCount.textContent = Number(stats.records || 0).toLocaleString();
        n.cacheByteCount.textContent = formatBytes(stats.bytes || 0);
        n.cacheDialogStatus.textContent = stats.backend === "indexeddb"
          ? `Bounded to ${formatBytes(stats.limits.bytes)}, ${Number(stats.limits.versions).toLocaleString()} versions, or ${Number(stats.limits.records).toLocaleString()} records.`
          : "IndexedDB is unavailable in this context, so a smaller best-effort fallback is active.";
      } catch (error) {
        n.cacheDialogStatus.textContent = `Cache statistics are unavailable: ${error.message}`;
      }
    }

    async clearModelCache() {
      const n = this.nodes;
      n.clearCacheButton.disabled = true;
      n.cacheDialogStatus.textContent = "Clearing cached Civitai identities…";
      try {
        await Studio.civitai.clearCache();
        await this.renderCacheStats();
        this.state.announce("The local Civitai model cache was cleared. Images and exported identities were not changed.", "success");
      } catch (error) {
        n.cacheDialogStatus.textContent = `The cache could not be cleared: ${error.message}`;
      } finally {
        n.clearCacheButton.disabled = false;
      }
    }

    renderMetadata(record) {
      const items = record.inspection.metadataItems || [];
      const preserved = items.filter((item) => record.metadataSelections[item.id]).length;
      this.nodes.preservedCount.textContent = `${preserved} preserved`;
      this.nodes.preservedCount.className = "badge neutral";
      if (!items.length) {
        replace(this.nodes.otherMetadataList, empty("No additional metadata fields were found."));
        return;
      }
      replace(this.nodes.otherMetadataList, items.map((item) => {
        const input = el("input", {
          type: "checkbox",
          checked: Boolean(record.metadataSelections[item.id]),
          disabled: !item.preserveSupported,
          dataset: { metadataId: item.id },
          attributes: { "aria-label": `Preserve ${item.label}` }
        });
        return el("div", { className: "metadata-row" }, [
          el("div", { className: "metadata-key" }, [
            el("div", { text: item.label }),
            badge(item.category, item.category === "sensitive" ? "conflict" : item.category === "technical" ? "verified" : "neutral")
          ]),
          el("div", { className: "metadata-value", text: `${item.value}${item.reason ? `\n${item.reason}` : ""}` }),
          el("label", { className: "preserve-check" }, [input, "Preserve"])
        ]);
      }));
    }

    renderReview(record) {
      const conflicts = record.conflicts.filter((conflict) => !conflict.resolved);
      for (const message of Studio.canonical.validate(record)) {
        conflicts.push({
          id: `validation-${message}`,
          label: "Invalid value",
          chosen: { value: message },
          alternatives: [],
          resourceOnly: true
        });
      }
      for (const resource of record.resources.filter((item) => item.verification === "conflict" && !item.removed)) {
        conflicts.push({
          id: `resource-${resource.key}`,
          label: `${resource.name} identity`,
          chosen: { value: resource.verificationMessage },
          alternatives: resource.apiCandidate ? [{ value: `${resource.apiCandidate.name} · version ${resource.apiCandidate.modelVersionId || "unknown"}`, source: "api_exact" }] : [],
          resourceOnly: true
        });
      }
      replace(this.nodes.conflictList, conflicts.length ? conflicts.flatMap((conflict) => {
        if (!conflict.alternatives.length) {
          return [el("div", { className: "conflict-row" }, [
            el("div", { className: "diff-label", text: conflict.label }),
            el("div", { className: "diff-value", text: valueText(conflict.chosen.value) }),
            el("div", { className: "diff-value", text: "Edit the resource to resolve this conflict." })
          ])];
        }
        return conflict.alternatives.map((option, index) => el("div", { className: "conflict-row" }, [
          el("div", { className: "diff-label", text: conflict.label }),
          el("div", { className: "diff-value", text: `Kept: ${valueText(conflict.chosen.value)}\n${SOURCE_LABELS[conflict.chosen.source] || conflict.chosen.source || ""}` }),
          el("div", { className: "diff-value" }, [
            el("div", { text: `Alternative: ${valueText(option.value)}\n${SOURCE_LABELS[option.source] || option.source || ""}` }),
            ...(conflict.resourceOnly ? [] : [el("button", {
              type: "button",
              className: "button quiet small",
              text: "Use this value",
              dataset: { conflictId: conflict.id, optionIndex: index }
            })])
          ])
        ]));
      }) : []);

      const diff = Studio.canonical.diff(record);
      replace(this.nodes.diffList, diff.length ? diff.map((row) => el("div", { className: "diff-row" }, [
        el("div", { className: "diff-label", text: row.label }),
        el("div", { className: "diff-value", text: `Original\n${valueText(row.before)}` }),
        el("div", { className: "diff-value", text: `New copy\n${valueText(row.after)}` })
      ])) : empty("No metadata changes yet. Saving still creates a new compatibility copy."));

      const previous = this.nodes.rawCarrierSelect.value;
      replace(this.nodes.rawCarrierSelect, record.inspection.carriers.map((carrier, index) =>
        el("option", { value: String(index), text: carrier.name })
      ));
      if (record.inspection.carriers.length) {
        this.nodes.rawCarrierSelect.value = record.inspection.carriers[Number(previous)] ? previous : "0";
        this.nodes.rawCarrierSelect.disabled = false;
        this.nodes.copyRawButton.disabled = false;
      } else {
        replace(this.nodes.rawCarrierSelect, el("option", { value: "", text: "No raw carriers" }));
        this.nodes.rawCarrierSelect.disabled = true;
        this.nodes.copyRawButton.disabled = true;
      }
      this.renderRaw();
    }

    renderRaw() {
      const carriers = this.state.current?.inspection.carriers || [];
      const carrier = carriers[Number(this.nodes.rawCarrierSelect.value)];
      if (!carrier) {
        this.nodes.rawMetadataView.textContent = "No raw metadata carriers were found.";
        return;
      }
      const value = String(carrier.value || "");
      this.nodes.rawMetadataView.textContent = value.length > 200_000
        ? `${value.slice(0, 200_000)}\n\n[Display truncated; Copy still uses the complete carrier.]`
        : value;
    }

    async copyRaw() {
      const carriers = this.state.current?.inspection.carriers || [];
      const carrier = carriers[Number(this.nodes.rawCarrierSelect.value)];
      if (!carrier) return;
      try {
        await navigator.clipboard.writeText(String(carrier.value || ""));
        this.state.announce("Raw metadata copied to the clipboard.", "success");
      } catch {
        this.state.announce("Clipboard access was denied by the browser.", "warning");
      }
    }

    fillOptions(select, values) {
      replace(select, values.map(([value, label]) => el("option", { value, text: label })));
    }

    openResource(key, isNew = false, wasDirty = false) {
      const resource = this.state.current?.resources.find((item) => item.key === key);
      if (!resource) return;
      this.resourceKey = key;
      this.resourceIsNew = isNew;
      this.resourceWasDirty = wasDirty;
      this.fillOptions(this.nodes.resourceRole, Studio.constants.RESOURCE_ROLES);
      this.fillOptions(this.nodes.resourceType, Studio.constants.RESOURCE_TYPES);
      this.populateResourceForm(resource);
      this.nodes.removeResourceButton.hidden = isNew;
      this.nodes.resourceDialog.returnValue = "";
      this.nodes.resourceDialog.showModal();
      this.nodes.resourceName.focus();
    }

    populateResourceForm(resource) {
      const n = this.nodes;
      n.resourceKey.value = resource.key;
      n.resourceName.value = resource.name || "";
      n.resourceVersionName.value = resource.versionName || "";
      n.resourceBaseModel.value = resource.baseModel || "";
      n.resourceRole.value = resource.role || "other";
      n.resourceType.value = this.closestResourceType(resource.type);
      n.resourceAir.value = resource.canonicalAir || resource.rawAir || "";
      n.resourceModelId.value = resource.modelId || "";
      n.resourceVersionId.value = resource.modelVersionId || "";
      n.resourceFileId.value = resource.fileId || "";
      n.resourceUrl.value = resource.sourceUrl || "";
      n.resourceSha256.value = resource.hashes?.SHA256 || "";
      n.resourceBlake3.value = resource.hashes?.BLAKE3 || "";
      n.resourceAutoV3.value = resource.hashes?.AutoV3 || "";
      n.resourceAutoV2.value = resource.hashes?.AutoV2 || "";
      n.resourceCrc32.value = resource.hashes?.CRC32 || "";
      n.resourceAutoV1.value = resource.hashes?.AutoV1 || "";
      n.resourceWeight.value = resource.weight ?? "";
      n.resourceDialogStatus.textContent = resource.verificationMessage || resource.airWarning || "Add exact evidence, or search by name and choose a version.";
      n.removeResourceButton.hidden = false;
    }

    refreshOpenResource() {
      const resource = this.state.current?.resources.find((item) => item.key === this.resourceKey);
      if (resource) this.populateResourceForm(resource);
    }

    closestResourceType(type) {
      const values = Studio.constants.RESOURCE_TYPES.map(([value]) => value);
      if (values.includes(type)) return type;
      const lower = String(type || "").toLowerCase();
      return values.find((value) => lower.includes(value.toLowerCase())) || "Other";
    }

    applyResourceForm(render = true) {
      if (!this.resourceKey) return;
      const n = this.nodes;
      this.state.updateResource(this.resourceKey, {
        name: n.resourceName.value,
        versionName: n.resourceVersionName.value,
        baseModel: n.resourceBaseModel.value,
        role: n.resourceRole.value,
        type: n.resourceType.value,
        rawAir: n.resourceAir.value,
        modelId: n.resourceModelId.value,
        modelVersionId: n.resourceVersionId.value,
        fileId: n.resourceFileId.value,
        weight: n.resourceWeight.value,
        sourceUrl: n.resourceUrl.value,
        hashes: {
          SHA256: n.resourceSha256.value,
          BLAKE3: n.resourceBlake3.value,
          AutoV3: n.resourceAutoV3.value,
          AutoV2: n.resourceAutoV2.value,
          CRC32: n.resourceCrc32.value,
          AutoV1: n.resourceAutoV1.value
        }
      });
      if (!render) return;
      if (this.state.autoVerify) this.state.verifyCurrent();
    }

    async searchResource() {
      const query = this.nodes.resourceName.value.trim();
      if (query.length < 2) {
        this.nodes.resourceDialogStatus.textContent = "Enter at least two characters of the resource name.";
        return;
      }
      this.nodes.searchResourceButton.disabled = true;
      this.nodes.resourceDialogStatus.textContent = "Searching Civitai by name. Results are candidates until you choose and verify one.";
      replace(this.nodes.resourceCandidateList, []);
      try {
        this.candidates = await Studio.civitai.searchCandidates(query);
        if (!this.candidates.length) {
          this.nodes.resourceDialogStatus.textContent = "No name candidates were found. A local model-file hash is the strongest next step.";
          return;
        }
        replace(this.nodes.resourceCandidateList, this.candidates.flatMap((candidate, candidateIndex) => {
          const versions = candidate.versions.length ? candidate.versions : [{ versionName: "Model page", modelVersionId: null, hashes: {} }];
          return [
            el("h3", { text: `${candidate.name} · ${candidate.type}${candidate.creator ? ` · ${candidate.creator}` : ""}` }),
            ...versions.map((version, versionIndex) => el("button", {
              type: "button",
              className: "candidate-button",
              dataset: { candidateIndex, versionIndex },
              text: `${version.versionName || "Unnamed version"} · version ${version.modelVersionId || "not listed"}`
            }))
          ];
        }));
        this.nodes.resourceDialogStatus.textContent = "Choose the precise version. Nothing is selected automatically from a name match.";
      } catch (error) {
        this.nodes.resourceDialogStatus.textContent = error.message;
      } finally {
        this.nodes.searchResourceButton.disabled = false;
      }
    }

    toggleTheme() {
      const current = document.documentElement.dataset.theme;
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      this.nodes.themeButton.setAttribute("aria-label", `Use ${next === "dark" ? "light" : "dark"} theme`);
      try {
        localStorage.setItem("civitai-metadata-studio.theme", next);
      } catch {
        // Theme persistence is optional.
      }
    }
  }

  Studio.AppUI = AppUI;
})();
