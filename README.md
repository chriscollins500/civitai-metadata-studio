# Civitai Metadata Studio

[![CI](https://github.com/chriscollins500/civitai-metadata-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/chriscollins500/civitai-metadata-studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-006b59.svg)](LICENSE)

A private, portable browser tool for inspecting, repairing, verifying, and exporting AI-image metadata. The release is one self-contained HTML file: no installation, server, account, package download, or image upload is required.

Open [dist/civitai-metadata-studio.html](dist/civitai-metadata-studio.html) in a current browser.
The matching [release ZIP](dist/civitai-metadata-studio.zip) contains that exact HTML file and nothing else.

## What it does

- Opens one image or a batch of PNG, JPEG, and WebP files.
- Removes one queued image or clears the entire queue without saving; originals are never touched.
- Reads image containers with byte ranges. Pixel and animation payloads are skipped during metadata inspection.
- Makes generation fields and Civitai resource identities editable.
- Reads A1111 parameters, EXIF `UserComment`, PNG Civitai manifests, and original ComfyUI `prompt` / `workflow` JSON.
- Scans only the active graph upstream of recognized ComfyUI output nodes for common sampler, loader, LoRA, VAE, encoder, ControlNet, IPAdapter, and upscaler nodes.
- Honors bypassed/muted node modes, direct or linked primitive switch selections, disabled stack slots, zeroed/empty conditioning, and nested rgthree Power LoRA enable controls. Resources found only behind an unresolved dynamic switch are reported as uncertain and excluded from identity claims.
- Verifies resources through exact Civitai model-version IDs or hashes.
- Opens an identified resource name directly on its exact Civitai model/version page in a new browser tab.
- Imports public metadata from an explicitly entered Civitai image ID or exact image URL. Missing fields are added, disagreements go to Review, and actual image pixels remain the initial width/height truth.
- Offers name search only as an explicit user action; a name result is never automatically selected.
- Hashes local model files in a streaming pass. It produces SHA-256, a true AutoV3 hash over the safetensors tensor payload, AutoV2, CRC32, and AutoV1 where applicable. Imported BLAKE3 evidence is retained, but the browser does not calculate BLAKE3 locally.
- Shows original, chosen, and alternative values when metadata sources disagree.
- Imports only missing values automatically. Existing values are not silently replaced.
- Exports a new same-format image while copying the original encoded image/animation chunks unchanged.
- Saves a single output directly or a batch as an uncompressed ZIP.
- Imports and exports a portable identity JSON document. Browser cache is only a convenience.

The generated A1111 parameters, EXIF `UserComment`, and structured Civitai manifest all come from the same in-memory record, so resource identities cannot drift between output projections. The structured manifest retains every active resource and its diagnostics; parser-facing compatibility fields contain only positively verified, role-compatible identities.

## Privacy and network behavior

Image bytes, prompts, workflows, and local model files stay in the browser. Automatic verification sends only exact identity evidence. It combines all newly dropped images into one shared prefetch, using up to 20 version IDs or 20 SHA-256 hashes per request:

- `GET https://civitai.com/api/v1/models?modelVersionIds=...`
- `POST https://civitai.com/api/v1/model-versions/by-hash` with a JSON array containing only SHA-256 values

The batch hash route accepts SHA-256 arrays and can return multiple candidates for one hash. Candidate sets are cached together and disambiguated by the resource role, exact file ID, and filename evidence; multiple compatible identities remain an explicit conflict. If a batch route is unavailable, omits a requested version, or the evidence uses another supported exact hash, lookup falls back to the corresponding read-only endpoint. A batch omission is not negatively cached; only a direct exact-endpoint miss creates a temporary negative cache entry.

- `GET https://civitai.com/api/v1/model-versions/{id}`
- `GET https://civitai.com/api/v1/model-versions/by-hash/{hash}`
- `GET https://civitai.com/api/v1/models/{id}` when an exact version response needs creator/license reference flags

The resource editor also has an explicit name-search button. That action sends only the typed search phrase to:

- `GET https://civitai.com/api/v1/models?query=...`

The explicit Civitai image importer sends only the entered public image ID to `GET https://civitai.com/api/v1/images?imageId=...`. Its returned prompt and image metadata are used for the current comparison only and are never written to IndexedDB or local storage.

There is no API-key field and no token storage. Automatic verification is on initially and can be switched off before opening images. Positive exact matches are cached locally for seven days, misses for fifteen minutes, and searches for ten minutes; repeated and concurrent lookups reuse those entries. A `429` response is not retried: it immediately starts one shared, bounded `Retry-After` cooldown so later fields and images do not continue sending requests.

The fast in-memory cache is backed by IndexedDB when the browser permits it. The persistent cache is limited to 16 MiB, 2,000 model versions, or 50,000 records, whichever is reached first. Expired entries are removed first; later pruning removes complete least-recently-used version groups so hash aliases cannot become orphaned. If IndexedDB is unavailable, the application falls back to a 250-record local-storage cache and then to memory-only operation. The **Model cache** dialog reports the active backend, version count, record count, approximate size, and provides a safe clear action.

The model cache contains compact public Civitai response data, exact hashes, numeric IDs, resource names, creator names, trained words, and license flags. It never contains image bytes, prompts, workflows, local paths, model-file bytes, API keys, or tokens. It is disposable and scoped to the current browser, browser profile, and page origin; moving between `file:`, localhost, browsers, or profiles does not carry the cache with the HTML.

## Evidence policy

Exact identity evidence is evaluated in one operational order:

1. AIR / model-version ID
2. SHA-256
3. BLAKE3
4. AutoV3
5. AutoV2
6. CRC32
7. AutoV1
8. Filename or model name as unresolved candidates only

AIR is parsed strictly and retained raw when malformed. Canonical `urn:air:`, shorter `air:`, and bare AIR forms are accepted, including documented `+fileId.format` exact-file qualifiers. Because a valid Civitai AIR resolves to a model-version ID, verification checks that version and cross-checks the strongest available full-file hash. A matching AIR/version plus matching SHA-256 or BLAKE3 is the strongest combined evidence. A weaker matching hash cannot conceal a conflict in a stronger one.

A1111 parameter output intentionally prefers AutoV2 as a format-compatibility exception. The canonical record, Civitai verification, editor display, and all other projections use the operational order above. Model filenames, prompt tags, and names from a graph remain candidates only; the tool does not invent Civitai IDs or silently choose the first search result.

Resource cards present **Canonical AIR** separately from **Matched using**. This preserves the audit distinction between an AIR embedded in the original image, an AIR returned by Civitai after an exact hash match, and the hash or version ID that actually established the match.

API creator, trained-word, and license information is displayed as reference material. Base-model/ecosystem labels are editable and preserved with the resource identity. When API data conflicts with existing IDs or hashes, the original is kept and the conflict is surfaced for review.

## Metadata preservation policy

| Metadata | Default |
| --- | --- |
| Encoded pixels, alpha, palettes, and animation frames | Always copied unchanged |
| ICC/color characteristics, orientation, density | Preserved |
| Original ComfyUI prompt/workflow carriers | Preserved byte-for-byte |
| Title, description, author, copyright, dates, XMP/IPTC | Shown with an opt-in preservation control |
| GPS directories, device/lens serials, MakerNote | Removed and shown as privacy-sensitive |
| Unknown private/ancillary chunks | Removed unless the whole supported container block is explicitly preserved |
| A1111 parameters, Civitai manifest, EXIF UserComment | Rebuilt from the edited shared record |

The original source file is never written. Browser downloads always create a new filename with the configured suffix.

## Format behavior

### PNG

The tool copies `IDAT`, palette, transparency, and APNG chunks without decoding them. It preserves original ComfyUI `prompt` and `workflow` iTXt chunks, replaces generation compatibility carriers, and writes:

- `parameters` tEXt
- `parameters_utf8` iTXt when a Latin-1 compatibility copy would be lossy
- `civitai` iTXt
- `Software` tEXt
- PNG `eXIf` with A1111-compatible Unicode `UserComment`

### JPEG

The entropy-coded scan from `SOS` onward is copied as one untouched slice. A rebuilt APP1 EXIF segment carries the edited A1111 parameters. JFIF, ICC, Adobe color transform, and selected APP/XMP/IPTC/COM metadata are preserved according to the review controls.

JPEG APP segments have a 64 KiB payload limit. The tool reports an error instead of silently truncating an unusually large EXIF payload.

### WebP

VP8, VP8L, alpha, and animation chunks are copied unchanged. The tool creates or updates the `VP8X` feature header, adds EXIF, and preserves selected ICC/XMP/RIFF metadata. Animated WebP frame data remains untouched.

## Large images and current browsers

There is no application dimension or file-size cap. Metadata readers skip large pixel chunks with `Blob.slice()`, and model files are hashed as streams. An 8K image is therefore treated like any other container. If the browser cannot render a preview because of memory or decoder limits, metadata editing and export continue.

This project intentionally targets only current browser standards. It requires modern `File` streams, `structuredClone`, Web Crypto IDs, `fetch`, `DecompressionStream`, native dialogs, and Blob downloads. There are no compatibility shims or legacy-browser fallbacks.

Practical platform limits still apply:

- a browser must be able to address the source `Blob`;
- JPEG EXIF is limited by the JPEG APP1 segment size;
- batch ZIP currently uses ZIP32, so each item and archive offset must stay below 4 GiB;
- malformed or unsupported EXIF fields are displayed when possible but are not blindly copied;
- browser support for opening local `file:` documents and cross-origin API requests is governed by the browser and Civitai's CORS policy.

## Accessibility

The interface uses semantic headings, landmarks, forms, a skip link, visible focus, minimum touch targets, live status regions, keyboard-operable drop and dialog controls, responsive layouts, reduced-motion support, forced-color support, and light/dark themes. Generation, Resources, Other metadata, and Review are real ARIA tabs with Left/Right/Home/End keyboard navigation, so only one compact editor section is shown at a time. The welcome content is removed after the first image opens so the editor begins in the first working viewport; desktop preview and editor panes scroll independently, while narrow screens place the editor before the preview rail and keep Add/Clear actions in the header. Images do not need a successful preview to be edited.

## Development

The distributed HTML has no runtime dependencies. Node is used only to assemble and test the single-file release.

```powershell
node scripts/build.mjs
node --test
node scripts/verify-build.mjs
```

Or run the combined checks:

```powershell
npm test
npm run verify
```

`npm run package` creates both release files. `npm run verify` rebuilds them, checks the HTML CSP and accessibility contracts, opens the ZIP structure, and proves the archived HTML is byte-identical to the standalone file. The build concatenates reviewed source modules, embeds the CSS, computes the exact inline-script CSP hash, and writes `dist/civitai-metadata-studio.html`. Tests cover standard hash vectors, strict AIR parsing, A1111 prompt boundaries, EXIF Unicode, byte-identical PNG IDAT / JPEG scan / WebP VP8L preservation, 8K containers, queue removal, active ComfyUI graph traversal, identity deduplication, API batching/caching/rate limits, ZIP structure, and the portable build CSP.

For corpus and live-API regression:

```powershell
npm run regression -- --root "C:\path\to\images" --rewrite-per-format 3 --live-api 20 --name-search 10
npm run regression:civitai -- --images 8 --versions 20
npm run regression:sidecars -- --root "C:\path\to\paired-images-and-json"
npm run regression:public-images
npm run regression:model-families
npm run discover:civitai-users -- --users "lonecatone23,Liant" --candidates 20 --top 8
npm run audit:civitai-contract
```

The corpus runner scans supported images, detects prompt-setting leakage, and rewrites the largest sample of each format in memory to compare dimensions, encoded pixel/frame chunks, and resource identities after reopening. The paired runner also proves that embedded ComfyUI prompt graphs match adjacent JSON sidecars. The contract audit checks the current version, direct-hash, multi-candidate batch-hash, and image endpoints without writing credentials or remote metadata to the browser cache.

The public-workflow suite uses pinned complex Civitai originals with output-bound graphs, inactive branches, nested Power LoRA controls, and Lonecat's 119-node multi-switch workflow. The user-discovery runner samples unique public posts across a creator's current API window without retaining the images locally. The model-family suite reads Civitai's current official base-model registry, runs every label through API normalization, canonical merge, manifest export, and preservation checks, then verifies ten live checkpoint versions through one batched application request.

## Source layout

```text
src/
  core/       canonical record, parsers, EXIF, hashing, Civitai API, ZIP
  formats/    PNG, JPEG, and WebP container readers/writers
  app/        state, rendering, and browser event wiring
scripts/      deterministic portable build and release verification
tests/        synthetic, pixel-payload-preservation fixtures
docs/         audit and design rationale
dist/         the ready-to-open portable HTML
```

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) for the privacy and verification requirements applied to changes. Civitai Metadata Studio is available under the [MIT License](LICENSE).
