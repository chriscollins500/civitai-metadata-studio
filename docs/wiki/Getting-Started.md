# Getting started

**Outcome:** inspect an image, make a small change, and save a separate copy. You do not need ComfyUI, a Civitai account, Node.js, or an API key for the browser editor.

## Download and open

You can [try the hosted editor](https://chriscollins500.github.io/civitai-metadata-studio/app/) first. It uses the same portable HTML, with local image processing and the same Civitai network controls. Browser cache storage belongs to its HTTPS origin/profile; it is separate from a downloaded file's storage. Download below for offline use.

1. Open the [latest release](https://github.com/chriscollins500/civitai-metadata-studio/releases/latest).
2. Download `civitai-metadata-studio.zip` and extract it.
3. Open `civitai-metadata-studio.html` in a current desktop browser.

You can download the HTML asset directly instead. Keep it on a local drive or USB storage. A local web server is not required for ordinary use. The project targets current browser standards; it does not maintain legacy-browser compatibility.

The ZIP contains one HTML file with the project's MIT notice. `SHA256SUMS.txt` and GitHub/Sigstore attestations are available for optional [download verification](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Release-and-Provenance).

## Open an image

Choose images with the file picker, or drop them into the welcome area. Start with one PNG, JPEG, or WebP. Multiple files create an image queue.

The app reads metadata locally. The picture, prompts, embedded workflow, and model-file bytes are not uploaded to Civitai. Automatic verification is initially enabled and may send exact resource hashes or numeric version IDs; returned public parent-model IDs may be used for creator/license enrichment. Turn the toggle off before opening files when you want no automatic lookups.

An image may have no generation metadata. That is not necessarily an error: many websites, editors, and export pipelines strip it. The Studio cannot reconstruct a missing prompt from pixels.

## Read the four tabs

| Tab | What to do |
| --- | --- |
| Generation | Read or edit prompts, settings, model/VAE fields, and dimensions. |
| Resources | Inspect checkpoints, LoRAs, VAEs, encoders, hashes, AIRs, and verification evidence. |
| Other metadata | Review supported metadata and its preservation choices. |
| Review | Inspect differences, conflicts, warnings, reports, and export-integrity results. |

The image facts show actual dimensions. Editable width/height start from those dimensions even when embedded settings disagree. A conflict may therefore be present immediately; it is evidence of disagreement, not proof that the file is broken.

## Make a reversible edit

Try a harmless synthetic prompt edit, such as adding `warm evening light`. The edit is held in this page's memory. **Undo** and **Redo** operate on the canonical record. **Reset edits** returns the current image to its initially inspected metadata.

Changing a resource's identity evidence invalidates old verification proof. A previously verified resource may correctly become unresolved until checked again.

Nothing reruns image generation. Seed, prompt, sampler, and dimension edits describe metadata; they do not regenerate or resize the picture.

## Save a new copy

Keep **Verify pixel integrity** enabled. Choose a suffix, such as `_metadata`, then select **Save new copy**. The browser may ask where to save or use its normal download directory.

For a batch, **Save … new copies** builds a ZIP. **Save this image** is available when multiple inspected images are queued. Save may wait for pending inspection, verification, or hashing in the queue.

Reopen the exported file and review the fields. When you intentionally wrote a different metadata size, the Studio will again initialize from real pixels on reopen and can show the embedded size as conflicting evidence.

## Finish without saving

Use the remove control beside an image, **Clear all** in the queue, or **Clear** in the header. Clearing does not delete files. Saving also does not clear the queue automatically.

There is no persistent autosave of image edits. Reloading or closing the page loses unsaved work. The disposable public identity cache is separate from image-edit memory.

**Next:** [Workspace and keyboard](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Workspace-and-Keyboard) · [Troubleshooting](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Troubleshooting)
