# Build confidence in the artifact people use

**Outcome:** run the right checks and distinguish source tests from a verified portable deliverable.

Use Node.js **24+** from the repository root. The main product has no runtime dependencies; only optional automation/browser testing uses the separately pinned `automation` packages.

## Core workflow

```powershell
npm run check
npm test
npm run verify
```

`check` syntax-checks source/scripts/tests. `test` rebuilds the HTML before running Node tests. `verify` rebuilds, packages, checks the HTML/CSP, and verifies release ZIP/checksum consistency. Read the actual pass/fail counts; a completed command is not evidence that an unrun browser or corpus test passed.

For the companion and installed Chrome/Edge:

```powershell
npm ci --prefix automation --ignore-scripts
npm run sdk:check
npm run test:automation
npm run test:browser
```

The browser configuration uses installed browsers, not an automatic browser download. Test the **built HTML**, including real new-copy downloads and reopening, rather than only mocking the source API.

`sdk:check` verifies the integrity-pinned development-client repack and all 102 installed SDK file hashes; it does not modify dependencies. Maintainers can run `npm run sdk:repack` to reproduce the archive from its verified upstream input. That reproduction makes a bounded upstream download and is not required to open the portable editor. See the [managed SDK recipe](https://github.com/chriscollins500/civitai-metadata-studio/blob/v1.0.1/docs/managed-sdk-patch.md).

## Match additional checks to the risk

| Change | Additional command / evidence |
| --- | --- |
| Container rewriting, dimensions, privacy, resource round trips | `npm run regression -- --root "C:\TestImages" --rewrite-per-format 3` |
| Exact Civitai behavior | `npm run regression:civitai -- --images 8 --versions 20` |
| Paired image/save-node JSON semantics | `npm run regression:sidecars -- --root "C:\PairedFixtures"` |
| Public complex workflows | `npm run regression:public-images` |
| Model-family normalization | `npm run regression:model-families` |
| Live endpoint contract | `npm run audit:civitai-contract` |
| Wiki links/coverage | `npm run docs:check` |

Example roots are placeholders. Supply an explicitly selected corpus; never scan unrelated personal folders or claim unnamed corpus coverage. Live catalog scripts make bounded network requests and use Node's system trust. Do not disable TLS verification or bypass a 429.

## Regression expectations

Use minimal synthetic fixtures for parser bugs. A disabled-LoRA report needs an active-output fixture showing that disabled branch; a duplicated-negative report needs the empty/zero conditioning semantics. A source patch without a focused regression is weak evidence.

For writers, compare protected payload bytes/hashes and original ComfyUI carriers, reopen every selected format, inspect validation, and ensure originals remain unchanged. Include malformed lengths, oversized metadata/decompression, conflicting identity evidence, and unavailable API cases.

For UI, test keyboard paths, dialogs/focus, narrow/wide geometry, long content, busy/cancel states, queue removal, history, current-only/batch save, and actual exported copies. Combine screenshots with measured overflow evidence; screenshots alone can hide clipped offscreen controls.

## Evidence snapshot, not an eternal score

### Release 1.0.2 · November 17, 2026

The release gates run **116 core + 117 automation/MCP + 5 site tests** (238 total), plus **36 Chrome/Edge checks per Windows/Linux × Node.js 24/26 configuration**. That is **274 tests per OS/runtime combination**. All suites, reproducible SDK/clean-install checks, artifact verification, and CodeQL must pass before publication. The [release record](https://github.com/chriscollins500/civitai-metadata-studio/releases/tag/v1.0.2) supplies the successful tag run and exact source commit; the [versioned notes](https://github.com/chriscollins500/civitai-metadata-studio/blob/v1.0.2/docs/releases/v1.0.2.md#validation-and-exact-files) pin the artifact hashes.

Fourteen focused wiki regressions cover the single-pass heading scanner. The browser cooldown test exposes the mocked `Retry-After` header and advances a fixed clock, so its result does not depend on runner speed. Final ZIP-extracted HTML checks exercise PNG, real browser-encoded JPEG/WebP, edited new-copy exports, reopened metadata, and encoded-payload preservation in Chrome and Edge. CI and draft downloads must match the frozen final bytes before publication.

These are automated checks, not human usability, manual screen-reader, Safari/macOS certification, real-provider OAuth interoperability, or a fresh Civitai/private-image corpus run. The browser behavior and dependencies are unchanged apart from version reporting.

### Released 1.0.1 · November 15, 2026

The [release-tag CI run](https://github.com/chriscollins500/civitai-metadata-studio/actions/runs/43697086790) passed **102 core + 117 automation/MCP + 5 site tests** (224 total), plus **36 Chrome/Edge checks per configuration**, on both Windows and Linux with Node.js 24 and 26. The SDK archive reproduced byte-for-byte in each configuration. There were no failed or skipped tests. Conditional website jobs were intentionally skipped for the tag run; they are not missing tests.

The final ZIP-extracted HTML was also tested directly in Chrome and Edge on Windows: synthetic image import, edit, new-copy export, reopen, encoded-pixel preservation, and measured overflow checks passed. Frozen local, CI, draft-download, and published-download bytes matched. All three public asset attestations verified against the exact tag and source commit; a modified-copy control was rejected. [Exact files and release boundaries](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Release-and-Provenance#v101-release-evidence).

These are automated release checks, not human usability, manual screen-reader, Safari/macOS certification, real-provider OAuth interoperability, or a new live Civitai corpus run. Future source changes can alter test totals; use the actual run rather than repeating this snapshot as a permanent score.

### Historical 1.0.0 coverage

The pre-wiki 1.0.0 snapshot recorded **86 core**, **12 automation**, and **36 browser checks** passing. The earlier [original 1.0.0 report](https://github.com/chriscollins500/civitai-metadata-studio/blob/v1.0.0/docs/validation-1.0.md) records its own test inventory and limitations. Neither is the 1.0.1 release gate.

Public regression coverage included a complex 119-node graph and structural normalization of 121 model-family labels. A family-label test is not proof that real images from every family were generated or tested. A synthetic 8192×8192 PNG is not universal 8K coverage. Current test totals can grow after that snapshot; report the actual run.

## Reproducible builds

The HTML embeds a UTC build date. Ordinary builds use today's UTC date. For release reproduction, set a reviewed whole-second `SOURCE_DATE_EPOCH` matching the recorded build date; CI validates it before attesting. Text inputs are normalized to LF to avoid platform line-ending drift.

After the final build, record version, date, byte count, SHA-256, CSP result, ZIP entries, and the SHA-256 of the HTML inside the ZIP. It must match the standalone HTML. Do not reuse an old remembered digest after rebuilding.

## Documentation-only changes

Wiki sources live in `docs/wiki/`; their checker validates navigation and contract coverage without rebuilding the application. Documentation publication must not quietly change release bytes or retag an existing release. Follow the [documentation maintenance guide](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Documentation-Map).

**Related:** [Release and provenance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Release-and-Provenance) · [Architecture](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Architecture-and-Data-Model)
