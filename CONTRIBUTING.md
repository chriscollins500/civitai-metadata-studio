# Contributing

Thanks for helping improve Civitai Metadata Studio. The distributed application must remain a dependency-free, portable HTML file that keeps private image data on the user's device.

## Development

Use a current Node.js release matching `package.json`. No package installation is required.

```powershell
npm run check
npm test
npm run verify
```

`npm run verify` rebuilds both files in `dist/`, validates the inline-script CSP, and proves the HTML inside the release ZIP is byte-identical to the standalone HTML.

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
