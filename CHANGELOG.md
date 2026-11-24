# Changelog

## Unreleased

- Adds a cohesive, dependency-free GitHub Pages hub: guided learning with an original synthetic sample, all 28 searchable wiki guides, signed stable-download receipts, privacy/provenance explanations, developer interfaces, and community routes.
- Adds local-only search, optional light/dark preference, keyboard case studies, no-JavaScript content, project-root 404 recovery, strict CSP/SRI, explicit deployment inventory/budgets, and Chrome/Edge regression coverage.
- Connects repository, wiki, support/discussions, issue forms, and roadmap sources; requires the correctly bound CodeQL check alongside Windows/Linux CI. Keeps the signed v1.0.2 HTML/ZIP/checksums and all historical releases unchanged.

## 1.0.2 - 2026-11-17

- Fixes wiki heading anchors with a single-pass, slug-only scanner instead of regex-based HTML stripping; adds 14 regressions for quoted attributes, comments, incomplete markup, Unicode, and duplicate anchors. Resolves the wiki checker's CodeQL alert without changing image-editing behavior.
- Corrects the browser cooldown test's mocked CORS exposure of Retry-After and controls its clock, so cache-clear coverage no longer depends on runner speed. No application behavior changes.
- Refreshes the wiki, README downloads, and provenance guides with version-pinned checksums/attestation commands, current SDK setup and test evidence, and clearly labeled historical reports.
- Synchronizes version reporting to 1.0.2 and rebuilds the standalone HTML, matching ZIP, and checksum manifest for a new GitHub/Sigstore-attested release. Runtime code, dependencies, and metadata contracts are otherwise unchanged; existing releases are not replaced.

## 1.0.1 - 2026-11-15

- Synchronizes the portable editor, companion, OpenAPI, and documentation versions, with a release-version consistency regression and freshly verified portable assets.

- Fixes the development SDK client's legacy-SSE reconnect cursor in ESM and CommonJS through a new integrity-pinned local repack, preserving live auth/protocol headers and the existing native-stdio patch.
- Adds reconnect header-shape, cursor update/reset/UTF-8, POST separation, redirect safety, and four-module patch drift/rollback regressions to the Windows/Linux Node.js 24/26 gates.
- Updates the MCP development client's eventsource, eventsource-parser, and pkce-challenge together through exact, SDK-scoped overrides; retains one parser and the 14-package tree without changing Playwright or the reviewed SDK archive.
- Adds maintained ESM/CommonJS SSE, Streamable HTTP, and OAuth/PKCE compatibility regressions to the full Windows/Linux Node.js 24/26 gates.
- Installs a reproducible, integrity-pinned Node-only SDK repack with six unused standalone spawning dependencies removed (20 dependency packages to 14), preserving upstream license/modification notices and leaving Playwright unchanged.
- Verifies archive provenance and every installed SDK file before automation tests, and adds clean-install, repack reproduction, and Chrome/Edge gates on Windows/Linux for Node.js 24 and 26.
- Uses native Node spawning for the repository's Node-only MCP test launcher through a version- and SHA-256-pinned managed SDK patch, with no shell or legacy-spawn fallback and no installation hooks.
- Adds patch drift/rollback/link-safety tests, ESM/CommonJS MCP and lifecycle regressions, and full Windows/Linux CI on Node.js 24 and 26 without changing the portable app or dependency versions.
- Adds a public GitHub Pages entry point using the byte-identical portable artifact, privacy-aware support/contribution forms, community guidance, roadmap, scheduled dependency proposals, and reviewed repository/release protection profiles.
- Adds a comprehensive 28-page GitHub wiki with user guides, complete HTTP/MCP references, privacy/preservation boundaries, and release-verification instructions; versioned sources and navigation/contract checks keep it maintainable.
- Adds keyless GitHub/Sigstore build attestations for the portable HTML, ZIP, and checksum manifest, gated by Windows/Linux CI and verified against existing release bytes when requested manually.
- Adds reproducible build dates through SOURCE_DATE_EPOCH and documented CLI signature verification without changing the portable app or existing release downloads.
- Normalizes build inputs to LF and tests both line-ending conventions so Windows and Linux produce byte-identical portable artifacts.

## 1.0.0 - 2026-11-14

- Ships a license-bearing standalone HTML, a matching portable ZIP, and a verified SHA-256 checksum manifest.
- Keeps local API bearer tokens out of startup logs and strengthens case-insensitive CSP build validation.
- Adds a redesigned portable workspace with a command palette, searchable resources, edit history, clearer validation, selected-image saves, and batch actions.
- Adds streaming SHA-256 export proofs that reopen and compare encoded pixels/frames before saving, with results visible in Review.
- Adds an optional local companion with OpenAPI 3.2.1 HTTP endpoints and 14 official-SDK MCP tools over stdio and Streamable HTTP using the 2026-07-28 protocol.
- Enforces explicit filesystem roots, new-file-only exports, local bearer authentication, revision checks, atomic edits, bounded sessions, cancellation, and network opt-in in automation.
- Refreshes Civitai contracts from the current official documentation: full image metadata, mature-inclusive discovery, full SHA-256 batching, direct version-only reads, and live enum loading.
- Removes name-based identity-import matching and stale verification proof after identity edits.
- Preserves unresolved resource claims in JPEG/WebP metadata and repairs incomplete parent-model cache entries without discarding the whole cache.
- Enforces compressed-metadata limits during streaming decompression and preserves the shared rate-limit cooldown when the cache is cleared.
- Adds source-wide syntax checking, shared engine loading, and automation/browser regression coverage.

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
