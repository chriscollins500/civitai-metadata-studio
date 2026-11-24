export const project = Object.freeze({
  name: "Civitai Metadata Studio",
  repository: "https://github.com/chriscollins500/civitai-metadata-studio",
  url: "https://chriscollins500.github.io/civitai-metadata-studio/",
  base: "/civitai-metadata-studio/",
  roadmap: "https://github.com/users/chriscollins500/projects/1"
});
const repo = project.repository;
export const links = Object.freeze({
  source: repo, wiki: `${repo}/wiki`, guideMap: `${repo}/wiki/Documentation-Map`,
  releases: `${repo}/releases`, latest: `${repo}/releases/latest`,
  issues: `${repo}/issues/new/choose`, bug: `${repo}/issues/new?template=bug_report.yml`,
  mismatch: `${repo}/issues/new?template=metadata_mismatch.yml`, feature: `${repo}/issues/new?template=feature_request.yml`,
  discussions: `${repo}/discussions`, questions: `${repo}/discussions/categories/q-a`,
  ideas: `${repo}/discussions/categories/ideas`, showcase: `${repo}/discussions/categories/show-and-tell`,
  announcements: `${repo}/discussions/categories/announcements`, welcome: `${repo}/discussions/4`,
  supportDiscussion: `${repo}/discussions/5`, roadmap: project.roadmap,
  roadmapSource: `${repo}/blob/main/ROADMAP.md`, contribute: `${repo}/blob/main/CONTRIBUTING.md`,
  support: `${repo}/blob/main/SUPPORT.md`, conduct: `${repo}/blob/main/CODE_OF_CONDUCT.md`,
  security: `${repo}/security/policy`, vulnerability: `${repo}/security/advisories/new`,
  actions: `${repo}/actions/workflows/ci.yml`, pulls: `${repo}/pulls`,
  changelog: `${repo}/blob/main/CHANGELOG.md`, license: `${repo}/blob/main/LICENSE`,
  automation: `${repo}/blob/main/docs/automation.md`, sdk: `${repo}/blob/main/docs/managed-sdk-patch.md`
});
export const pages = Object.freeze([
  { key: "home", path: "index.html", route: "", label: "Overview", title: "Your image. The whole story.", description: "The private, portable AI-image metadata editor. Explore the recipe, try a sample, verify exact resources, and save a new copy without re-encoding pixels." },
  { key: "learn", path: "learn/index.html", route: "learn/", label: "Learn", title: "Less mystery. More making.", description: "A friendly first session, a synthetic sample image, three metadata case studies, and a searchable directory of all 28 user and developer guides." },
  { key: "downloads", path: "downloads/index.html", route: "downloads/", label: "Get the app", title: "One file. Yours to keep.", description: "Download the standalone HTML or portable ZIP, verify release checksums and GitHub/Sigstore provenance, or open the same editor in your browser." },
  { key: "trust", path: "trust/index.html", route: "trust/", label: "Trust", title: "The receipts are part of the product.", description: "Understand local processing, exact resource evidence, encoded-pixel preservation, signed release provenance, and the limits of every claim." },
  { key: "developers", path: "developers/index.html", route: "developers/", label: "Developers", title: "One engine. More ways in.", description: "Use the optional local HTTP API and MCP companion, explore the OpenAPI contract and architecture, and contribute with reproducible tests." },
  { key: "community", path: "community/index.html", route: "community/", label: "Community", title: "Make the next good thing together.", description: "Find help, share discoveries, report reproducible bugs privately and safely, explore the public roadmap, and contribute to the project." },
  { key: "notFound", path: "404.html", route: "404.html", label: "Page not found", title: "A little off the map.", description: "Find your way back to the editor, guides, downloads, or community." }
]);
export const topics = Object.freeze(["All guides", "First steps", "Metadata & resources", "Trust & sharing", "Developers"]);
const guide = (slug, title, summary, topic) => Object.freeze({ slug, title, summary, topic, url: `${repo}/wiki/${slug}` });
export const guides = Object.freeze([
  guide("Home", "The project, at a glance", "Understand what the editor does, and choose a path that fits your work.", "First steps"),
  guide("Getting-Started", "Your first clean copy", "Open an image, make an edit, and save without changing the original.", "First steps"),
  guide("Workspace-and-Keyboard", "Find your way around", "Tabs, queues, undo, command palette, focus, and keyboard shortcuts.", "First steps"),
  guide("Generation-Fields", "Every generation field", "Prompts, seeds, steps, guidance, dimensions, model and VAE fields.", "Metadata & resources"),
  guide("Resources-and-Identity", "Meet your resources", "Checkpoints, LoRAs, encoders, role compatibility, and exact resource links.", "Metadata & resources"),
  guide("AIR-and-Hashes", "Names are clues. Evidence is proof.", "AIR, version IDs, file qualifiers, hash strengths, and conflicting identities.", "Metadata & resources"),
  guide("Civitai-Verification", "Verification without the request storm", "Automatic exact lookups, caching, explicit search, and shared cooldown.", "Metadata & resources"),
  guide("Civitai-Image-Import", "Import a known public recipe", "Use a public Civitai image ID and review missing fields and disagreements.", "Metadata & resources"),
  guide("ComfyUI-Workflow-Handling", "Follow the path that made the image", "Active outputs, disabled branches, switches, and honest uncertainty.", "Metadata & resources"),
  guide("Conflicts-and-Provenance", "When the stories disagree", "See source evidence and alternatives instead of silently losing a value.", "Metadata & resources"),
  guide("Saving-and-Pixel-Integrity", "New metadata. The same encoded pixels.", "Understand same-format exports, payload proofs, and preserved graph carriers.", "Trust & sharing"),
  guide("Batch-and-Identity-Exchange", "Bring a whole batch", "Queues, selected-image saves, ZIP exports, and resource identity exchange.", "Metadata & resources"),
  guide("Privacy-and-Security", "Know what stays local", "Network boundaries, sensitive metadata, original workflow carriers, and safe sharing.", "Trust & sharing"),
  guide("Cache-and-Performance", "A cache with boundaries", "Disposable public identities, storage limits, expiry, and clearing.", "Trust & sharing"),
  guide("Troubleshooting", "Something looks off? Start here.", "Work through missing metadata, lookup limits, export issues, and useful bug reports.", "First steps"),
  guide("Formats-and-Limits", "Formats, big images, real limits", "PNG, JPEG, WebP, supported animation payloads, and bounded metadata decoding.", "First steps"),
  guide("Accessibility", "Your keyboard is welcome", "Semantic controls, focus, reduced motion, contrast, and reporting access barriers.", "First steps"),
  guide("Automation-Setup", "Set up the optional companion", "Node.js, explicit folders, local authentication, network opt-in, and clean installs.", "Developers"),
  guide("HTTP-API-Reference", "The complete HTTP contract", "Operations, input/output schemas, revisions, errors, and export rules.", "Developers"),
  guide("API-Cookbook", "From script to verified export", "Practical API workflows with revision checks and deliberate permissions.", "Developers"),
  guide("MCP-Guide", "Give an assistant the same tools", "Stdio and Streamable HTTP, tool inputs, output privacy, and authorization boundaries.", "Developers"),
  guide("Architecture-and-Data-Model", "Inside the shared engine", "One canonical record connects readers, editing, projections, and lossless writers.", "Developers"),
  guide("Development-and-Testing", "Check the thing people actually use", "Unit, integration, browser, artifact, corpus, and reproducible-build evidence.", "Developers"),
  guide("Release-and-Provenance", "Verify your download", "Pinned files, SHA-256 digests, exact source commits, and signed build provenance.", "Trust & sharing"),
  guide("Contributing-and-Support", "A useful way to help", "Support channels, responsible reports, contribution scope, and review.", "Developers"),
  guide("FAQ-and-Glossary", "A jargon-free field guide", "Friendly answers and definitions for the terms hidden in image metadata.", "First steps"),
  guide("Capabilities-and-Limitations", "What it can—and cannot—claim", "A clear boundary between resource identity, historical use, parsing, and proof.", "Trust & sharing"),
  guide("Documentation-Map", "The whole handbook", "Every chapter, its audience, primary sources, and how the wiki stays current.", "First steps")
]);
export const wiki = slug => `${repo}/wiki/${slug}`;
export const siteHref = route => `${project.base}${route}`;
