# Legacy audit and design rationale

## Material reviewed

- the legacy `metadata_to_civitAI_enhanced.html` prototype
- the companion `comfyui-civitai-save-node` project

The legacy HTML already demonstrated valuable ideas: a portable local tool, restrictive CSP, Civitai hash/version lookup, AIR handling, local caches, metadata inspection, and visible accessibility work. Its main limitation was that years of features had accumulated inside one very large document with read-only editor controls, overlapping compatibility paths, and tightly coupled parsing, UI, lookup, and export code.

The largest correctness risk was export through a canvas/PNG re-encode path. That changes the image representation, forces a format conversion, loses animation and container-specific metadata, and makes “8K support” dependent on decoder/canvas memory rather than metadata work. Several legacy identification paths also mixed high-confidence evidence with filename/name inference, and broad workflow scanning could include disconnected nodes.

## Save-node concepts retained

The ComfyUI save-node project supplied the stronger architectural model:

- one typed/canonical generation record feeding A1111 and Civitai projections;
- pixels-first behavior and deterministic metadata serialization;
- active-upstream workflow scanning;
- explicit identity precedence;
- exact hash/model-version evidence for API verification;
- no Civitai ID guessing from filenames;
- raw malformed AIR preservation with warnings;
- output-boundary path redaction;
- unresolved resources as a normal, visible state.

This browser project applies those concepts without copying the node's runtime or requiring ComfyUI.

The browser scanner starts at recognized output nodes, walks only upstream links, rejects explicitly bypassed/muted nodes, follows literal switch selections, and respects explicit stack/Power LoRA enable controls. A dynamic switch whose branch cannot be proven is retained conservatively with a warning. If no output root is identifiable, the scanner returns no inferred workflow resources rather than treating every graph node as active.

Resource reconciliation uses multiple compatible evidence keys—AIR, version/file IDs, full hashes, AutoV2 prefixes, filenames, and normalized prompt-tag stems—to collapse aliases. Conflicting exact IDs or hashes and distinct LoRA strengths are deliberately kept separate.

## Resulting architecture

The source is modular for review and tests, while the release is still a single HTML file:

```text
container inspection
        |
        +-- A1111 / EXIF / Civitai / active ComfyUI candidates
        |
        v
canonical editable record
        |
        +-- conflict and provenance review
        +-- batched exact Civitai verification + bounded cache
        +-- selective metadata policy
        |
        v
A1111 + Civitai manifest + EXIF generated together
        |
        v
same-format container rewrite using original pixel slices
```

PNG IDAT, JPEG scan data, and WebP VP8/VP8L/animation chunks are never decoded by the metadata writer. Synthetic regression tests compare those source and output byte ranges exactly.

## Deliberate boundaries

- Only PNG, JPEG, and WebP are enabled in this release.
- Only current browser APIs are supported.
- Automatic lookup uses hashes and model-version IDs. Name search is manual and never auto-selects.
- Civitai reference fields such as trained words and license flags are displayed but not silently embedded.
- Original ComfyUI prompt/workflow JSON is kept unchanged rather than normalized.
- The release uses no third-party runtime packages or remote assets.
- ZIP64 and extended JPEG XMP are not implemented; their container limits are reported explicitly.
