# Your guide to the whole Studio

This wiki is organized in layers: a friendly start, task-oriented guides, exact references, and a maintainer handbook. You do not need to read it from beginning to end.

Prefer a searchable overview? The [website learning hub](https://chriscollins500.github.io/civitai-metadata-studio/learn/#guide-directory) indexes every chapter locally and includes a synthetic practice image. The [project home](https://chriscollins500.github.io/civitai-metadata-studio/) connects it to the editor, verified downloads, trust explanations, developers, and community.

## Start and everyday use

| Guide | Question it answers |
| --- | --- |
| [Home](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Home) | What is this, and where should I begin? |
| [Getting started](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Getting-Started) | How do I open my first image and save a copy? |
| [Workspace and keyboard](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Workspace-and-Keyboard) | How do tabs, queue, history, and commands work? |
| [Generation fields](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Generation-Fields) | What does every editable field mean? |
| [Resources and identity](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Resources-and-Identity) | What are the roles, badges, links, and evidence? |
| [AIR and hashes](https://github.com/chriscollins500/civitai-metadata-studio/wiki/AIR-and-Hashes) | What establishes identity, and in what order? |
| [Civitai verification](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Civitai-Verification) | Which requests happen and how are limits handled? |
| [Public-image import](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Civitai-Image-Import) | How do I import a known public recipe? |

## Trust, saving, and problem solving

| Guide | Question it answers |
| --- | --- |
| [ComfyUI workflows](https://github.com/chriscollins500/civitai-metadata-studio/wiki/ComfyUI-Workflow-Handling) | Which nodes actually contribute to the result? |
| [Conflicts and provenance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Conflicts-and-Provenance) | Why do sources disagree, and what should I choose? |
| [Saving and pixel integrity](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Saving-and-Pixel-Integrity) | What exactly is preserved in a new copy? |
| [Batches and identity exchange](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Batch-and-Identity-Exchange) | Which JSON/ZIP output should I use? |
| [Privacy and security](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Privacy-and-Security) | What stays local and what can remain in exports? |
| [Cache and performance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Cache-and-Performance) | What is cached and how is it bounded? |
| [Troubleshooting](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Troubleshooting) | What should I check when something looks wrong? |
| [Formats and limits](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Formats-and-Limits) | What files, resolutions, and bounds are supported? |
| [Accessibility](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Accessibility) | How can I navigate and report access problems? |

## Automation and maintenance

| Guide | Question it answers |
| --- | --- |
| [Automation setup](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Automation-Setup) | Which local interface should I run? |
| [HTTP API reference](https://github.com/chriscollins500/civitai-metadata-studio/wiki/HTTP-API-Reference) | What are all operations, schemas, revisions, and errors? |
| [API cookbook](https://github.com/chriscollins500/civitai-metadata-studio/wiki/API-Cookbook) | What does a complete safe client workflow look like? |
| [MCP guide](https://github.com/chriscollins500/civitai-metadata-studio/wiki/MCP-Guide) | How do tools, transports, and permissions work? |
| [Architecture and data model](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Architecture-and-Data-Model) | Where does each responsibility belong? |
| [Development and testing](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Development-and-Testing) | Which checks prove which claims? |
| [Release and provenance](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Release-and-Provenance) | How do I verify bytes and signed origin? |
| [Contributing and support](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Contributing-and-Support) | How do I report or improve something safely? |
| [FAQ and glossary](https://github.com/chriscollins500/civitai-metadata-studio/wiki/FAQ-and-Glossary) | What does the terminology mean? |
| [Capabilities and limitations](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Capabilities-and-Limitations) | What should I not assume the app can do? |
| [Documentation map](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Documentation-Map) | How is the wiki organized and maintained? |

## Documentation evidence and freshness

The original full documentation review covered application **1.0.0** and official references on **2026-11-14**. The **1.0.1** review on **2026-11-15** documented SDK/dependency updates. The **1.0.2** release/link review on **2026-11-17** refreshes downloads and verification evidence after the wiki checker and browser regression fixes, with no generation-field or API-operation changes. Start with the [current release](https://github.com/chriscollins500/civitai-metadata-studio/releases/tag/v1.0.2) and [verification record](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Release-and-Provenance#v102-release-evidence). API/provider behavior, browser support, host configuration, and SDK versions can drift. The running companion's schema is authoritative for its contract; a badge or historical test count is not a substitute for current evidence.

Primary references:

- [Civitai Site API](https://developer.civitai.com/site/), especially [models](https://developer.civitai.com/site/reference/models), [versions](https://developer.civitai.com/site/reference/model-versions), [images](https://developer.civitai.com/site/reference/images), and [AIR](https://developer.civitai.com/site/guide/air).
- [OpenAPI 3.2.1](https://spec.openapis.org/oas/v3.2.1.html), [MCP SDK](https://ts.sdk.modelcontextprotocol.io/v2/), and [MCP versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning).
- [GitHub wiki editing](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages), [sidebar/footer conventions](https://docs.github.com/en/communities/documenting-your-project-with-wikis/creating-a-footer-or-sidebar-for-your-wiki), and [Mermaid diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams).
- [Repository README](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/README.md), [security policy](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/SECURITY.md), [changelog](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/CHANGELOG.md), and [shared API schemas](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/automation/schemas.mjs).

## Maintaining and publishing

The reviewed source of the wiki is [docs/wiki](https://github.com/chriscollins500/civitai-metadata-studio/tree/main/docs/wiki) in the main repository. Native GitHub Wiki pages live in a separate Git repository at `https://github.com/chriscollins500/civitai-metadata-studio.wiki.git`.

For branch/tag protections, Pages deployment, issue forms, dependency proposals, branding, Discussions, and roadmap maintenance, use the [repository operations handbook](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/docs/repository-operations.md). Community entry points are [Support](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/SUPPORT.md), [Roadmap](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/ROADMAP.md), and the [Code of conduct](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/CODE_OF_CONDUCT.md).

1. Edit the source pages and `manifest.json` when adding/removing a page.
2. Update sidebar/navigation and any affected field/tool/route references.
   Keep friendly download links on `/releases/latest/download/…`; keep checksum evidence and tag-specific verification pinned to the version it describes. Check that latest resolves to the stated release and that both HTML and ZIP downloads match its checksum manifest. Keep historical hashes/counts clearly labeled.
3. Run `npm run docs:check` and `node --test tests/wiki.test.mjs`.
4. Review a normal source commit; preserve unrelated work.
5. Fetch the wiki repository and inspect intervening edits before copying the reviewed `.md` pages into its root. Do not copy the JSON manifest or test tooling as wiki pages.
6. Commit/push normally—never force-push away someone else's wiki edits.
7. Check rendered Home, navigation, a reference table, and a diagram. Compare published page bytes with the reviewed sources.

The checker validates page inventory, internal targets/anchors, navigation reachability, Markdown fences, and coverage of current generation keys, resource roles, HTTP operations, and MCP tools. It is not a full Markdown renderer, external-link availability checker, or factual proof of every sentence. Rendered review remains necessary.

The wiki and source repositories can briefly differ during publication. If editing directly on GitHub, reconcile those changes into `docs/wiki/` before the next publication instead of blindly overwriting them. No automatic wiki deployment or application release is implied by a documentation commit.
