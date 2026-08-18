# Changelog

## 0.5.0 - 2026-07-30

- Adds explicit Civitai image-ID/URL metadata import. Missing values are imported, disagreements become review conflicts, and header-derived pixel dimensions remain the initial editable width/height values.
- Replaces one-hash/one-version assumptions with cached candidate sets and role-, file-ID-, and filename-aware disambiguation. A shared hash with multiple compatible identities remains a visible conflict.
- Adds a reviewed Civitai file/type compatibility contract. Structured metadata retains every active resource and its diagnostics, while A1111 and other parser-facing projections include only positively verified, role-compatible identities.
- Implements documented AIR forms and exact `+fileId.format` qualifiers while retaining the raw AIR and its origin separately from API-derived canonical identity.
- Computes AutoV3 from the safetensors tensor payload during the main streaming hash pass instead of treating an embedded metadata claim as calculated evidence.
- Stops immediately on HTTP `429` and shares one bounded cooldown across subsequent lookups; no field-level retry storm is possible.
- Excludes resources found only behind unresolved dynamic ComfyUI switch branches and expands diagnostics for attempted hashes, candidate counts, exact file scope, and parser eligibility.
- Repairs narrowly scoped bare `NaN`/`Infinity` tokens in otherwise valid ComfyUI JSON without evaluating metadata or changing quoted prompt text.
- Adds accessible Generation, Resources, Other metadata, and Review tabs; compacts the editor; and adds an image-import dialog.
- Expands live contract, public complex-workflow, paired-sidecar, current model-family, lossless rewrite, and Chrome regression coverage.
- Adds dependency-free release ZIP packaging, byte-identical archive verification, and Windows/Linux GitHub Actions validation.

## 0.4.0 - 2026-07-25

- Switches from the full welcome view to a compact, viewport-filling workspace after the first image is opened, with persistent Add/Clear controls, independent desktop scrolling, and editor-first ordering on narrow screens.
- Separates the canonical AIR and its origin from the exact evidence used to match a resource, while keeping both linked to the resolved Civitai version.
- Treats model-version omissions from Civitai's batch listing as soft misses and performs one direct exact-version fallback instead of storing a false negative.
- Retains structured verification evidence so AIR, model-version, and exact hash matches remain distinguishable in the interface.

## 0.3.0 - 2026-07-25

- Replaces the small whole-object browser cache with an asynchronous IndexedDB identity cache while retaining bounded local-storage and memory fallbacks.
- Migrates the previous cache automatically, preserves the existing lookup TTLs, and prunes expired or least-recently-used resources as complete version groups.
- Bounds the IndexedDB cache to 16 MiB, 2,000 model versions, or 50,000 records and exposes accessible cache statistics and clearing controls.
- Qualifies cached hash mappings by algorithm so CRC32 and AutoV1 values cannot collide.
- Turns identified resource names into safe links to their exact Civitai model/version pages in a new browser tab.

## 0.2.3 - 2026-07-25

- Centralizes exact identity fallback as AIR/model-version ID, SHA-256, BLAKE3, AutoV3, AutoV2, CRC32, then AutoV1.
- Prevents a weaker matching hash from masking a stronger conflicting hash.
- Keeps AutoV2 as an explicit A1111 compatibility projection while displaying and syncing the strongest canonical hash elsewhere.
- Adds editable AutoV1 evidence to the resource dialog.

## 0.2.2 - 2026-07-25

- Resolves switch controls linked through ComfyUI primitive/constant nodes before active-graph traversal, excluding configured resources when their branch is turned off.
- Strengthens paired-sidecar regression checks so browser-detected resources must agree with the authoritative save-node active-resource record.
- Adds creator-based Civitai workflow discovery and pinned Lonecat regression fixtures, including a 119-node graph with 13 switches.

## 0.2.1 - 2026-07-25

- Treats zeroed/empty ComfyUI conditioning branches as empty prompts instead of copying their upstream positive text into the negative prompt.
- Adds paired-sidecar prompt-semantics coverage for the complete July 24 image set.

## 0.2.0 - 2026-07-25

- Batched exact Civitai verification across newly dropped images by model-version ID and SHA-256, with bounded caching, in-flight request sharing, negative caching, rate-limit cooldown, and one maximum `429` retry.
- Added per-image **Remove** controls and **Clear all** for discarding queued work without saving or touching original files.
- Hardened output-bound ComfyUI traversal for bypassed/muted nodes, literal switches, disabled stack slots, and nested rgthree Power LoRA controls.
- Collapsed duplicate manifest, A1111, prompt-tag, workflow, and API identities only when their exact evidence or compatible aliases overlap; conflicting IDs, hashes, and LoRA strengths remain separate.
- Added editable base-model/ecosystem data and preserved it through canonical merge, manifest export, rewrite, and reopen.
- Added paired image/sidecar, complex public Civitai workflow, and all-current-Civitai-base-model regression suites.

## 0.1.0 - 2026-07-25

- Rebuilt the legacy metadata utility around one editable canonical record.
- Added bounded PNG, JPEG, WebP, TIFF/EXIF, A1111, Civitai, and active ComfyUI metadata inspection.
- Added same-format, pixel-payload-preserving export for still and animated containers.
- Added exact Civitai hash/model-version verification, explicit name candidates, local model hashing, conflict review, and identity JSON import/export.
- Added single and batch workflows with ZIP export.
- Added privacy-first metadata preservation controls and path-safe projections.
- Added responsive, keyboard-accessible, high-contrast, reduced-motion-aware UI.
- Added a dependency-free single-HTML build with a computed CSP hash and fixture-based regression tests.
