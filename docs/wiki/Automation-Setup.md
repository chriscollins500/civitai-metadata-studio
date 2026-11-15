# Choose your automation connection

**Outcome:** run the optional companion with only the filesystem and network access you intend to grant.

The portable HTML does not need Node, npm, or a server. The companion is an optional **local** interface for scripts and MCP hosts. Both use the same canonical engine as the browser.

| Interface | Best fit | Authentication |
| --- | --- | --- |
| Portable HTML | Interactive browsing/editing. | Browser file selection; no account/token. |
| Local HTTP API | Scripts and integrations. | Temporary local bearer token. |
| MCP over stdio | A local assistant host launching its own process. | Host process permissions; no HTTP token. |
| MCP over Streamable HTTP | A compatible local MCP client. | Same local bearer token as HTTP. |

## Prerequisites

Use Node.js **24 or newer**, a checkout of the repository, and existing folders for input and output. For the released version, use the **[v1.0.1 source](https://github.com/chriscollins500/civitai-metadata-studio/tree/v1.0.1)** or its source-code archive on the [release page](https://github.com/chriscollins500/civitai-metadata-studio/releases/tag/v1.0.1). The portable app ZIP contains only the HTML, not the companion. The optional companion has pinned dependencies; the browser app still has no runtime dependencies.

From the repository directory:

```powershell
npm ci --prefix automation --ignore-scripts
npm run sdk:check
```

This installs the optional companion packages and verifies the reviewed development-client SDK archive and installed file hashes. There is no patch-install hook. It does not install a browser or turn the HTML into an installed desktop application. Reuse an existing compatible Node installation; do not weaken TLS verification to work around local certificate issues.

The 1.0.1 development client uses the managed `2.4.0-studio-native.2` SDK repack, with native Node-only spawning and the legacy-SSE reconnect fix. Its coordinated dependency pins are `eventsource` **5.1.5**, `eventsource-parser` **4.1.3**, and `pkce-challenge` **6.0.0**. The server SDK and Playwright are unchanged. See the [MCP compatibility notes](https://github.com/chriscollins500/civitai-metadata-studio/wiki/MCP-Guide#compatibility) and [managed SDK review](https://github.com/chriscollins500/civitai-metadata-studio/blob/v1.0.1/docs/managed-sdk-patch.md) for the exact scope.

## Start HTTP with a temporary token

In current PowerShell, replace the example folders with existing folders you intend to allow:

```powershell
$env:STUDIO_API_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
npm run api -- --read-root "C:\Images" --write-root "C:\Images\Edited" --network
```

The first line generates a random token without displaying it. Do not paste it into chat, include it in command arguments, save it in a profile, or commit it. This is a **Studio local-process token**, not a Civitai API key.

The service prints its URL, not the token. It binds to `127.0.0.1:4318` by default. Use `--port` for another port. HTTP startup refuses a missing token or one shorter than 24 characters/containing newlines. Configure clients through a local secret mechanism or the same process environment.

## Grant less when you need less

- Repeat `--read-root` for additional permitted directories.
- Omit `--write-root` to prohibit disk exports while allowing in-memory inspection/editing.
- Omit `--network` to prohibit Civitai reads entirely.
- Use a narrow folder instead of granting an entire drive or home directory.

Roots must exist. Paths are resolved through real filesystem locations; an escaping symlink, device path, traversal, or NTFS alternate stream does not expand permission. Output names must be plain same-format filenames. Existing outputs and originals are never overwritten.

## Connection checks

```powershell
Invoke-RestMethod http://127.0.0.1:4318/health
$headers = @{ Authorization = "Bearer $env:STUDIO_API_TOKEN" }
Invoke-RestMethod http://127.0.0.1:4318/v1/capabilities -Headers $headers
```

`/health` and `/openapi.json` are public local discovery endpoints without private session data. All `/v1` requests require the token. Use the exact printed loopback address: `localhost` is not accepted as an interchangeable Host value. Requests carrying a browser `Origin` header are rejected; there is no CORS bridge.

The portable HTML does not connect to this server. It continues to use browser file permissions and direct bounded Civitai reads.

## Shutdown and state

Stop with Ctrl+C. Sessions and edit history are in memory and disappear when the process stops; idle sessions also expire. Exported files remain on disk. Remove the temporary token from that shell when clients no longer need it:

```powershell
Remove-Item Env:STUDIO_API_TOKEN
```

For a host-managed process, prefer [stdio MCP](https://github.com/chriscollins500/civitai-metadata-studio/wiki/MCP-Guide). The host owns its lifetime and does not need an HTTP token.

**Next:** [HTTP reference](https://github.com/chriscollins500/civitai-metadata-studio/wiki/HTTP-API-Reference) · [API cookbook](https://github.com/chriscollins500/civitai-metadata-studio/wiki/API-Cookbook) · [MCP guide](https://github.com/chriscollins500/civitai-metadata-studio/wiki/MCP-Guide)
