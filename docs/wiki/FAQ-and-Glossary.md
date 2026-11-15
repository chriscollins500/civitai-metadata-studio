# Quick answers, plain language

## Frequently asked questions

**Do I need ComfyUI or a Civitai account?** No. Open the HTML and a supported image. Public API availability can vary, but local inspection/editing does not require an account.

**Does it upload my image?** No. Exact verification sends identifiers/hashes, explicit search sends your query, and explicit image import sends a public image ID. See [privacy](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Privacy-and-Security).

**Can it recover a deleted prompt or identify a model by looking at the picture?** Not from pixels alone. It reads available metadata and exact public identity evidence; it is not visual reverse identification or lost-data recovery.

**Can it fill all missing fields from Civitai?** Only information actually available for the exact public resource/image you select. A model version does not contain the seed or prompt used for an arbitrary image. Unknown information should remain unknown.

**Why is a model verified but the image recipe not proved?** The badge means resource identity matched compatible exact evidence. It does not establish historical use, authorship, consent, licensing permission, or reproducibility.

**Why AIR first if SHA-256 is a strong hash?** AIR/version IDs identify catalog objects; hashes identify file content at different strengths. The operational order is not a single cryptographic strength ranking. See [AIR and hashes](https://github.com/chriscollins500/civitai-metadata-studio/wiki/AIR-and-Hashes).

**Why does a resource link work before verification?** A claimed numeric ID can produce a valid-looking link. The link is navigation, not proof the claim is correct.

**Will width/height edits resize my picture?** No. They change generation metadata. Actual image dimensions initialize the fields and remain separate image facts.

**Does saving change quality or animation?** Supported exports retain encoded pixels/frames and verify protected payloads by default. They are not recompressed. Metadata changes mean the whole-file checksum normally changes.

**Why did the old workflow survive my prompt edit?** Original ComfyUI JSON is a preserved historical carrier. The editor does not rewire it or promise it can regenerate your edited recipe.

**How do I discard an image?** Remove it from the queue, or use Clear/Clear all. Saving does not empty the queue. Originals are not deleted.

**Does the cache save my edits?** No. It stores selected public identity data, not images, prompts, workflows, or session history. Save/export your work before closing.

**Can I use a JSON sidecar?** The browser identity importer accepts Studio identity exports, not arbitrary ComfyUI/save-node JSON. Developer sidecar regression scripts are separate.

**Does it work on every OS/browser?** It targets current standards and is portable by design. Actual browser validation currently covers Chrome/Edge on Windows; other environments are not automatically certified by that fact.

**Can an assistant overwrite my images?** The companion cannot overwrite originals or existing outputs. It can create a new file only inside an explicitly configured write root.

**Is the app digitally signed?** Release digests have GitHub/Sigstore build attestations. That is not Windows Authenticode, macOS notarization, or a malware guarantee.

## Glossary

| Term | Plain-language meaning |
| --- | --- |
| Metadata | Information stored alongside the picture inside its file. |
| Generation recipe | Prompts/settings/resource claims describing how an image was created. |
| Civitai | A public catalog/community for image-generation models and creations. |
| ComfyUI | A node-based creation tool that can embed its graph in an image. |
| Checkpoint | A principal model or model snapshot; exact meaning depends on the ecosystem. |
| LoRA / LyCORIS | A smaller model adaptation used alongside a larger model. |
| VAE | A component that maps between latent representations and image pixels. |
| Conditioning | Data that guides generation, including encoded prompts. |
| AIR | A structured resource identifier with ecosystem, type, source, and catalog identity. |
| Model / version / file ID | Different catalog levels: parent listing, version, downloadable file. |
| Hash | A computed fingerprint of file bytes or a defined portion of them. |
| Canonical record | The editor's single shared representation of values and evidence. |
| Projection | A format-specific rendering of the canonical record. |
| Provenance | Where a value or identity claim came from. |
| Conflict | Evidence sources disagree; a decision or more evidence is needed. |
| Payload | The encoded image/animation content, separate from editable metadata. |
| IndexedDB | Browser-managed asynchronous structured local storage. |
| Revision | A session counter used to reject stale automation mutations. |
| Idempotency key | A short-lived request identity used to avoid accidentally applying an operation twice. |
| MCP | A protocol that lets compatible assistant hosts discover and call bounded tools. |
| Attestation | Signed evidence binding artifact digests to build provenance. |

**Still stuck?** [Troubleshooting](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Troubleshooting) · [Documentation map](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Documentation-Map)
