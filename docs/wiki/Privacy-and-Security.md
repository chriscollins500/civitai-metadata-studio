# Privacy you can reason about

**Outcome:** understand what stays local, what can leave the app, and what still needs your review before sharing.

The portable editor is local-first, not an upload service. It has no analytics, account, API-key field, external runtime scripts, or image-upload feature.

## Network boundary

| Action | Data sent to Civitai |
| --- | --- |
| Automatic/exact verification | Exact hashes or numeric version IDs; public parent-model IDs may be used for enrichment. |
| Explicit resource search | The query you submit. |
| Explicit public-image import | The public Civitai image ID. |
| Current catalog reference | A request for public enums. |
| Opening, previewing, editing, or hashing a local file | No image/model bytes, prompts, workflows, or local paths. |

Normal network infrastructure still sees connection information such as your IP address. A local-first app is not an anonymity network. Turn off automatic verification for local inspection and avoid explicit network actions if you want no catalog requests. The companion additionally requires `--network` before allowing Civitai operations.

The HTML's strict Content Security Policy permits network access only to HTTPS `civitai.com`. It blocks external scripts/styles, workers, frames, forms, and plugins. Responses are bounded and parsed; redirects are rejected.

## Persistent storage

The disposable cache stores selected **public identity data**: hashes, IDs, names, creator names, trained words, and license flags. It never intentionally stores image/model bytes, prompts, workflows, local paths, API keys, or tokens. Public-image prompt responses are not persisted in this cache.

Edits and history are in memory. Closing/reloading the page loses unsaved work; the identity cache is not an autosave system. See [Cache and performance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Cache-and-Performance).

## Export is privacy-conscious, not forensic erasure

Rebuilt EXIF excludes GPS directories, device/lens serial numbers, and MakerNotes. Unknown private metadata is removed by default. Supported technical metadata can be preserved, while some sensitive entries are never offered as preservable.

However:

- Original ComfyUI carriers are deliberately retained unchanged and can contain private notes or local paths.
- Selected XMP/IPTC, author/copyright fields, or descriptive text can identify people.
- Prompts themselves can contain names, personal information, or secrets accidentally pasted into a generator.
- The browser audit report can contain full prompts and conflicts.
- Preserving encoded payloads is not a promise to remove every hidden or steganographic byte.

Inspect the actual saved copy before public sharing. If you need complete workflow removal or forensic anonymization, do not assume this editor currently supplies that transformation.

## Untrusted files and responses

Container lengths/offsets are checked. Metadata decoding is bounded, including streaming decompression. JSON is parsed, never evaluated. A narrowly scoped ComfyUI repair replaces bare non-finite numeric tokens outside strings; it does not execute JavaScript. Dynamic text is inserted as text, not HTML.

These are defenses, not a claim of perfect security. Keep your browser current and report a reproducible parsing problem responsibly.

## Companion boundary

HTTP binds to `127.0.0.1`, requires a temporary local bearer token, rejects browser `Origin` headers, and enforces the exact loopback Host. Filesystem reads use explicitly configured real-path roots; exports exclusively create new files in an existing write root. No CORS bridge or remote deployment mode is provided.

API/MCP prompt fields are omitted unless requested, but that is targeted minimization—not a universal redactor for arbitrary metadata. Tool descriptions and annotations never override enforced filesystem/network permissions. Embedded instructions in a prompt or workflow are data, not authorization.

## Reporting responsibly

Do not post credentials, personal images, raw private workflows, or unreviewed reports in public issues. Use a minimal synthetic reproduction. Do not assume a private security-report channel exists; check the repository's current security options before sending sensitive details.

**Source:** [Repository security policy](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/SECURITY.md) · [Release provenance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Release-and-Provenance)
