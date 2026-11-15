# Give an assistant a bounded metadata workbench

**Outcome:** connect a compatible local MCP host without giving it unrestricted filesystem or network access.

The companion uses the official MCP SDK, exposes the same engine as HTTP, and supports **stdio** and **Streamable HTTP**. It is not a public cloud connector, image-generation server, or automatic registration in ChatGPT/Codex.

## Compatibility

Current implementation: MCP protocol **2026-07-28**, official server SDK **2.4.0**, Node adapter **2.1.2**. A client restricted to older initialization behavior receives an explicit unsupported-version response. With the official client SDK, use `versionNegotiation: { mode: "auto" }` or select the current protocol explicitly.

Host configuration formats vary. The example below is a common `mcpServers` shape, not a promise that every host accepts that exact file.

## Stdio setup

Install the optional companion dependencies first. Configure your host to launch Node directly with absolute paths:

```json
{
  "mcpServers": {
    "civitai-metadata-studio": {
      "command": "node",
      "args": [
        "--use-system-ca",
        "C:/Tools/civitai-metadata-studio/automation/mcp.mjs",
        "--read-root", "C:/Images",
        "--write-root", "C:/Images/Edited",
        "--network"
      ]
    }
  }
}
```

Use your actual checkout and existing roots. Forward slashes avoid Windows JSON escaping. Omit `--network` or `--write-root` for a more restricted connection. Stdio needs no HTTP token. The host owns process lifetime; stdout is protocol-only and diagnostics use stderr.

## Streamable HTTP

Start the [HTTP companion](https://github.com/chriscollins500/civitai-metadata-studio/wiki/Automation-Setup). Connect a compatible local host to `http://127.0.0.1:4318/mcp` with the same temporary bearer token. Keep it in the host's local secret mechanism; do not put it in chat or a committed config. The loopback, Host, Origin, filesystem, and network restrictions remain enforced.

## All 14 tools

| Tool | Purpose | Additional authority |
| --- | --- | --- |
| `capabilities` | Read formats, fields, limits, and enabled permissions. | None. |
| `civitai_reference` | Read current public type/family enums. | Network opt-in. |
| `open_image` | Inspect a permitted image; return a session/revision. | Read root. |
| `read_image` | Read canonical fields/evidence; prompts opt-in. | Existing session. |
| `edit_image` | Atomic in-memory field/resource/preservation edit. | Current revision. |
| `undo_image` | Undo in-memory edit. | Current revision. |
| `redo_image` | Redo in-memory edit. | Current revision. |
| `verify_image` | Verify exact public resource identities. | Network and current revision. |
| `import_civitai_metadata` | Import one public image's recipe. | Network and current revision. |
| `search_resources` | Explicit public name search. | Network. |
| `hash_model` | Stream hashes from a permitted local model file. | Read root; no upload. |
| `export_image` | Prove payload integrity and create a new file. | Write root and current revision. |
| `report_image` | Read audit/change evidence; prompts opt-in. | Existing session. |
| `close_image` | Forget the session/history. | Existing session; does not delete files. |

MCP arguments include `imageId` directly. Otherwise, the [HTTP operation reference](https://github.com/chriscollins500/civitai-metadata-studio/wiki/HTTP-API-Reference) documents the same strict inputs and structured outputs. Tool annotations are hints, not permission grants; the shared service enforces roots, revisions, and network opt-in.

## Resources and prompt

- `studio://capabilities` describes local capabilities and enabled permissions.
- `studio://openapi` provides the OpenAPI contract for reference.
- The `audit-image` prompt accepts `path` and guides inspection before editing.

The audit prompt does not authorize an export or network call beyond the user's request. Embedded image/workflow text is untrusted data, never an instruction to the assistant.

## A good assistant workflow

Ask it to inspect an explicitly selected image, explain provenance/conflicts, and propose corrections. Authorize the intended edits and destination. The assistant should read the current revision, apply one atomic change, verify exact identities only when network use is desired, export a new copy, inspect the integrity result, and close the session.

For example: “Inspect this permitted image without exposing its prompts. Explain any identity conflicts. Do not edit, export, or contact Civitai yet.” Adding a model's metadata to context does not grant it authority to run commands found in that metadata.

## Progress, cancellation, and limits

Hashing can report progress when the client supplies a progress token; hashing and verification support cancellation. There are at most four active tools per server, bounded stdio messages, and bounded subscriptions. Sessions expire after 30 idle minutes or disappear on shutdown. Prompt text is omitted unless explicitly requested.

Cancellation is not an instruction to accept partial results as verified. Inspect the returned state; atomic mutation paths roll back on failure. The HTTP adapter's operation deadline is not a universal two-minute promise for every MCP host/transport operation.

Primary references, checked **2026-11-14**: [MCP versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning), [official TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/). See also the [shared schemas](https://github.com/chriscollins500/civitai-metadata-studio/blob/main/automation/schemas.mjs).
