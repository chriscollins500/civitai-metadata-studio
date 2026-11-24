# Website hub: local acceptance evidence

Reviewed **2026-11-24**. This is website-change evidence, not a new application release or a universal accessibility/browser certification.

## What changed

Six connected public pages and a custom 404 replace the previous single-page introduction. One shared catalog/layout connects the hosted editor, all 28 wiki guides, learning sample, signed downloads, privacy/provenance, HTTP/MCP documentation, support, discussions, and Project #1.

The original vector/raster learning sample is synthetic: actual 768×512 pixels, deliberately incorrect 1024×1024 generation metadata, no real model identity claims or personal data. It exercises the existing editor rather than a parallel demo parser.

## Local gates

Final runs used PowerShell 7.6.9, Node.js 26.13.0, installed Chrome 158.0.8127.89, and Edge 158.0.4370.33 on Windows. No packages or browsers were installed or updated for this change.

| Gate | Result |
| --- | --- |
| Source syntax | 83 modules checked |
| Wiki | 28 pages, 2 navigation files, 149 internal links, 4 JSON examples |
| Core/documentation/community | 119 passed, 0 failed, 0 skipped |
| HTTP/MCP/managed SDK | 117 passed, 0 failed, 0 skipped |
| Site packaging/security/navigation | 19 passed, 0 failed, 0 skipped |
| Chrome/Edge browser suite | 80 passed, 0 failed, 0 skipped |
| Portable HTML, ZIP, and checksum verification | Passed; original 1.0.2 bytes retained |

The initial sandbox run could not create Windows junction fixtures or start Edge. The complete final runs were repeated outside that sandbox; those cases executed and passed. No production protection was disabled.

GitHub's initial PR review additionally identified double entity decoding, an incomplete script-tag check, and a loose URL assertion in the new checker/tests. These were corrected with single-pass decoding, an exact serialized-script contract, URL-origin/path validation, and focused nested-entity/end-tag/lookalike-host regressions before merging. The checker's reviewed-build contract is not a general HTML sanitizer.

Browser profiles cover Chrome/Edge at 1440×1000 and Chrome at 390×844 and 2560×1440. Website checks additionally exercise 320px and doubled root text size on each main page, both themes' text-token contrast, keyboard search/focus return, ARIA case-study tabs, guide/topic filtering, reduced motion, forced colors, disabled JavaScript, denied storage/clipboard, and nested 404 recovery.

All seven hub pages were screenshot-reviewed, alongside light mode and the narrow layout. Automated navigation found no page errors, CSP violations, external asset requests, or horizontal document overflow. The learning PNG downloads as an actual file; hosted editor edits/save/reopen preserve its encoded-payload digest. Existing PNG/JPEG/WebP, malformed-input, mocked identity/cache, and cooldown browser regressions remain included.

## Deployment contents and budgets

The final local output is **20 allowlisted files, 907,527 bytes total**, including the unchanged 401,007-byte app and public OpenAPI document. The optional site script is **5,439 bytes**, CSS **20,513 bytes**, and the largest hub page **34,674 bytes**. These are raw UTF-8/file sizes, not transfer-compression or Lighthouse scores.

The checker validates 215 local links, cross-page fragments, canonical/social URLs, accessible references, exact CSS/JS SRI, asset receipts, guide inventory, local-only scripting, theme-only storage, and the generated-file boundary. Budgets remain 32 KiB each for CSS/JS, 64 KiB per hub page, and 2 MiB total. No private tree is recursively published.

## Preserved release

Reproducible local commands used `SOURCE_DATE_EPOCH=1794873600` so the existing UTC build date **2026-11-17** remains unchanged.

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| civitai-metadata-studio.html | 401,007 | `62e35b46a75e6344d2827afd62934d70c43e7a185d70f5007cdd104e5e758cd9` |
| civitai-metadata-studio.zip | 89,711 | `bf0ca437e70979feb34c5e9bcad9a2aea02ac9b2c9d4ae3bcf8c33e1b2617cb2` |
| SHA256SUMS.txt | 189 | `2b9abb917158657b641d9d2690c3604f7351c8daf97adcd386342cdecd576109` |

The ZIP contains exactly one HTML entry with the same digest as the standalone HTML. Its inline-script CSP still verifies as `sha256-QueFzdpDQsTl222v39gVPsbu9OjIXXJcD4Z1vYVDUC0=`. Existing GitHub/Sigstore release attestations remain separate from the website's current-build manifest; this PR does not sign the hub or issue another app release.

## Remaining boundaries

No Safari/macOS, physical phone, or manual screen-reader certification is claimed. Narrow Chrome emulation is not a physical mobile-device run. Token contrast checks are not a complete WCAG audit. Live Civitai corpus regressions were not rerun: the metadata engine, app bytes, dependencies, and provider contracts are unchanged. No private image library was scanned or published.

Windows/Linux Node.js 24/26 CI and CodeQL must pass on the exact PR head before merging. After deployment, compare the live site files and hosted app with the verified output, then synchronize the separately versioned wiki, existing roadmap, and pinned discussion bodies without overwriting intervening edits or historical evidence. See [repository operations](repository-operations.md).
