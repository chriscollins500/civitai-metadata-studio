# Help make the record more trustworthy

You can help without being a metadata expert: report a confusing control, contribute a minimal failing workflow, improve a guide, or review the evidence behind an identity claim.

## Ask a question or report a bug

Use [GitHub issues](https://github.com/chriscollins500/civitai-metadata-studio/issues) for reproducible problems and [discussions](https://github.com/chriscollins500/civitai-metadata-studio/discussions) for usage questions and design conversations.

A useful bug report includes:

1. App version and whether you used the portable HTML, HTTP, or MCP.
2. Browser/OS or Node/client versions.
3. Exact steps, expected outcome, and actual outcome.
4. Format and whether verification/import was involved.
5. A minimal synthetic fixture or redacted description of the relevant graph/evidence.
6. Relevant warning/problem codes, without tokens or private metadata.

Browser audit reports can include full prompts. Review every attachment before posting. Never include session cookies, passwords, API keys, recovery codes, private paths, or personal images merely to make a report easier to reproduce.

## Before a code change

Read the existing architecture and real artifacts first. Keep the dependency-free portable HTML and shared engine. Discuss architecture changes, new dependencies, formats, provider writes, or a remote service before implementing them.

Preserve these boundaries:

- One canonical record feeds supported projections.
- Exact evidence establishes identity; names alone do not.
- Actual pixels initialize dimensions; editable metadata does not resize them.
- Originals and encoded image/animation payloads remain unchanged.
- Original ComfyUI carriers remain byte-preserved.
- No private bytes/prompts/workflows/paths/credentials enter the identity cache or automatic network requests.
- A Civitai 429 is not retried; cooldown is shared.
- Untrusted metadata is parsed, never executed or inserted as HTML.
- Inactive workflow branches do not become resource claims.
- Keyboard access, visible focus, and responsive controls remain usable.

## A focused pull request

Use a descriptive branch and explain the user-visible problem, evidence, implementation boundary, and regression. Prefer small, reviewable changes over parallel implementations. Do not commit personal test corpora, generated support logs, credentials, or unrelated workspace edits.

For behavior changes, run syntax/core/release gates plus risk-appropriate browser, companion, and corpus tests. Report exact totals and untested surfaces. A test name mentioning “8K” or a model family is not permission to claim universal coverage.

For documentation changes, edit `docs/wiki/` and run `npm run docs:check`. The [documentation map](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Documentation-Map) explains publication to the separate GitHub wiki repository.

## License and third-party material

The repository uses the [MIT License](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/LICENSE), copyright Chris Collins. Optional dependencies retain their own licenses. Civitai models, images, and metadata may have separate terms; a displayed catalog license flag is a reference, not legal approval to redistribute media.

Contribute only fixtures and documentation you are permitted to share. The editor does not impose extra content-based rejection on otherwise supported user media, but that does not create rights in someone else's content.

## Release authority

Code review and tests do not themselves authorize publishing, uploading, moving tags, replacing assets, or changing credentials. A release needs a deliberate maintainer decision and final artifact validation. Wiki updates should not alter an existing application release.

**Related:** [Development and testing](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Development-and-Testing) · [Privacy and security](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Privacy-and-Security)
