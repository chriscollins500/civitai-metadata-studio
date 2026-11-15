# Security and privacy notes

## Local-first boundary

The portable HTML has no server component. The optional local automation companion is described below. Image and model-file bytes are processed locally and are never sent to Civitai. Automatic lookup transmits only resource hashes or numeric model-version IDs. SHA-256 hashes are batched, and exact version reads share cached and in-flight responses. Name text is transmitted only after an explicit search. The explicit image importer sends only the public image ID, with full metadata requested.

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

## Optional automation companion

The HTTP API binds only to `127.0.0.1`. CLI startup requires `STUDIO_API_TOKEN` in the process environment; the documented setup generates a random value without printing it. Tokens are never logged or persisted. Programmatic callers may supply a token directly or use the in-memory generated token returned by `createApi`. Host headers must match the active loopback address; requests carrying an Origin header are rejected. No CORS access is granted. JSON body limits, request/connection/concurrency bounds, and request timeouts apply. HTTP errors omit stack traces and local paths.

File reads require explicit roots, resolved through `realpath`. Symlinks outside those roots, device paths, and NTFS alternate streams are rejected. Exports require an existing write root, a same-format plain filename, and exclusive creation (`wx`). Originals and existing outputs are never overwritten. Exports are reopened and their encoded pixel/frame SHA-256 is compared before a file is created. Partial files from a failed write are removed only when that operation created them.

Sessions and editing history are held in memory and bounded. Idle sessions expire. Prompt fields are omitted from API/MCP reads and reports unless explicitly requested. Revisions guard mutations, atomic edits roll back on validation failure, and changing resource evidence clears previous verification proof. API idempotency keys reuse results briefly in memory; no request bodies are logged or persisted.

Civitai access is disabled unless `--network` is configured. Requests still use only the original fixed Civitai endpoint; redirects are rejected, provider requests have deadlines, and the shared 429 cooldown survives cache clearing. API/MCP configuration never enables provider writes, downloads, cloud generation, or credentials.

The official MCP SDK implements current stdio and Streamable HTTP transport. Stdio stdout is reserved for protocol traffic. Embedded metadata is untrusted evidence, never an instruction or an authorization grant. MCP tool annotations are hints; actual filesystem and network restrictions are enforced by the shared service.

The repository's development client has a [managed patch](docs/managed-sdk-patch.md) for the exact `@modelcontextprotocol/client@2.4.0` stdio modules. It uses native `node:child_process.spawn` and accepts only `command === process.execPath`; bare commands, shell shims, and other executables are rejected before spawning. Both input files and expected outputs have reviewed SHA-256 checks. Version/source drift stops preparation before either module is changed. The patch uses an exclusive lock, same-directory replacement, and rollback that preserves unknown concurrent edits. It runs explicitly, never as an installation hook. This does not patch external MCP hosts, the server SDK, HTTP transport, or the browser artifact, and does not remove the upstream SDK's declared legacy helper packages from the lockfile.

## Reporting a problem

For a suspected vulnerability, use [GitHub's private vulnerability reporting form](https://github.com/chriscollins500/civitai-metadata-studio/security/advisories/new). Private reporting is enabled for this repository. Do not open a public issue containing exploit details, leaked credentials, private files, or identifying metadata.

Include the affected version/interface, expected versus observed security boundary, a minimal synthetic reproduction, and impact. Share only what is necessary; never include a working personal token, session cookie, recovery code, or unrelated user data. There is no guaranteed response time or paid bug bounty. Please coordinate public disclosure through the private report rather than publishing sensitive details while a fix is being investigated.

Ordinary bugs and usage questions belong in the [support channels](SUPPORT.md). Browser audit reports can contain full prompts and conflicts: inspect/redact them before any public attachment. API/MCP prompt omission does not sanitize every arbitrary metadata string.

## Release provenance

The official CI workflow attests the portable HTML, ZIP, and checksum manifest using GitHub's Sigstore integration. A dedicated Ubuntu job holds short-lived OIDC and attestation-write permissions only for version-tag builds or an explicit manual run on main, after both platform test jobs pass. Pull requests and ordinary branch pushes do not sign artifacts. No long-lived signing key or new repository secret is used.

Manual attestation of an existing release requires its tag to match package.json, regenerates the recorded build date through SOURCE_DATE_EPOCH, and compares GitHub's published asset sizes/digests and actual downloaded bytes with the tested rebuild. A mismatch stops signing. The workflow cannot overwrite release files or move tags; its contents permission is read-only.

An attestation authenticates build origin, not safety or Windows/macOS publisher trust. Consumers should verify the repository, signer workflow, and optionally the source commit. See [download verification](docs/provenance.md).
