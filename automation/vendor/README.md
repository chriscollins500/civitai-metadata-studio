# Reviewed MCP client repack

This directory holds the exact development-only Node MCP client used by Studio's tests. It is not an upstream release. The browser editor and MCP server SDK are unchanged.

The local `@modelcontextprotocol/client@2.4.0-studio-native.2` archive derives from upstream 2.4.0 with the reviewed native Node-only stdio patch, the legacy-SSE reconnect `Last-Event-ID` forwarding fix in ESM/CommonJS, and the unused `cross-spawn` dependency removed. Its five standalone helper dependencies therefore are not installed. Playwright is neither modified nor stripped; its internal bundled copy is outside this repack's scope. The `.2` archive replaces `.1`; the previous archive remains recoverable from Git history.

`sdk-repack.json` records the upstream URL/SHA-512, modification record, archive SHA-256/SHA-512, and every installed file's SHA-256. The archive retains upstream Apache-2.0 license material; modified modules carry explicit notices and `dist/STUDIO-PATCH.json` identifies the changes. The repository's MIT license does not relicense this third-party SDK.

Use `npm run sdk:check` after a scripts-disabled clean install. `npm run sdk:repack` downloads only the exact integrity-pinned upstream archive into a new `.tmp/` build directory and checks byte-for-byte reproduction. `npm run sdk:repack -- --write` deliberately refreshes the archive/profile only after source/profile changes have been reviewed. It is never an installation hook. See [the maintenance contract](../../docs/managed-sdk-patch.md).
