# Where the Studio goes next

The priority is a trustworthy everyday tool: clear evidence, preserved originals, practical accessibility, and a portable browser experience. This roadmap is directional—not a delivery schedule or a promise that every idea will ship.

## How to read it

- **Now:** bounded work actively being prepared or verified.
- **Next:** worthwhile candidates with a clear validation goal; order can change.
- **Explore:** a question to investigate before committing to architecture or behavior.
- **Done:** published and checked, with remaining limitations stated separately.

No dates are invented to make the board look busy. Use [Ideas](https://github.com/chriscollins500/civitai-metadata-studio/discussions/categories/ideas) to discuss an outcome and [Issues](https://github.com/chriscollins500/civitai-metadata-studio/issues) for an actionable reproduction/proposal. The [public roadmap board](https://github.com/users/chriscollins500/projects/1) is the live planning surface; this document explains its priorities and boundaries.

## Current direction

| Horizon | Work | What would count as progress? |
| --- | --- | --- |
| Done | Public project foundation | Support/forms, maintenance checks, protected release paths, and the byte-verified hosted entry point; see [setup PR](https://github.com/chriscollins500/civitai-metadata-studio/pull/2). |
| Next | Browser portability evidence | Named current-browser/OS runs that distinguish actual coverage from portability aspirations. |
| Next | Accessibility review | Manual keyboard and representative screen-reader checks, with concrete issues and retest evidence. |
| Next | Complex workflow fixtures | Small, shareable tests for new loaders/switches, inactive branches, multi-output ambiguity, and identity conflicts. |
| Explore | Explicit image/JSON sidecar pairing | Determine a user-controlled association and conflict/privacy model before adding browser import. Not currently implemented. |
| Explore | Better unresolved-resource explanations | Improve actionable diagnostics without guessing IDs or turning name similarity into proof. |

## Already available

The 1.0.0 product provides a portable HTML editor, 16 generation fields, 14 resource roles, exact Civitai verification, bounded identity caching, new-copy payload-preserving exports, and optional local HTTP/MCP automation. The [wiki](https://github.com/chriscollins500/civitai-metadata-studio/wiki) explains the implemented details and limitations.

## What will not be traded away

No hidden image/prompt uploads. No filename-based identity guesses. No overwrite mode for originals. No recompression disguised as metadata editing. No silent dependency or permission expansion. No universal browser/accessibility claims based on a handful of automated tests.

New formats, workflow rewrites, provider writes, remote automation, or a different application architecture need explicit design/review. A roadmap card does not authorize any of those changes by itself.
