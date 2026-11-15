# AIR and hashes

**Outcome:** understand which identifier points to a model, version, or file, and why short hashes are not interchangeable with full hashes.

## Three IDs, three scopes

| Identifier | Identifies | Does not identify by itself |
| --- | --- | --- |
| Model ID | A parent Civitai model/project | A unique model version or exact weight file |
| Model-version ID | A specific published version | Necessarily one file among several variants |
| File ID | A particular file record | Historical use of that file in this image |

Use the version ID shown by Civitai, not an image ID, post ID, or a number found in a filename. A public image ID is used only by the explicit image-metadata importer.

## AIR structure

```text
urn:air:{ecosystem}:{type}:{source}:{id}[@{version}][+{fileId}][.{format}]
```

Illustrative syntax, not a real identity claim:

```text
urn:air:sdxl:checkpoint:civitai:12@34
urn:air:sdxl:checkpoint:civitai:12@34+56.safetensor
```

For Civitai, `12` is the model ID, `34` the version ID, and optional `56` the file ID. A file qualifier narrows the scope. Prefer the API's canonical AIR over hand construction. Ecosystem and type tokens should reflect recorded/API evidence, not a guessed spelling of a display name.

The parser preserves documented alternate/bare forms and raw provenance. A malformed AIR warns and keeps its raw text, but must not manufacture numeric IDs. Non-Civitai AIRs may be preserved; that does not make them resolvable through the Civitai Site API.

## Operational priority

The resolver's identity preference is:

**AIR / exact version ID → SHA-256 → BLAKE3 → AutoV3 → AutoV2 → CRC32 → AutoV1**

This is an operational policy, not a claim that SHA-256 is universally cryptographically stronger than BLAKE3. AIR/version references and hashes answer different questions. Supplied hashes are checked for consistency; a weaker matching hash cannot hide a stronger conflicting hash.

Network prefetch may batch SHA-256 before individual verification. That is an efficiency optimization, not a change to identity authority or proof requirements.

## Supported hash evidence

| Algorithm | Hex characters | Scope / caution |
| --- | ---: | --- |
| SHA256 | 64 | Full-file cryptographic digest; preferred exact local-file evidence. |
| BLAKE3 | 64 | Full hash evidence when supplied; not calculated by the built-in hash pass. |
| AutoV3 | 12 | Safetensors payload-derived short hash in the local implementation. |
| AutoV2 | 10 | Prefix of full-file SHA-256; useful compatibility evidence but truncated. |
| CRC32 | 8 | Error-detection checksum, not collision-resistant identity proof. |
| AutoV1 | 8 | Legacy sampled hash, not a full-file cryptographic digest. |

For a sufficiently large file, local AutoV1 samples 64 KiB starting at byte 1 MiB. The local pass computes full SHA-256, its AutoV2 prefix, CRC32, and applicable AutoV1/AutoV3 values. It does not trust a safetensors metadata field as a calculated payload hash.

Keep the algorithm name attached to the value. An eight-character CRC32 is not an AutoV1 merely because both are eight characters long. The cache separates algorithm-qualified mappings.

## A hash can have several candidates

Civitai may return multiple versions/files for identical bytes, including shared VAE files inside different parent packages. The resolver considers resource role, exact file evidence, and compatible candidates. If several compatible identities remain, it shows a conflict instead of picking one arbitrarily.

## Why A1111 may show another hash

The canonical record uses the operational priority above. The A1111 compatibility projection deliberately prefers AutoV2, then supported fallbacks. A short compatibility hash and a full canonical hash can both be correct representations of the same file.

Do not confuse an image file's own SHA-256, an API image BlurHash, and a model-file hash. Only the relevant resource hash can identify a model file.

**Sources:** [AIR documentation](https://developer.civitai.com/site/guide/air) · [Model-version API](https://developer.civitai.com/site/reference/model-versions). Implementation: [AIR parser](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/src/core/air.js), [hash pass](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/src/core/sha256.js). Reference review: November 14, 2026.
