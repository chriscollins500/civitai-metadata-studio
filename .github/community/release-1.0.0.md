# Meet Civitai Metadata Studio 1.0.0

**A private browser workbench for the story inside your AI images.**

Open a PNG, JPEG, or WebP. Read its prompts, settings, resource identities, and supported workflow evidence. Correct the record. Save a new copy without re-encoding the supported image or animation payload.

[Try the editor](https://chriscollins500.github.io/civitai-metadata-studio/app/) · [Download the portable HTML](https://github.com/chriscollins500/civitai-metadata-studio/releases/tag/v1.0.0) · [Read the complete wiki](https://github.com/chriscollins500/civitai-metadata-studio/wiki)

## What's inside

- Sixteen editable generation fields, initialized with actual pixel dimensions.
- Fourteen resource roles, exact Civitai identity evidence, and clickable resource pages.
- Supported active ComfyUI branch handling, including disabled-resource and empty-conditioning semantics.
- A queue, current-image/batch saves, keyboard navigation, command palette, and reversible edit history.
- Bounded public identity caching and shared rate-limit handling—not an API call per field.
- Optional local HTTP/MCP automation using the same engine, with explicit roots, revisions, and new-file-only export.
- A 28-page wiki, troubleshooting paths, and download-verification instructions.

## Your originals remain the reference

The editor is not an image generator, resizer, or visual editor. New metadata does not prove historical resource use. Original ComfyUI carriers remain unchanged and can contain private information; review exported copies and reports before sharing.

The browser needs no installation or account. The optional companion needs Node.js 24+ and its pinned packages. Exact catalog reads need network access; local inspection/editing/saving can be done offline with the downloaded HTML.

## Verify the download

The release assets have checksums and GitHub/Sigstore build attestations. Follow [Release and provenance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Release-and-Provenance) to verify the repository/workflow identity and artifact bytes. Provenance is not an Authenticode signature or a malware-safety guarantee.

This announcement introduces the existing 1.0.0 release and new public project resources. It does not replace its assets, move its tag, or claim a new application version.

## Help shape what comes next

Ask in [Q&A](https://github.com/chriscollins500/civitai-metadata-studio/discussions/categories/q-a), report a reproducible issue, or discuss an idea. The [roadmap](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/ROADMAP.md) prioritizes concrete validation and careful exploration over invented delivery dates.
