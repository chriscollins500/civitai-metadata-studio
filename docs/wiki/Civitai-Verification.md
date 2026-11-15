# Civitai verification

**Outcome:** positively identify public resource claims with controlled API usage, and understand why verification sometimes remains incomplete.

## Automatic versus explicit work

Automatic verification is enabled initially and can be toggled off. It checks exact evidence discovered when images are added. Explicit **Verify with Civitai**, name search, public-image import, enum refresh, and model-file hashing/verification actions are separate user actions.

Automatic lookup does not send image bytes, model bytes, prompt text, workflow JSON, or local paths. It sends exact hashes or numeric version IDs. Public parent-model IDs returned by Civitai may then be read for creator/license details. Only an explicit name search sends a name query.

## Request efficiency

The unit of work is an **identity**, not a form field.

1. Full SHA-256 values are deduplicated and prefetched in groups of up to 20.
2. One full-candidate hash request can resolve many versions/files.
3. A version-only resource goes directly to its exact version endpoint.
4. Creator/license enrichment may need one parent-model request per unique model.
5. Public identity results and negative misses are cached.
6. Concurrent identical requests share in-flight work. Canceling one consumer does not cancel another consumer still using the response.

Ten resources can therefore require one hash batch plus parent-model enrichment—not one call for each name, AIR, hash, creator, or license field. Different resources, cache expiry, and ambiguous/shared hashes can change the exact count. The status area shows request/cache information after checks.

## Endpoints used by the app

| Endpoint | Purpose |
| --- | --- |
| `GET /model-versions/{id}` | Exact version read. |
| `GET /model-versions/by-hash/{hash}` | Supported direct hash read. |
| `POST /model-versions/by-hash` | Read-only bulk full SHA-256 candidate lookup. |
| `GET /models/{id}` | Enrich an API-returned parent model's creator/license metadata. |
| `GET /models?limit=10&nsfw=true&query=…` | Explicit, inclusive name search. |
| `GET /images?imageId=…&limit=1&withMeta=true&browsingLevel=31` | Explicit public-image metadata import. |
| `GET /enums` | Explicit current type/family suggestions. |

The base is `https://civitai.com/api/v1`. The portable CSP permits HTTPS `civitai.com` as its sole network destination. Requests omit credentials and referrers, reject redirects, and decode bounded JSON. The editor has no provider API-key field.

The app does not use the lightweight `/by-hash/ids` response to declare an identity: full candidate/file evidence is needed for ambiguity and role checks. It also avoids the undocumented models-list `modelVersionIds` filter.

## HTTP 429: stop, do not spam

On a Civitai 429 response, the app does **not retry that request**. It opens one shared cooldown using `Retry-After`, bounded to at most five minutes. Further uncached requests are stopped during cooldown. Clearing the cache cannot bypass this state.

Cached results may remain usable. Wait for the displayed interval before trying again; repeated clicks do not make the provider more available. Selected transient connection/502/503/504 failures have bounded retry behavior, but that must not be confused with retrying 429.

## Why a valid-looking resource stays unresolved

- The model file was converted, quantized, modified, or never uploaded to Civitai.
- Only a name, prompt tag, or model ID is available.
- A resource/version is unavailable to anonymous public lookup.
- Several compatible files share the hash.
- The declared role disagrees with returned candidates.
- Civitai is unavailable, rate limiting, or enforcing a regional/content restriction.

Unresolved does not mean fake. Verified does not prove historical usage. Public metadata can be absent for reasons the API does not distinguish.

**Related:** [Cache and performance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Cache-and-Performance) · [Troubleshooting](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Troubleshooting). Primary source: [Civitai Site API](https://developer.civitai.com/site/), reviewed November 14, 2026.
