# Studio 1.0 upgrade

The portable browser editor remains the primary product. A separately installed local companion exposes the same engine through HTTP and MCP. Neither requires a cloud service.

## Acceptance criteria

- Editing: bounded in-memory undo/redo, atomic automation edits, clear validation, accurate save labels, and no stale identity proof after edits.
- Identity: import never merges by name; conflicting exact evidence stays visible; stronger evidence cannot be masked.
- Integrity: exports can prove encoded pixel/frame payload equality with streaming SHA-256, reopen validation, and a visible result.
- Privacy: original files remain unchanged; prompts, workflows, paths, and pixels never go to Civitai; automation file access requires configured roots.
- Interface: a compact, deliberate workspace, searchable queue and resources, keyboard commands, readable validation and status, responsive layout, accessible dialogs.
- Automation: versioned OpenAPI contract, bounded sessions, optimistic concurrency, authenticated loopback HTTP, explicit network permission, SDK-based MCP with structured results, cancellation, resources, and prompts.
- Engineering: synchronized versions, complete syntax checking, reproducible source loading, malformed-input and security regressions, verified portable HTML and ZIP, browser smoke tests.

## Current baseline

Inspected on 2026-11-14 with PowerShell 7.6.9 and Node 26.13.0. Version 0.5.0 passes 65 tests. Confirmed gaps include name-based identity-import matching, stale verification evidence after manual edits, decompression limits checked after allocation, no edit history, and no automation surface.

## Primary references

Accessed 2026-11-14:

- [MCP current protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- [Official TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [MCP tools and structured output](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [OpenAPI 3.2.1](https://spec.openapis.org/oas/v3.2.1.html)
- [Node file-backed Blob API](https://nodejs.org/download/release/v24.22.1/docs/api/fs.html#fsopenasblobpath-options)
- [Civitai Site API](https://developer.civitai.com/site/), including exact version/hash reads, full metadata image requests, enums, AIR, and error contracts

The MCP protocol is implemented by the official SDK, pinned in the optional companion's lockfile. The portable HTML has no dependency on that SDK.
