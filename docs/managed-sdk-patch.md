# Node-only MCP client repack

Studio's own MCP test launcher runs a JavaScript entry point with the same Node executable as its parent. It does not need shell scripts, PATH searching, `.cmd`/`.bat` shims, shebang interpretation, or another interpreter. We use native `node:child_process.spawn` for that narrow contract while retaining the official SDK's protocol, framing, backpressure, cancellation, and lifecycle implementation.

The patch ships in a reviewed local SDK archive, so a clean installation no longer downloads the unused `cross-spawn` dependency chain. The archive also includes a narrow legacy-SSE reconnect-header fix, described below. This is a development-client variant, not an upstream SDK release, forked MCP protocol, or change to the portable editor. The HTTP/MCP server and external hosts keep their own SDKs and launchers. Playwright is unchanged.

## Prepare and check

From the repository root:

```powershell
npm ci --prefix automation --ignore-scripts
npm run sdk:check
npm run test:automation
```

`sdk:check` is read-only. It verifies the exact archive spec, provenance, archive SHA-256/SHA-512, lockfile integrity, all 102 installed SDK file hashes, and absence of six legacy spawning packages. `test:automation` runs it before importing client code. A fresh `npm ci` installs the already prepared archive; there are no installation hooks, new helper dependencies, or global modifications. Three reviewed dependency overrides are documented below; they do not alter the archive or its file profile.

The verifier CLI accepts no alternate path. `sdk:patch` remains an explicit low-level repair/development command, with its byte-checked transform and safety/fault-injection tests retained. Normal setup and tests never need it. Prefer reinstalling the integrity-pinned archive to repairing an unexpectedly altered dependency.

## Launcher contract

```js
new StdioClientTransport({
  command: process.execPath,
  args: [absoluteMcpScript, "--read-root", allowedDirectory],
  stderr: "pipe"
});
```

- `command` must equal the current process's `process.execPath` exactly, for both ESM and CommonJS transports. Anything else rejects with `ERR_STUDIO_NODE_ONLY` before spawning.
- Arguments remain an array. No shell is invoked; shell metacharacters are ordinary argument data.
- Existing SDK options such as `cwd`, environment, stderr handling, buffer limits, and abort/close behavior remain in the SDK implementation. No compatibility fallback is added.
- This contract is not a sandbox: a Node script can execute code. Only launch your intended local server entry point. Image metadata never chooses a command or script.
- External host examples using `"command": "node"` are unaffected. They configure another application's launcher, not this patched development client.

Native spawning intentionally does not replace the general-purpose behavior of cross-spawn. The earlier isolated experiment confirmed Windows shim/shebang limitations; the managed patch makes that boundary explicit instead of accepting unsupported commands.

## Reviewed source profile

Patch ID: `studio-mcp-client-2.4.0-native-node-sse-v3`.

Upstream is exactly `@modelcontextprotocol/client@2.4.0`; the installed local variant is `2.4.0-studio-native.2`, pinned by `file:vendor/modelcontextprotocol-client-2.4.0-studio-native.2.tgz`. The patch replaces the ESM default `cross-spawn` import and CommonJS require with native spawn, inserts the Node-only guard, and forwards the legacy-SSE reconnect cursor in both HTTP entry modules. All four modules carry modification notices. The manifest removes only `cross-spawn` and changes the version; a provenance file identifies the changes. All other upstream files, including Apache-2.0 license material, are retained byte-for-byte. Relative to `.1`, only the two HTTP modules and version/provenance records change; the native stdio module bytes are identical.

SHA-256 digests of the complete module bytes, including original line endings:

| Module | Upstream | Prepared |
| --- | --- | --- |
| `dist/stdio.mjs` | `d44adf6ca40eb7a9cafb35dec9658de2b9e17c7dea6be01c06fb8e0d594dc211` | `f7d630bbc14181592b9a4c1a55ea009014a8ad39ffc712f6c2d44a8d69aae01d` |
| `dist/stdio.cjs` | `48de5b37b235ad86be60286b1bc8218dc42dd4e2fbb2d79d41534d55bc2f457b` | `d7e894439f93216f98f97617d9e720ccb1e5065a5029802d66c0a30b50f10eaf` |
| `dist/index.mjs` | `b78923b9b9d342109f4fc2a03a9dcea7241fbb89bb2943ec4c9f05a23891b1cf` | `9cd3d0133fb99389b48c0c1f8c63289a64aad5549520b0925f7d215629852808` |
| `dist/index.cjs` | `a77f4641ef2138baac0aa10c899e1a56e3f0c86369392a6197153ca75d61bf05` | `76d64076ca1e6bdf4129900058348d4800ec04fd800f074fe237a9c4e553e5e7` |

The canonical transform lives in [patch-mcp-sdk.mjs](../scripts/patch-mcp-sdk.mjs), used by the [repack recipe](../scripts/repack-mcp-sdk.mjs). The [read-only verifier](../scripts/verify-mcp-sdk.mjs) checks the full installation. The archive's complete generated file profile and checksums are in [sdk-repack.json](../automation/vendor/sdk-repack.json).

The recipe first checks the exact upstream SHA-512, refuses unsafe archive paths/links, and builds only in a new `.tmp/` directory. It changes exactly six package paths: two stdio modules, two HTTP entry modules, the package manifest, and the new provenance record. npm packaging runs with scripts disabled. No machine paths or build timestamps enter the package. The low-level patch engine preflights all four modules before any write and retains exclusive locking and concurrent-edit-preserving rollback tests, including a failure on the final HTTP-module rename; unrelated package-manager operations must not run concurrently.

## Reproduce the archive

```powershell
npm run sdk:repack
```

This explicitly downloads only the exact integrity-pinned upstream SDK, rebuilds the archive/profile in `.tmp/`, and requires byte-for-byte equality with the committed files. It does not change installed dependencies or refresh the vendor files. `npm run sdk:repack -- --write` intentionally refreshes those two generated files after an approved source/profile update. Temporary build directories remain available for inspection. npm 11 and 12 package-result formats are supported.

Current archive: **1,745,636 bytes**, SHA-256 `c001a3f210b99c413226de39c5b7f285683172b7e9f4941ac2af20b7450baa3b`. Its SHA-512 is pinned independently in the lockfile. Upstream licensing remains Apache-2.0, not the application's MIT license. The superseded `.1` archive is recoverable from Git history.

## Failure and recovery

If the version, source, or output hash differs, stop and review it. Do not weaken the check or use a broad dependency override to make preparation succeed.

For an unintentionally modified dependency, stop test processes and restore the exact lockfile installation:

```powershell
npm ci --prefix automation --ignore-scripts
npm run sdk:check
```

For a failed archive/profile check, review the tracked vendor artifact and lockfile; do not simply regenerate them to silence the failure. A lock left by the explicit low-level patch command requires checking that no operation is active before reinstalling. User source files and the portable artifact are never recovery targets.

## Regression gates

The automation suite includes:

- exact bytes, version/name drift, four-module preflight, repeat preparation, per-module partial repair, linked-path refusal, lock ownership, injected I/O failure, and concurrent-edit-preserving rollback;
- ESM and CommonJS MCP discovery and structured tool calls;
- a real image open/edit/export with large Unicode text, an exact 64-bit seed, original-file preservation, and encoded-payload verification;
- explicit-executable launches with empty PATH, Unicode/space paths, literal arguments, separate stderr, fragmented JSON, multiple messages, backpressure, buffer bounds, invalid cwd, nonzero exit, and child reaping;
- an import/require tripwire blocking all six legacy helper packages throughout the automation tests.
- complete repack provenance, archive/lock integrity, file-set/hash drift, exact spec, extraneous legacy directories, and linked vendor/SDK rejection.

CI's existing required Windows and Linux jobs each reproduce the archive, clean-install the dependencies, and run the full project plus all Chrome/Edge checks on Node.js 24 and 26. Required check names and repository protections are unchanged. Browser binaries are provisioned explicitly on disposable CI runners; local tests use installed Chrome/Edge.

## What this does not remove

The six standalone packages (`cross-spawn`, `path-key`, `shebang-command`, `shebang-regex`, `which`, `isexe`) are removed from the lockfile and install tree, reducing dependency packages from 20 to 14. Playwright's separate bundled code is deliberately untouched. This is not a claim that all development tooling is free of legacy spawning code. The separate SSE/PKCE update below does not change the native-spawn patch.

## Reviewed SSE and PKCE overrides

The automation manifest pins three dependencies specifically beneath `@modelcontextprotocol/client`:

| Package | Previous lock | Reviewed pin | Node requirement |
| --- | --- | --- | --- |
| `eventsource` | 3.0.7 | 5.1.5 | >=22.12.0 |
| `eventsource-parser` | 3.1.1 | 4.1.3 | >=22.12 |
| `pkce-challenge` | 5.0.1 | 6.0.0 | >=16.20.0 |

These are deliberate major-version overrides beyond upstream SDK 2.4.0's declared ranges, not an upstream support guarantee. Keep them exact and coordinated: eventsource 5 needs parser 4; updating eventsource alone would retain a second parser and increase the package count to 15. The coordinated tree remains 14 packages. All three are development-client dependencies, not browser runtime dependencies. Playwright's version, dependency records, and installed files remain unchanged.

Eventsource 5 and parser 4 are ESM-only; both the SDK's ESM and CommonJS entry points work on supported Node.js 24 and 26. Parser 4 intentionally discards invalid partial lines without an error callback and handles decoded/split leading BOMs. The SDK uses the public `eventsource-parser/stream` export. PKCE 6 adds a returned `code_challenge_method`; the SDK still uses the default S256 verifier/challenge pair, never a plain-method fallback. These compatibility checks are maintained in [sdk-http-dependencies.test.mjs](../automation/tests/sdk-http-dependencies.test.mjs) and run automatically through `npm run test:automation` on both CI platforms and runtimes.

Tests use synthetic loopback SSE/MCP servers and an injected in-memory OAuth fetch, not real credentials, Civitai calls, or an account login. Coverage includes streamed initialization/tool discovery, malformed frames, byte-split Unicode, 401 handling, origin checks, reconnect/close, cancellation, buffer bounds, PKCE vectors, and the SDK's authorization/token/refresh helpers. This is not a real-provider OAuth interoperability guarantee.

The legacy-SSE reconnect-header issue is fixed in local repack `.2`; the three dependency pins are unchanged. The fix is separate from both the dependency overrides and the native stdio transform.

## Legacy-SSE reconnect cursor contract

The SDK used to rebuild every EventSource request's headers without copying its generated `Last-Event-ID`, losing the server cursor on reconnect. In both `index.mjs` and `index.cjs`, the reviewed insertion now reads that one header through `new Headers(init?.headers)` and copies it onto the fresh SDK common headers when present. It does not merge arbitrary EventSource headers or alter token acquisition, protocol headers, Accept, fetch selection, the abort signal, POST handling, or the redirect policy. There is no new cursor cache or retry loop.

The underlying EventSource implementation remains responsible for cursor advancement, ID-only blocks, empty-ID resets, ignoring NUL-containing IDs, and UTF-8 header encoding. The SDK forwards the already encoded value, without another encode/decode pass. Explicit caller-provided initial `requestInit` headers remain supported; a generated live cursor takes precedence. A caller's fixed `Last-Event-ID` remains its explicit fallback when EventSource supplies none, so callers wanting purely automatic reset behavior should not configure a fixed cursor header.

Before the fix, all 10 focused reconnect regressions failed against `.1` in ESM and CommonJS with the expected missing/stale cursor. They pass with `.2` and cover object/tuple/Headers inputs, fresh auth and protocol headers, custom fetch precedence, caller immutability, cursor updates/resets/UTF-8, no automatic cursor on POST, close cleanup, and rejection of a cross-origin redirect under the default policy. The direct-package EventSource regression remains as an independent control. The Node-only stdio launcher and Streamable HTTP implementation are unaffected.

Standards/source references, checked 2026-11-15: [WHATWG SSE reconnection and Last-Event-ID](https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header) and [the pinned EventSource implementation](https://github.com/EventSource/eventsource/blob/v5.1.5/src/EventSource.ts).

For future SDK updates, inspect its declared ranges before retaining these overrides. Remove an override when upstream supports an appropriate version; otherwise re-review the exact resolved tree and run clean installs plus every Windows/Linux Node 24/26 project and browser check. Do not loosen archive checks or broaden overrides to unrelated consumers.

Primary release references, checked 2026-11-15: [eventsource](https://github.com/EventSource/eventsource/releases), [eventsource-parser](https://github.com/rexxars/eventsource-parser/releases), and [pkce-challenge](https://github.com/crouchcd/pkce-challenge/releases). Exact registry integrity values are recorded in `automation/package-lock.json`.

## Updating the SDK

1. Inspect the new upstream package and actual stdio modules before changing the upstream version, URL, and integrity constants.
2. Decide whether upstream native spawning makes this patch unnecessary. Prefer removing the patch when the narrow contract can be met without it.
3. If still needed, review all four full module diffs and replacement anchors. Check whether upstream has fixed cursor forwarding so that insertion can be removed. Compute original and prepared hashes from the reviewed bytes; never bless a hash merely because a test failed.
4. Update the local variant version, patch ID, tests, and documentation together. Run `npm run sdk:repack -- --write`, review the exact six-file delta and retained notices, and regenerate the lockfile with scripts disabled. Do not add compatibility fallbacks.
5. Clean-install, verify all archive/installed-file evidence, reproduce again without `--write`, run `npm run ci` and browser regressions, and wait for every Windows/Linux check before merging. The local SDK archive adds a development-only maintenance artifact; it is never included in the portable HTML/ZIP.

Primary API references, checked 2026-11-15: [Node child processes](https://nodejs.org/api/child_process.html), [process.execPath](https://nodejs.org/api/process.html#processexecpath), and [Playwright browser provisioning](https://playwright.dev/docs/browsers). The exact reviewed source bytes, archive profile, and lockfile determine whether this repack can be used.
