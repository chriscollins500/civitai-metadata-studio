# Find the cause before changing the evidence

Start with the app version, format, source labels, **Review** warnings, and whether the issue happens before or after verification. Keep your original file.

## Common symptoms

| Symptom | What to check | Next action |
| --- | --- | --- |
| Negative prompt repeats positive | Supported empty/zero conditioning, selected output, conflicting structured metadata. | Inspect provenance; report a minimal workflow if the active path is misread. |
| Disabled LoRA appears | Actual node/slot enabled state, switch control, saved graph versus current unsaved ComfyUI state. | Compare the embedded graph, not only today's canvas; include relevant node classes in a report. |
| Verified and unresolved copies coexist | Conflicting hash/ID/role/strength, missing alias evidence. | Compare both entries before deleting one. Similar names alone are not proof they are identical. |
| AIR is present but a hash is the match evidence | Raw AIR, parsed canonical AIR, and the successful lookup method are separate facts. | Check AIR diagnostics, version/file qualifiers, and resource compatibility. |
| Resource stays unresolved | Missing exact evidence, unavailable anonymous API, ambiguous candidates, role mismatch. | Supply a known exact AIR/version/hash or hash your local model; do not guess an ID. |
| Width/height look unexpected | Actual dimensions take priority on every open. | Edit metadata deliberately if needed; this never resizes pixels. |
| Save is unavailable | Validation errors or queued/active inspection, verification, or hashing anywhere in the batch. | Finish/stop work and fix invalid values. |
| More images keep accumulating | Saving leaves the workspace intact. | Use Remove, Clear, or Clear all. |
| JSON sidecar is not imported | Browser identity import accepts a specific Studio schema, not arbitrary workflow JSON. | Use supported embedded metadata; developer sidecar scripts are separate. |
| Reopened graph still has old prompt | Original ComfyUI carriers are intentionally unchanged. | Read the new canonical generation metadata; graph rewriting is not supported. |
| Preview fails on a huge image | Browser decode/memory limits may differ from metadata parser limits. | Inspect metadata if available; use smaller batches or a browser with more resources. |
| Cache seems empty in another browser | Browser/profile/origin storage isolation. | Reverify or exchange identity JSON explicitly. |

## Network and rate limits

A Civitai **429** starts one shared cooldown. Studio does not retry that response. Wait for the displayed cooldown; repeatedly pressing Verify or clearing the cache is not a bypass. Cached identities may still be usable.

An unavailable image/version is not proof that your metadata is fraudulent. Anonymous access, visibility, removal, regional availability, or an upstream outage can affect reads. Check the public resource page and the exact identifier. Never paste account cookies or API keys into an issue to “fix” anonymous lookup.

Connection failures and selected gateway/server errors have bounded retry behavior; they are not treated as successful identity evidence. A redirect or oversized response is rejected rather than followed without limits.

## Companion problems

| Error/state | Meaning |
| --- | --- |
| Startup rejects token | Set a temporary `STUDIO_API_TOKEN` of at least 24 characters; never print or commit it. |
| `invalid_host` / `origin_denied` | Use the printed `127.0.0.1:port` address from a local non-browser client. `localhost` is not interchangeable here. |
| `revision_conflict` | Read the current session, review changes, and use its latest revision. Do not blindly resend a stale edit. |
| `idempotency_conflict` | The same key was reused for different arguments. Use one key per intended operation. |
| `request_limit` | Local 120-per-minute budget, distinct from Civitai's cooldown. |
| `busy` | Active-operation limit reached; reduce client concurrency. |
| Missing/expired session | Reopen the source file; idle sessions expire and process restarts discard them. |
| Existing output refused | Choose a new filename; overwriting is deliberately unsupported. |
| MCP initialization fails | Confirm client support for protocol 2026-07-28 and official-client version negotiation. |

## A useful issue report

Provide app version, browser/OS versions, format, expected versus actual behavior, reproduction steps, and a minimal synthetic fixture if possible. Review any audit JSON before attaching it: browser reports can contain full prompts. Avoid private paths, identifying metadata, credentials, and unlicensed personal media.

**Next:** [Support and contributing](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Contributing-and-Support) · [Capabilities and limitations](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Capabilities-and-Limitations)
