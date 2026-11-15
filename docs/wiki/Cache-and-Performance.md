# Fast repeat lookups, bounded storage

**Outcome:** understand the IndexedDB cache, why it is safe to clear, and what it does not save.

Studio caches public identity evidence so the same model does not require fresh requests for every image or field. IndexedDB provides asynchronous, indexed storage without turning the portable app into an installed service.

## Storage tiers

| Tier | Bound | Behavior |
| --- | --- | --- |
| IndexedDB | 16 MiB, 2,000 versions, or 50,000 records | Primary persistent public-identity cache; any bound can trigger pruning. |
| Local storage fallback | 250 records | Used when IndexedDB is unavailable. |
| In-memory fallback | 512 records | Disposable for the current page/process. |
| Individual cache record | 4 MiB | Oversized entries are not accepted as normal cache data. |

Expired entries are removed and least-recently-used data is pruned in coherent version groups. Algorithm-qualified keys prevent an eight-character CRC32 value from colliding with an AutoV1 value of the same text. Legacy cache data is migrated where supported.

## Freshness

| Result | Lifetime |
| --- | --- |
| Positive exact identity | 7 days |
| Negative lookup | 15 minutes |
| Explicit name-search result | 10 minutes |
| Live enum reference | 15 minutes in memory |

The cache is an optimization, not an immutable mirror of Civitai. Listings, access, licenses, and availability can change. Read the live resource page before relying on a publication or licensing decision.

## What is never cached here

Image bytes, model-file bytes, prompts, workflows, local paths, credentials, and editing history. Public-image imports are not stored as a persistent prompt archive. The cache does not restore unsaved work after a refresh.

## Why API usage stays smaller

Full SHA-256 requests are deduplicated and batched in groups of up to 20. Exact version reads and parent-model enrichment share cached and in-flight responses. A second image using the same resource can reuse that identity; there is no call per editable field.

A cold lookup can still require more than one request: candidate resolution, exact fallback, or parent-model details are different reads. A single request cannot safely prove every possible resource when the public API returns ambiguous or incomplete evidence.

## Clearing and isolation

Use the cache statistics/clear control to remove disposable identity data. This does not change images, clear the editing queue, delete exported identity JSON, or cancel the shared Civitai rate-limit cooldown.

Storage belongs to a browser profile and origin. Private browsing, storage restrictions, clearing site data, or moving between profiles can change persistence. `file:` origin behavior is browser-dependent; do not assume two copies in different locations share a cache on every OS/browser.

If storage fails or quota is denied, the app falls back rather than treating cache availability as a requirement for inspecting images.

## Practical performance tips

Use manageable batches of large images, remove finished items, and stop unneeded work. Preview decoding can fail before metadata inspection does; the parser can read file slices without decoding an entire 8K bitmap. Hashing streams chunks rather than loading model tensors. None of this promises unlimited image size or memory-free ZIP creation.

**Related:** [Civitai verification](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Civitai-Verification) · [Formats and limits](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Formats-and-Limits)
