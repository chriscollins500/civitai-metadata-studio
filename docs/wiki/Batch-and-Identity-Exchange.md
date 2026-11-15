# Batches, reports, and reusable identities

**Outcome:** manage several images without mixing up image edits, audit reports, and identity-cache exports.

## The queue is a workspace

Adding images appends them to the queue. Select an item to edit it; the currently visible record is not necessarily the most recently added image. Each record keeps its own fields, conflicts, warnings, resources, and history.

Use **Remove** for an individual item or **Clear/Clear all** to discard queued work without saving. These controls do not delete the original files. Removing an item aborts its pending work where supported.

Saving leaves the queue in place. This is intentional: you can inspect the saved record, make another variation, or compare results before clearing it.

## Three outputs, three purposes

| Output | Use it for | Do not mistake it for |
| --- | --- | --- |
| Edited image / batch ZIP | Sharing or archiving a new image with corrected metadata. | A resized image, regenerated workflow, or proof of historical model usage. |
| Audit report JSON | Inspecting the canonical record, changes, conflicts, warnings, and preservation decisions. | A redacted public support bundle. It may contain prompts. |
| Identity export JSON | Reusing exact public model identity evidence across sessions. | A backup of image edits, prompts, workflow, or LoRA generation strengths. |

There is no general-purpose generation-sidecar export/import workflow in the browser. An arbitrary ComfyUI JSON file is not a Studio identity export.

## Identity export and import

The identity export uses schema `civitai-metadata-studio.identity-cache`, version `1`, and the filename `civitai-metadata-identities.json`. It gathers eligible resources from the current queue, excluding removed items.

It carries identity information such as supported hashes and Civitai IDs. It does not contain image bytes or prompts, and is not a complete resource-generation backup: LoRA weights and other image-specific settings are not preserved for that purpose. Creator/license/trained-word enrichment is not a substitute for a fresh catalog read.

Import applies to the **current image**. Matching requires compatible exact identity evidence, not a similar name. Imported claims do not retain a trusted green badge merely because the JSON says they were verified; verify them again.

Limits are **4 MiB** and **5,000 resource entries**. Malformed or unsupported input should produce a warning rather than be interpreted as executable content.

## A useful library workflow

1. Open a representative set of images.
2. Verify exact resources, or hash permitted local model files when necessary.
3. Export identities before clearing the queue.
4. In a later session, open an image and import the identity JSON.
5. Review matches and reverify where network access is desired.

The automatic IndexedDB cache already accelerates repeated lookups in the same browser/profile. Identity JSON is an explicit portable exchange, not a way to synchronize every browser setting.

## Large batches

Work in manageable groups when images are huge or metadata-rich. Metadata reading is bounded and can avoid full preview decoding, but previews, ZIP construction, history, and outputs still consume memory. A ZIP is not evidence that every result was successfully reopened; retain the enabled integrity check.

The companion has no single batch endpoint. Scripts can iterate image sessions while respecting the active-operation and session limits. See the [API cookbook](https://github.com/chriscollins500/civitai-metadata-studio/wiki/API-Cookbook).

**Related:** [Cache and performance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Cache-and-Performance) · [Saving and pixel integrity](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Saving-and-Pixel-Integrity)
