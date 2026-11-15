import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { join, relative, isAbsolute, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { imageFixture, Studio } from "../../tests/fixtures.mjs";
import { patchMcpSdk } from "../../scripts/patch-mcp-sdk.mjs";

const require = createRequire(import.meta.url);
const sdkCjs = require("@modelcontextprotocol/client");
const transportCjs = require("@modelcontextprotocol/client/stdio");
const main = fileURLToPath(new URL("../mcp.mjs", import.meta.url));
const echo = fileURLToPath(new URL("../test-support/stdio-child.mjs", import.meta.url));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function within(promise, timeout = 7000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Native stdio operation timed out")), timeout);
  })]); } finally { clearTimeout(timer); }
}
const scratchDirectories = [];
async function scratch() {
  const base = await realpath(tmpdir());
  const directory = await mkdtemp(join(base, "studio native fixtures Ω "));
  scratchDirectories.push({ base, directory });
  return directory;
}
after(async () => {
  // Close per-test transports before removing directories used as child cwd.
  for (const { base, directory } of scratchDirectories) {
    const path = relative(base, directory);
    assert.ok(path && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
    await rm(directory, { recursive: true, force: true });
  }
});
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } };
async function openEcho(t, options = {}) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [echo], stderr: "pipe", ...options });
  t.after(() => transport.close());
  const stderr = [];
  transport.stderr?.on("data", chunk => stderr.push(chunk.toString()));
  await within(transport.start());
  return { transport, stderr };
}
async function echoRequest(transport, value, method = "fixture/echo", id = 1) {
  const received = deferred();
  transport.onmessage = received.resolve;
  transport.onerror = received.reject;
  await transport.send({ jsonrpc: "2.0", id, method, params: { value } });
  return within(received.promise);
}

test("native stdio runs only after the exact managed SDK patch is verified", async () => {
  const result = await patchMcpSdk({ checkOnly: true });
  assert.deepEqual(result.verified, ["dist/stdio.mjs", "dist/stdio.cjs", "dist/index.mjs", "dist/index.cjs"]);
  assert.deepEqual(result.changed, []);
});

test("native stdio test tripwire blocks all six legacy spawn packages", () => {
  for (const name of ["cross-spawn", "path-key", "shebang-regex", "shebang-command", "which", "isexe"]) {
    assert.throws(() => require(name), { code: "ERR_STUDIO_LEGACY_SPAWN" });
  }
});

for (const [format, ClientClass, TransportClass] of [["ESM", Client, StdioClientTransport], ["CommonJS", sdkCjs.Client, transportCjs.StdioClientTransport]]) {
  test(`native stdio ${format} client discovers and calls the real MCP server`, async t => {
    const client = new ClientClass({ name: "studio-native-stdio-test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
    const transport = new TransportClass({ command: process.execPath, args: [main], stderr: "pipe" });
    t.after(() => client.close());
    await within(client.connect(transport));
    assert.equal((await client.listTools()).tools.length, 14);
    const result = await client.callTool({ name: "capabilities", arguments: {} });
    assert.equal(result.structuredContent.permissions.network, false);
    assert.equal(result.structuredContent.guarantees.pixelReencoding, false);
    assert.equal((await client.listResources()).resources.length, 2);
  });

  test(`native stdio ${format} rejects bare commands, shims and other executables before spawning`, async () => {
    for (const command of ["node", "npm", "npx.cmd", "fixture.bat", "shebang-fixture", "python", process.execPath + ".other"]) {
      const transport = new TransportClass({ command, args: [main], stderr: "pipe" });
      await assert.rejects(transport.start(), { code: "ERR_STUDIO_NODE_ONLY" });
      assert.equal(transport.pid, null);
      await transport.close();
    }
  });
}

test("native stdio MCP image edits preserve a large Unicode prompt and original pixels", async t => {
  const directory = await scratch(), output = join(directory, "new copies"); await mkdir(output);
  const original = Buffer.from(await imageFixture().arrayBuffer());
  const source = join(directory, "source 雪.png"); await writeFile(source, original);
  const client = new Client({ name: "studio-native-image-test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  const transport = new StdioClientTransport({ command: process.execPath, args: [main, "--read-root", directory, "--write-root", output], stderr: "pipe" });
  t.after(() => client.close());
  await within(client.connect(transport));
  const opened = (await client.callTool({ name: "open_image", arguments: { path: source } })).structuredContent;
  const prompt = "A calm library 雪 Ω — literal & %PATH% ! $()\n".repeat(1500);
  const changed = await client.callTool({ name: "edit_image", arguments: { imageId: opened.imageId, expectedRevision: 0, fields: { positivePrompt: prompt, steps: 19, seed: "18446744073709551615" } } });
  assert.equal(changed.isError, undefined);
  const exported = await client.callTool({ name: "export_image", arguments: { imageId: opened.imageId, expectedRevision: 1 } });
  assert.equal(exported.isError, undefined);
  assert.equal(exported.structuredContent.integrity.preserved, true);
  const saved = new File([await readFile(join(output, exported.structuredContent.filename))], "reopened.png");
  const reopened = await Studio.canonical.createRecord(saved, await Studio.canonical.inspectFile(saved));
  assert.equal(reopened.fields.positivePrompt.value, prompt);
  assert.equal(reopened.fields.steps.value, 19);
  assert.equal(reopened.fields.seed.value, "18446744073709551615");
  assert.deepEqual(await readFile(source), original);
});

test("native stdio uses the explicit executable even with an empty PATH", async t => {
  const { transport } = await openEcho(t, { env: { PATH: "" } });
  assert.equal((await echoRequest(transport, "no-path-needed")).result.value, "no-path-needed");
});

test("native stdio preserves cwd, Unicode and literal argument-array values", async t => {
  const directory = await scratch();
  const args = ["space here", "Unicode 雪 Ω", "literal & | %PATH% ! $()", 'a"quote'];
  const { transport } = await openEcho(t, { cwd: directory, args: [echo, ...args], env: { STUDIO_FIXTURE_ENV: "synthetic-only" } });
  const result = (await echoRequest(transport, "cwd-ok")).result;
  assert.equal(await realpath(result.cwd), await realpath(directory));
  assert.deepEqual(result.argv, args); assert.equal(result.fixtureEnv, "synthetic-only");
});

test("native stdio captures stderr separately from JSON-RPC stdout", async t => {
  const { transport, stderr } = await openEcho(t);
  assert.equal((await echoRequest(transport, "stdout-ok")).result.value, "stdout-ok");
  assert.match(stderr.join(""), /fixture stderr ready/);
});

test("native stdio reassembles fragmented multibyte JSON-RPC", async t => {
  const { transport } = await openEcho(t), value = "雪🌌Ω".repeat(3000);
  assert.equal((await echoRequest(transport, value, "fixture/fragment")).result.value, value);
});

test("native stdio honors write backpressure", async t => {
  const { transport } = await openEcho(t), value = "synthetic-payload-".repeat(32000);
  assert.equal((await echoRequest(transport, value)).result.value, value);
});

test("native stdio preserves multiple message IDs and ordering", async t => {
  const { transport } = await openEcho(t), received = deferred(), results = [];
  transport.onmessage = message => { results.push(message); if (results.length === 20) received.resolve(); };
  transport.onerror = received.reject;
  await Promise.all(Array.from({ length: 20 }, (_, id) => transport.send({ jsonrpc: "2.0", id, method: "fixture/echo", params: { value: id } })));
  await within(received.promise);
  assert.deepEqual(results.map(message => message.id), Array.from({ length: 20 }, (_, id) => id));
});

test("native stdio retains SDK recovery after a non-JSON preamble", async t => {
  const { transport } = await openEcho(t), errors = [], received = deferred();
  transport.onerror = error => errors.push(error); transport.onmessage = received.resolve;
  await transport.send({ jsonrpc: "2.0", id: 31, method: "fixture/malformed", params: { value: "valid-after-invalid" } });
  assert.equal((await within(received.promise)).result.value, "valid-after-invalid");
  assert.equal(errors.length, 0);
});

test("native stdio enforces the SDK read-buffer cap", async t => {
  const { transport } = await openEcho(t, { maxBufferSize: 256 }), error = deferred();
  transport.onerror = error.resolve;
  await transport.send({ jsonrpc: "2.0", id: 32, method: "fixture/echo", params: { value: "x".repeat(4000) } });
  assert.match((await within(error.promise)).message, /buffer|limit|size/i);
  await within(transport.close());
});

test("native stdio reports an invalid working directory without a running child", async t => {
  const directory = await scratch();
  const transport = new StdioClientTransport({ command: process.execPath, args: [echo], cwd: join(directory, "missing-cwd"), stderr: "pipe" });
  transport.onerror = () => {}; t.after(() => transport.close());
  await assert.rejects(within(transport.start()), { code: "ENOENT" });
});

test("native stdio reports a nonzero child exit and reaps it", async t => {
  const { transport } = await openEcho(t), pid = transport.pid, closed = deferred();
  transport.onclose = closed.resolve;
  await transport.send({ jsonrpc: "2.0", id: 41, method: "fixture/die" });
  await within(closed.promise); assert.equal(alive(pid), false); assert.equal(transport.pid, null);
});

test("native stdio normal close reaps the child and rejects later sends", async t => {
  const { transport } = await openEcho(t), pid = transport.pid;
  await echoRequest(transport, "close-ok"); await within(transport.close());
  assert.equal(alive(pid), false);
  await assert.rejects(transport.send({ jsonrpc: "2.0", id: 42, method: "fixture/echo" }));
});

test("native stdio terminates a child that lingers after EOF", async t => {
  const { transport } = await openEcho(t, { args: [echo, "--linger-after-eof"] }), pid = transport.pid;
  await echoRequest(transport, "linger-ok"); await within(transport.close(), 7000);
  assert.equal(alive(pid), false);
});

test("native stdio repeated real MCP connections leave no direct child running", async t => {
  for (let index = 0; index < 3; index++) {
    const client = new Client({ name: "studio-native-lifecycle-test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
    const transport = new StdioClientTransport({ command: process.execPath, args: [main], stderr: "pipe" });
    t.after(() => client.close());
    await within(client.connect(transport)); const pid = transport.pid;
    assert.equal((await client.callTool({ name: "capabilities", arguments: {} })).isError, undefined);
    await within(client.close()); assert.equal(alive(pid), false);
  }
});
