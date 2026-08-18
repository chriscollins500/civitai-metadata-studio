# Security and privacy notes

## Local-first boundary

The application has no server component. Image and model-file bytes are processed by browser APIs and are never sent to Civitai. Automatic lookup transmits only resource hashes or numeric model-version IDs. SHA-256 values and model-version IDs are batched before lookup to minimize requests. Name text is transmitted only after the user presses **Search Civitai**. The explicit image importer sends only the public Civitai image ID entered by the user.

The HTML Content Security Policy blocks external scripts, styles, workers, frames, forms, plugins, and arbitrary network destinations. The sole network destination is HTTPS on `civitai.com`; Blob URLs are permitted for local previews and downloads.

Public Civitai identity responses are cached as a disposable performance optimization. IndexedDB is bounded to 16 MiB, 2,000 model versions, or 50,000 records; a smaller local-storage cache and then an in-memory cache are used when IndexedDB is unavailable. Cache records can contain public hashes, IDs, resource names, trained words, creator names, and license flags, but never image bytes, prompts, workflows, local paths, model-file bytes, API keys, or tokens. Civitai image prompt/metadata responses are never placed in the persistent cache. Cache failures and eviction are nonfatal, and the cache can be cleared without changing source images or exported identities.

## Untrusted metadata

Metadata is treated as untrusted input:

- metadata text has bounded decoding limits;
- JSON is parsed, never evaluated; the ComfyUI compatibility repair only replaces bare non-finite number tokens outside quoted strings before parsing;
- dynamic interface content is inserted with `textContent`, not HTML parsing;
- no `eval`, `Function`, `document.write`, or external runtime code is used;
- PNG, JPEG, WebP, TIFF/EXIF, and RIFF lengths and offsets are checked before use;
- compressed PNG text is rejected if its expanded value exceeds the metadata limit;
- Civitai responses are streamed into a bounded buffer and schema-checked;
- batched verification is chunked, cached, and coalesced; a rate-limit response is never retried and immediately starts one shared bounded cooldown;
- persistent cache records are schema-checked, size-bounded, time-limited, and written transactionally;
- Civitai URL parsing requires the exact approved hostname boundary;
- local filenames are reduced to basenames before reports or output names are generated.

Original ComfyUI JSON is deliberately preserved unchanged inside its original image carrier. It may itself contain local path text, but it remains local and is never included in an API request. New Civitai/A1111 projections use sanitized resource basenames.

## Identity integrity

Filename and name matches never count as verification. Hash responses must contain the queried hash in a returned file record. Model-version responses must return the requested version ID. Hash candidate sets are narrowed by compatible resource role and exact file evidence; ambiguity remains a conflict. Existing ID/hash conflicts are shown and are not silently overwritten.

Malformed AIR values warn instead of crashing. Their raw value is retained, but IDs are not inferred from a malformed AIR.

Every active resource remains available in structured metadata with its evidence and diagnostics. Only positively verified, role-compatible resources enter parser-facing A1111/Civitai compatibility fields.

## Output safety

The application cannot alter an input `File`. It always creates a new Blob download. Encoded image and animation payload chunks are sliced from the source into the new container; they are not passed through a canvas or image encoder.

Privacy-sensitive GPS directories, device/lens serials, and MakerNotes are not copied into rebuilt EXIF. Unknown private metadata is removed by default.

## Reporting a problem

Keep private images, API keys, passwords, recovery codes, and identifying metadata out of issue reports. A minimal synthetic file and the exported audit report are preferred.
