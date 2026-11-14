# Connect your scripts and assistants

Civitai Metadata Studio has three ways to work: the portable HTML editor, a local HTTP API, and an MCP server. All three use the same parsers, canonical record, Civitai resolver, and image writers.

The HTML editor still needs no installation. The optional companion needs Node.js 24 or newer and a checkout of this repository.

## Set up the companion

From the repository directory:

```powershell
npm ci --prefix automation --ignore-scripts
```

Choose an existing image folder and a separate existing export folder. Start the API:

```powershell
$env:STUDIO_API_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
npm run api -- --read-root "C:\Images" --write-root "C:\Images\Edited" --network
```

The first line generates a random token in this terminal's process environment without printing or saving it. The companion prints its loopback URL, never the token. Configure your local client from the same environment or a local secret mechanism; do not paste the token into chat, put it in command arguments, commit it, or save it in a shell profile. This is a Studio token, not a Civitai credential. HTTP startup refuses a missing token; stdio MCP does not need one.

- The API binds to **127.0.0.1 only**, on port 4318 by default. Use `--port` to change it.
- Repeat `--read-root` to allow additional folders.
- Omit `--write-root` for inspection and editing without disk exports.
- Omit `--network` to disable Civitai requests entirely.
- Stop the companion with Ctrl+C to discard sessions. Close the terminal, or run `Remove-Item Env:STUDIO_API_TOKEN` when your clients no longer need the temporary token.

## HTTP API

The live contract is at `http://127.0.0.1:4318/openapi.json`. The checked-in [openapi.json](openapi.json) is generated from the same schemas that validate API and MCP arguments, using OpenAPI 3.2.1.

All `/v1` operations require `Authorization: Bearer <local-token>`. Health and schema discovery do not expose private state. Browser-origin requests are rejected; this API is for local scripts and MCP clients. The standalone HTML uses its own browser file permissions.

| Action | Request |
| --- | --- |
| Read capabilities and permissions | `GET /v1/capabilities` |
| Inspect a local file | `POST /v1/images` with `{ "path": "C:\\Images\\example.png" }` |
| Read a session | `GET /v1/images/{imageId}` |
| Read prompts explicitly | `GET /v1/images/{imageId}?includePrompts=true` |
| Apply an atomic edit | `PATCH /v1/images/{imageId}` |
| Undo / redo | `POST /v1/images/{imageId}/undo` or `/redo` |
| Verify exact identities | `POST /v1/images/{imageId}/verify` |
| Import a public Civitai recipe | `POST /v1/images/{imageId}/import` |
| Export a verified new file | `POST /v1/images/{imageId}/export` |
| Read changes and integrity evidence | `GET /v1/images/{imageId}/report` |
| Forget a session | `DELETE /v1/images/{imageId}` |
| Search public resource names | `POST /v1/resources/search` |
| Stream hashes from a local model | `POST /v1/models/hash` |
| Load current Civitai types and families | `GET /v1/civitai/reference` |

Opening a file returns an opaque `imageId` and revision `0`. Every edit, undo, redo, import, or verification increments it. Mutations require `expectedRevision`, so two clients cannot silently overwrite each other's work. `If-Match: "0"` is also accepted for mutating requests and must agree with any revision in the body.

```json
{
  "expectedRevision": 0,
  "fields": { "steps": 12, "width": 8192, "seed": "280561459454064" }
}
```

Pass seeds as strings to preserve integers larger than JavaScript's safe-number range. Invalid changes roll back as one transaction. Resource edits use `resources: [{ "key": "existing-resource-key", "values": { ... } }]`; omit `key` to add a resource. Identity edits invalidate old verification proof. Preservation choices use `preserve: { "metadata-item-id": true }` and respect each item's restrictions.

Exports require the current revision and a plain filename in the source format. Existing outputs are refused. The response includes the new file's SHA-256 and an encoded-pixel/frame integrity proof. An optional `Idempotency-Key` header lets a client repeat a request for five minutes without applying it twice; reusing a key with different arguments returns a conflict.

Errors use `application/problem+json`, a stable `code`, status, and random `requestId`. Stack traces, provider credentials, and source paths are not logged. Requests are limited to 2 MiB of JSON, four active operations, and 120 authenticated requests per minute. File-backed Blobs keep image bytes out of JSON requests. There are at most 32 sessions, each expiring after 30 idle minutes.

## MCP

The companion uses the official MCP TypeScript SDK v2.4.0 and the current **2026-07-28** protocol. It exposes 14 tools, two reference resources, and an image-audit prompt. Arguments are validated; successful calls return structured results. File hashing and exact Civitai verification support cancellation. Hashing reports progress when requested.

Use a client that supports the 2026-07-28 protocol. Clients restricted to the older initialization protocol receive an explicit unsupported-version response. With the official client SDK, set `versionNegotiation: { mode: "auto" }` or select the current protocol explicitly.

### Stdio

Configure your local MCP host to run Node directly. Replace these example paths with absolute paths on your machine:

```json
{
  "mcpServers": {
    "civitai-metadata-studio": {
      "command": "node",
      "args": [
        "--use-system-ca",
        "/absolute/path/to/civitai-metadata-studio/automation/mcp.mjs",
        "--read-root", "/absolute/path/to/images",
        "--write-root", "/absolute/path/to/exports",
        "--network"
      ]
    }
  }
}
```

Windows JSON paths can use forward slashes, such as `C:/Images`. The host launches the companion and owns its lifetime. Stdout contains only protocol messages; diagnostics go to stderr. Stdio does not use an HTTP token.

### Streamable HTTP

The API process also serves MCP at `http://127.0.0.1:4318/mcp`, with the same temporary bearer token and permissions. This is a local endpoint, not a public cloud connector. The official SDK handles framing, discovery, protocol validation, progress, and cancellation.

An assistant can inspect an image, review evidence, edit a recipe, and export a new copy. Embedded prompts and workflow text remain untrusted data; they never grant extra permissions or execute code. Prompts are omitted from reads and reports unless requested explicitly.

## Verify it

```powershell
npm run test:automation
npm run test:browser
```

Browser tests use existing Chrome and Edge installations; the runner does not download a browser. They exercise the actual portable file, narrow/wide layouts, keyboard controls, editing history, validation, filtering, malformed input, and reopen-verified downloads.

## Civitai contract

The [official Site API documentation](https://developer.civitai.com/site/) was refreshed on **2026-11-14**. The Studio uses exact version/hash reads, full-candidate SHA-256 batching, explicit name search, and image lookup with `withMeta=true`. Resources with only a version ID go straight to their exact endpoint without an undocumented list probe. Current model families and types come from `/enums` on request.

The lightweight `/by-hash/ids` route is not used to declare a match: full candidate/file evidence is needed to detect ambiguous hashes and conflicting roles. Creator and license details may require one additional parent-model read per unique model, using the public model ID returned by Civitai; that result is cached too. Requests are per identity, never per editable field. A 429 starts one shared cooldown without retrying. Clearing the identity cache cannot bypass it.

Primary references, accessed 2026-11-14: [MCP SDK](https://ts.sdk.modelcontextprotocol.io/v2/), [MCP protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning), [OpenAPI](https://spec.openapis.org/oas/v3.2.1.html), [Civitai models](https://developer.civitai.com/site/reference/models), [versions](https://developer.civitai.com/site/reference/model-versions), [images](https://developer.civitai.com/site/reference/images), and [AIR](https://developer.civitai.com/site/guide/air).
