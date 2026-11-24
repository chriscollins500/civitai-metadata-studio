# Keep the public project dependable

This is the maintainer handbook for repository configuration, community intake, the hosted editor, and release protections. Application internals live in the [wiki](https://github.com/chriscollins500/civitai-metadata-studio/wiki); user help starts in [SUPPORT.md](../SUPPORT.md).

Configuration sources are reviewed with the code. Live GitHub settings are separate state: verify them after applying changes rather than assuming a committed JSON file enforced anything.

## Public surfaces

| Surface | Purpose | Source or maintenance point |
| --- | --- | --- |
| README | Friendly explanation and primary links. | `README.md` |
| GitHub Pages | A learning/download/trust/developer/community hub and the real browser editor. | `site/`, `scripts/build-site.mjs`, CI Pages jobs |
| Wiki | Layered user, automation, and maintainer reference. | `docs/wiki/`; separate native wiki Git repository |
| Issues | Reproducible bugs, identity mismatches, concrete proposals. | `.github/ISSUE_TEMPLATE/` |
| Pull requests | Reviewable implementation and exact validation evidence. | `.github/pull_request_template.md` |
| Discussions | Q&A, ideas, public-safe examples, announcements. | Native categories; launch-post sources in `.github/community/` |
| Projects | Lightweight Now/Next/Explore/Done planning. | Linked public project; direction in `ROADMAP.md` |
| Security | Private vulnerability reports and public security policy. | `SECURITY.md`; private reporting enabled in settings |
| Community | Support and conduct expectations without invented response guarantees. | `SUPPORT.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` |
| About / social preview | Recognizable project links and sharing artwork. | Pages homepage URL; `docs/assets/social-preview.png` |

Live community entry points: [public roadmap board](https://github.com/users/chriscollins500/projects/1), [welcome](https://github.com/chriscollins500/civitai-metadata-studio/discussions/4), [support/privacy guidance](https://github.com/chriscollins500/civitai-metadata-studio/discussions/5), and [1.0.0 introduction](https://github.com/chriscollins500/civitai-metadata-studio/discussions/6). The three Discussions are pinned; their editable source copies remain under `.github/community/`.

## Branch and tag protections

The reviewed profiles are `.github/repository/main-ruleset.json` and `release-tags-ruleset.json`. Apply them through the repository Rules settings or the official REST rulesets API, then read back the effective rules.

### Main

- Pull-request changes rather than direct pushes.
- Required checks: **Verify (ubuntu-latest)** and **Verify (windows-latest)** from GitHub Actions (app 15368), plus **CodeQL** from GitHub Advanced Security (app 57789), with the branch up to date.
- Resolved review conversations.
- No force-pushes or branch deletion.
- Zero required second-person approvals while the project is maintained solo.
- No always-bypass actor that can quietly skip the checks.

The OS checks include syntax, docs/contracts, core tests, companion tests, package verification, site checks, and Chrome/Edge browser checks on Node.js 24/26. Status names and app bindings must match the live checks; renaming a required job without migrating its rules can block every PR. CodeQL is independently required; a successful analysis is not a claim of zero vulnerabilities.

Before tightening rules, ensure a valid contributor path exists. Use a test/setup PR to verify passing checks and normal merge behavior. Never test deletion/force-push protection by attempting a destructive operation on the real main branch. A maintainer can review configuration through Settings if an emergency correction is necessary; do not weaken protections as an unannounced workaround.

### Version tags

Tags matching `v*` may be created, but existing version tags must not be updated or deleted. The profile has no bypass actor. Publish a new version instead of moving an old tag to make a build comparison pass. Do not require a special tag-creation credential or broaden a workflow token merely to create tags automatically.

## Immutable releases and attestations

Immutable releases protect newly published release assets and their associated tags. Prepare a **draft**, attach the complete reviewed HTML/ZIP/checksum set, verify it, and only then publish. After publication, assets cannot be added, replaced, or removed. Release notes/title can still be edited according to GitHub's feature rules.

Enabling this setting does not retroactively turn the existing v1.0.0 release into an immutable release. Its tag and assets remain unchanged; the tag ruleset independently protects the version reference. Never delete/recreate that release just to obtain an immutable badge.

The existing GitHub/Sigstore build-attestation workflow remains distinct. It validates both platforms, rechecks packaged bytes, and signs only authorized tag/manual-release runs. The first v1.0.0 attestation came from a later byte-identical rebuild, not the original older tag source. See [provenance](provenance.md).

An immutable GitHub release can also have a release attestation. A release attestation and a build-provenance attestation answer related but different questions; do not replace build verification with a badge or a plain checksum.

## Hosted website: no second app

Public entry: `https://chriscollins500.github.io/civitai-metadata-studio/`.

The hub has six main pages—Overview, Learn, Get the app, Trust, Developers, Community—and a project-root-aware 404. One shared layout, route/guide catalog, stylesheet, and small dependency-free script connect every page. No framework, external fonts, embedded frames, upload forms, tracking, service worker, or third-party runtime is added.

The hub's CSP denies network connections and allows only same-origin scripts/styles/images, with SHA-384 Subresource Integrity on the reviewed script and stylesheet. Local search, guide filtering, case-study tabs, copying, and optional theme selection progressively enhance ordinary HTML. Navigation, examples, all guide links, and downloads remain available without JavaScript. Only the disclosed `cms.site.theme` preference may be stored; denied storage/clipboard access is nonfatal.

**Open editor** navigates to `app/`, a byte-for-byte copy of the reviewed portable HTML with its original CSP intact. The hub never reads images. The illustrated learning sample has synthetic metadata and no resource identities; its 768×512 pixels intentionally disagree with the old 1024×1024 generation setting.

The editor retains its own bounded Civitai network behavior. Hosting does not upload selected images or turn the local companion into a remote server. GitHub receives ordinary website requests/connection information, and browser cache storage belongs to the new HTTPS origin/profile—not to an old `file:` copy.

### Build and verify

```powershell
npm run site:build
npm run site:check
npm run test:site
node scripts/serve-site.mjs --port 4173
npm run test:browser
```

The builder first runs the existing HTML and release ZIP verifiers. It copies the current verified `dist` artifact without rewriting it and renders reviewed pages from `site/content.mjs`, `layout.mjs`, and `pages.mjs`. It writes to a dedicated directory under ignored `.tmp/`; no repository tree or support log is recursively copied. Existing symlinks/junctions and unsafe output locations are rejected.

The deployment contains exactly **20 files**, declared in `site/contract.mjs`: seven hub HTML pages; the editor; CSS/JS; favicon/social/illustration/sample assets; the public OpenAPI document; two receipts; robots/sitemap; and `.nojekyll`. The checker rejects unexpected/missing files rather than silently deleting them. Budgets are 32 KiB each for CSS/JS, 64 KiB per hub page, and 2 MiB total.

`release.json` records the current hosted app's version/date/size/hash, hub routes, guide count, and each asset's SHA-256. `stable-release.json` comes from reviewed `site/release-evidence.json` and independently records the immutable stable download assets, exact source/tag, and signing workflow run. The website never silently calls GitHub to discover a release. On a new app release, update the receipt only after checking the published bytes and attestations; do not substitute a CI build hash for signed-release evidence.

Site regressions reject altered app/assets/receipts, unsafe code/CSP/SRI, broken cross-page anchors, accessibility references, catalog drift, private paths, arbitrary preview-server paths, and over-budget files. Browser checks exercise all routes, local search, focus/keyboard tabs, theme contrast, no-JavaScript fallback, denied storage/clipboard, 320px/enlarged text, reduced motion/forced colors, 404 recovery, and a real sample save/reopen with encoded-payload proof. These are bounded checks, not full manual screen-reader or WCAG certification.

Local `npm test` rebuilds the HTML; `npm run verify` refreshes its matching ZIP before site tests. CI's verification jobs can therefore test a newly rebuilt pair. The separate Pages build job checks out a clean reviewed main commit and copies its **committed** portable pair; it does not deploy a separately dated CI rebuild or a PR artifact.

### Deployment path

Only a successful **push to main** can reach the Pages jobs, and both platform verification jobs must pass first. A PR, a version tag, or a manual old-release attestation run does not publish the website.

Official Pages actions are pinned to immutable commit SHAs. The preparation job has read-only contents/Pages permissions. Only the deployment job receives Pages-write and short-lived OIDC permissions; it has no contents-write permission or stored deployment secret. The `github-pages` environment restricts deployments to main. No custom domain or paid hosting is configured.

After deployment, read the live `release.json`, compare the hosted HTML's complete SHA-256 with the source, inspect the actual landing/editor in a current browser, and measure narrow/wide overflow. A successful CI job is not enough to claim the URL is serving the expected artifact.

## Branding

The social preview is a 1280×640 PNG under 1 MB, derived from the existing vector branding. Its vector source is retained. Regenerate with `npm run brand:render` using shared ImageMagick; this is maintainer asset tooling, not an app/CI dependency. Inspect the PNG visually before uploading it in repository Settings → General → Social preview.

The About website points to the public Pages entry. Topics describe implemented areas rather than promising future capabilities. Do not add third-party tracking just to measure downloads or make the homepage look more active.

## Dependency maintenance

`.github/dependabot.yml` proposes weekly updates for `automation/` npm packages and GitHub Actions. Compatible minor/patch updates are grouped per ecosystem; major changes remain separate. Security updates remain enabled independently. No auto-merge workflow or auto-approval is configured.

Review release notes, protocol/Node changes, transitive dependencies, action commit provenance, and actual test results. Retain exact pins and lockfiles. Browser portability, MCP compatibility, and data-preservation claims need appropriate verification after an update; green dependency resolution alone is insufficient.

## Community intake and moderation

Issue forms route website/navigation/learning, browser editor, hosted editor, HTTP, MCP, documentation, and metadata-mismatch reports without asking for private files. The chooser links the website, Q&A, wiki, and private vulnerability reporting. Blank public issues are disabled for normal users; the available forms cover defects and concrete proposals.

Use block mappings for issue-form `attributes`. An unquoted comma inside a YAML flow mapping can create an unintended key even when the file parses successfully. The community regression checks prevent that shape; also inspect the live chooser and actual forms after publication. Parsing valid YAML is not the same as satisfying GitHub's form schema.

Launch Discussions from reviewed `.github/community/` sources, checking existing titles before creating duplicates. Pin the welcome and support guidance and the release introduction. Keep Q&A answerable and use announcement-format categories for maintainer news. Do not seed fake conversations, endorsements, usage counts, or testimonials.

The public roadmap uses draft items to avoid manufacturing a backlog of issues. Its README mirrors `ROADMAP.md`; reviewed scope/acceptance notes for five existing Next/Explore cards live in `.github/community/roadmap-notes.json`. Priorities are directional, no dates are invented, and exploration is not a feature commitment. Synchronization must compare the live baseline first, preserve statuses and historical Done cards, and stop on intervening edits. Projects access is separate from repository access; missing scope is not permission to create a replacement board.

The code of conduct routes platform-abuse reports to GitHub's own private flow and accurately explains that it is not a private maintainer inbox. Security advisories are for vulnerabilities, not ordinary conduct disputes or private support uploads. No personal email address or response SLA is invented.

## Periodic review

Check that required CI job names still match rules, future releases are immutable, website/editor digests agree, public links work, dependency proposals remain bounded, and documentation matches actual product behavior. Reconcile direct wiki/Discussion edits into their versioned sources before republishing. Never copy an old support report into a public fixture without a fresh privacy review.

For this hub update, the [REST ruleset contract](https://docs.github.com/en/rest/repos/rules#update-a-repository-ruleset) and [custom Pages workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) were rechecked **2026-11-24**. The CodeQL app binding comes from the actual successful repository check, not an assumed Actions integration ID.

Primary documentation reviewed **2026-11-14**: [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets), [REST rules](https://docs.github.com/en/rest/repos/rules), [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases), [Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Dependabot version updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates), [Discussions categories](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-categories-for-discussions), and [social previews](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview).
