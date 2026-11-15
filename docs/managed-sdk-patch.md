# Managed Node-only MCP client patch

Studio's own MCP test launcher runs a JavaScript entry point with the same Node executable as its parent. It does not need shell scripts, PATH searching, `.cmd`/`.bat` shims, shebang interpretation, or another interpreter. We use native `node:child_process.spawn` for that narrow contract while retaining the official SDK's protocol, framing, backpressure, cancellation, and lifecycle implementation.

This is a development-client patch, not a forked MCP protocol or a change to the portable editor. The HTTP/MCP server and external hosts keep their own SDKs and launchers.

## Prepare and check

From the repository root:

```powershell
npm ci --prefix automation --ignore-scripts
npm run sdk:patch
npm run sdk:check
npm run test:automation
```

`sdk:patch` applies the reviewed patch or verifies an already prepared copy. `sdk:check` is read-only and fails if either module still needs preparation. `test:automation` prepares it before importing any client code. There are no installation hooks, new dependencies, lockfile overrides, global modifications, or network requests in the patcher. A fresh `npm ci` restores upstream bytes; run preparation again afterward.

The command-line tool targets only this repository's `automation/node_modules`. It accepts no alternate target path. Its exported function supports isolated safety/fault-injection tests; it is not a general-purpose dependency patcher.

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

Patch ID: `studio-mcp-client-2.4.0-native-node-v1`.

Both the project pin and installed package must be exactly `@modelcontextprotocol/client@2.4.0`. The patch replaces the ESM default `cross-spawn` import and CommonJS require with native spawn, then inserts the Node-only guard into each transport's `start()` method. No other SDK code is changed.

SHA-256 digests of the complete module bytes, including original line endings:

| Module | Upstream | Prepared |
| --- | --- | --- |
| `dist/stdio.mjs` | `d44adf6ca40eb7a9cafb35dec9658de2b9e17c7dea6be01c06fb8e0d594dc211` | `28ca1c0cb6a600a3490fe64d2c0cdb16f26aa3e180c18df19daf2b7351d2c093` |
| `dist/stdio.cjs` | `48de5b37b235ad86be60286b1bc8218dc42dd4e2fbb2d79d41534d55bc2f457b` | `edbdd64c1af33c89e6c23a2880b64ebca98bd4f54bbebfc575be5ed265fa7212` |

The implementation lives in [patch-mcp-sdk.mjs](../scripts/patch-mcp-sdk.mjs). It refuses unreviewed bytes, non-exact versions, linked packages, and module paths that resolve outside the SDK package.

Both input files, replacement anchors, and expected output hashes are checked before either module is changed. An exclusive package-local lock coordinates patch operations. Each replacement is flushed to a new same-directory file and renamed into place. A write failure rolls back only bytes that still match this patch's own output, never unknown concurrent edits. A known partial application can be completed safely on the next run. This is not an atomic two-file filesystem transaction, and unrelated package-manager writes must not run concurrently.

## Failure and recovery

If the version, source, or output hash differs, stop and review it. Do not weaken the check or use a broad dependency override to make preparation succeed.

For an unintentionally modified dependency, stop test processes and restore the exact lockfile installation:

```powershell
npm ci --prefix automation --ignore-scripts
npm run sdk:patch
npm run sdk:check
```

A lock left by an interrupted preparation also requires checking that no patch/test process is still running, then reinstalling the pinned dependencies. Do not remove an active lock or overwrite unknown changes. User source files and the portable artifact are never recovery targets.

## Regression gates

The automation suite includes:

- exact bytes, version/name drift, both-file preflight, repeat preparation, partial repair, linked-path refusal, lock ownership, injected I/O failure, and concurrent-edit-preserving rollback;
- ESM and CommonJS MCP discovery and structured tool calls;
- a real image open/edit/export with large Unicode text, an exact 64-bit seed, original-file preservation, and encoded-payload verification;
- explicit-executable launches with empty PATH, Unicode/space paths, literal arguments, separate stderr, fragmented JSON, multiple messages, backpressure, buffer bounds, invalid cwd, nonzero exit, and child reaping;
- an import/require tripwire blocking all six legacy helper packages throughout the automation tests.

CI's existing required Windows and Linux jobs each run the full project on Node.js 24 and 26. Required check names and repository protections are unchanged. Local browser regression tests exercise the built standalone HTML separately.

## What this does not remove

The SDK still declares `cross-spawn`, whose dependency chain includes `path-key`, `shebang-regex`, `shebang-command`, `which`, and `isexe`. They remain installed and represented in the lockfile; the tested stdio client no longer loads them. This is not a claim of a smaller installed dependency graph or a fix for unrelated SSE/PKCE dependencies. Removing upstream declarations would be a separate packaging decision.

## Updating the SDK

1. Inspect the new upstream package and the actual stdio modules before changing the exact version pin.
2. Decide whether upstream native spawning makes this patch unnecessary. Prefer removing the patch when the narrow contract can be met without it.
3. If still needed, review the two full module diffs and replacement anchors. Compute original and prepared hashes from the reviewed bytes; never bless a hash merely because a test failed.
4. Update the patch ID, tests, and this profile together, with no unreviewed compatibility fallback.
5. Reinstall from the lockfile with scripts disabled, exercise pristine/check/apply/repeat cases, run `npm run ci` and browser regressions, and wait for both required OS checks before merging.

Primary API references, checked 2026-11-15: [Node child processes](https://nodejs.org/api/child_process.html) and [process.execPath](https://nodejs.org/api/process.html#processexecpath). The exact installed SDK bytes and lockfile, not a moving documentation example, determine whether this patch can be applied.
