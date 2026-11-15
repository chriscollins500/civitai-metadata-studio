# Contributing

Thanks for helping improve Civitai Metadata Studio. The distributed application must remain a dependency-free, portable HTML file that keeps private image data on the user's device.

New here? Start with [support](SUPPORT.md), the [wiki](https://github.com/chriscollins500/civitai-metadata-studio/wiki), or the [roadmap](ROADMAP.md). Please follow our [code of conduct](CODE_OF_CONDUCT.md). A helpful question, documentation correction, accessibility report, or minimal synthetic fixture is a valuable contribution.

## Development

Use a current Node.js release matching `package.json`. No package installation is required for the portable editor's core checks. Install the optional companion's pinned dependencies to work on the API, MCP tools, or browser regression suite.

```powershell
npm run check
npm run docs:check
npm test
npm run verify
```

`npm run verify` rebuilds both files in `dist/`, validates the inline-script CSP, and proves the HTML inside the release ZIP is byte-identical to the standalone HTML.

```powershell
npm ci --prefix automation --ignore-scripts
npm run sdk:check
npm run test:automation
npm run test:browser
```

`test:automation` verifies the [reviewed Node-only SDK repack](docs/managed-sdk-patch.md) before importing the client. A clean installation already contains the native patch; it does not need a post-install repair. There are no installation hooks. The suite blocks all six removed standalone spawning packages to detect fallback. CI reproduces the pinned SDK, performs clean installations, and runs the full project plus browser checks on Node.js 24 and 26 on both Windows and Linux. It provisions current Chrome/Edge only on the disposable CI runners; local tests use installed browsers.

For SDK maintenance, `npm run sdk:repack` verifies byte-for-byte reproduction from the exact integrity-pinned upstream download. Only use `npm run sdk:repack -- --write` after reviewing a source/profile update; commit the archive, generated provenance/file hashes, and updated lockfile together. Never change expected hashes solely to silence a failure. Playwright's package, configuration, and internally bundled code are not part of this repack.

The optional companion shares `src/engine.mjs` with the portable build. Keep operation validation in `automation/schemas.mjs`; regenerate the public OpenAPI description with `npm --prefix automation run schema`. Never introduce a second parser, metadata record, or writer for automation. Maintain explicit read/write roots, local authentication, revision checks, bounded state, network opt-in, and new-file-only exports.

## Required invariants

- Keep one canonical metadata record for A1111, EXIF, Civitai, ComfyUI, and sidecar projections.
- Never infer a Civitai model or version ID from a name or filename.
- Start editable dimensions from the image's actual pixels.
- Preserve encoded PNG, JPEG, WebP, and animation payloads during metadata-only export.
- Do not transmit or persist image bytes, prompts, workflows, local paths, credentials, or tokens.
- Exclude bypassed, inactive, disabled, disconnected, and unresolved-switch resources.
- Do not retry HTTP 429 responses; honor one shared bounded cooldown.
- Preserve accessible names, keyboard operation, visible focus, and responsive behavior.

## Test data and reports

Do not commit personal images, private prompts, local workflows, machine paths, API credentials, or identifying metadata. Prefer synthetic fixtures. If a real artifact is essential to reproduce a defect, reduce it to the smallest safe test case before proposing it.

When reporting a bug, include the application version, browser, image format, observable behavior, and a minimal reproduction. Do not post private source files in a public issue.

## Pull requests and maintenance

Use a focused branch and explain the user-visible outcome, shared implementation boundary, regression evidence, and untested surfaces in the pull-request template. Identity/privacy/payload invariants need tests, not just reassuring descriptions. PRs should pass the required Windows/Linux checks before merging. A second-person approval is not mandatory while the project has a solo maintainer; that does not make CI optional.

Dependabot proposes weekly grouped minor/patch updates for `automation/` and GitHub Actions. Major updates remain separate review decisions. Dependencies stay pinned, Actions stay pinned to immutable commits, and no dependency PR is automatically merged. Security-update PRs remain distinct from routine version maintenance.

Changes to the landing page use `npm run site:build` and `npm run site:check`; see [repository operations](docs/repository-operations.md) for hosting, protections, release immutability, and community maintenance. Deployment/publication is a deliberate maintainer action, not a side effect of submitting a PR.
