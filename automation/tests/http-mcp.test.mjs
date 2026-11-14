import test from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../http.mjs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { imageFixture } from "../../tests/fixtures.mjs";

async function fileRoots(t) {
  const root = await mkdtemp(join(tmpdir(), "studio-transport-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, "exports"); await mkdir(output);
  const source = join(root, "fixture.png"); await writeFile(source, new Uint8Array(await imageFixture().arrayBuffer()));
  return { root, output, source };
}

const testToken = "studio-test-token-for-isolated-fixtures-only";
async function apiFixture(t, options = {}) {
  const api = await createApi({ token: testToken, ...options }); const address = await api.listen(0);
  t.after(() => new Promise((resolve) => { api.server.close(resolve); api.server.closeAllConnections(); }));
  return { api, base: `http://127.0.0.1:${address.port}` };
}
test("HTTP CLI requires a process token and never logs its value", async (t) => {
  const script = fileURLToPath(new URL("../http.mjs", import.meta.url));
  const missing = spawnSync(process.execPath, [script, "--port", "0"], { env: { ...process.env, STUDIO_API_TOKEN: "" }, encoding: "utf8", timeout: 10_000, windowsHide: true });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Set STUDIO_API_TOKEN/);
  const child = spawn(process.execPath, [script, "--port", "0"], { env: { ...process.env, STUDIO_API_TOKEN: testToken }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = "";
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CLI did not start within ten seconds.")), 10_000);
    const finish = (error) => { clearTimeout(timeout); error ? reject(error) : resolve(); };
    child.once("error", finish);
    child.once("exit", () => { if (!output.includes("not logged")) finish(new Error("CLI exited before startup.")); });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output += chunk.toString(); if (output.includes("not logged")) finish(); });
  });
  const closed = once(child, "close"); child.kill(); await closed;
  assert.equal(output.includes(testToken), false);
  assert.match(output, /not logged/);
});
test("HTTP auth, Host/Origin checks, body types, and OpenAPI discovery enforce the local boundary", async (t) => {
  const { base } = await apiFixture(t);
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const spec = await (await fetch(`${base}/openapi.json`)).json();
  assert.equal(spec.openapi, "3.2.1"); assert.ok(spec.paths["/v1/images/{imageId}"].patch);
  assert.equal(spec.servers[0].url, base);
  assert.equal((await fetch(`${base}/v1/capabilities`)).status, 401);
  assert.equal((await fetch(`${base}/v1/capabilities`, { headers: { Authorization: `Bearer ${testToken}`, Origin: "https://example.com" } })).status, 403);
  const spoofedHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(`${base}/health`, { headers: { Host: "example.com" } }, (response) => { response.resume(); resolve(response.statusCode); });
    request.on("error", reject); request.end();
  });
  assert.equal(spoofedHostStatus, 403);
  const capability = await fetch(`${base}/v1/capabilities`, { headers: { Authorization: `Bearer ${testToken}` } });
  assert.equal(capability.status, 200); assert.equal((await capability.json()).permissions.network, false);
  const badBody = await fetch(`${base}/v1/images`, { method: "POST", headers: { Authorization: `Bearer ${testToken}`, "Content-Type": "text/plain" }, body: "{}" });
  assert.equal(badBody.status, 415); assert.match(badBody.headers.get("content-type"), /application\/problem\+json/);
  assert.equal((await badBody.json()).code, "content_type");
});

test("HTTP edits and exports honor revisions, ETags, idempotency, and real file integrity", async (t) => {
  const { root, output, source } = await fileRoots(t);
  const { base } = await apiFixture(t, { readRoots: [root], writeRoot: output });
  const headers = { Authorization: `Bearer ${testToken}`, "Content-Type": "application/json" };
  const openedResponse = await fetch(`${base}/v1/images`, { method: "POST", headers, body: JSON.stringify({ path: source }) });
  assert.equal(openedResponse.status, 200); assert.equal(openedResponse.headers.get("etag"), '"0"');
  const { imageId } = await openedResponse.json();
  const editUrl = `${base}/v1/images/${imageId}`;
  const edit = { fields: { steps: 18 }, expectedRevision: 0 };
  const first = await fetch(editUrl, { method: "PATCH", headers: { ...headers, "Idempotency-Key": "edit-once" }, body: JSON.stringify(edit) });
  assert.equal(first.status, 200); assert.equal(first.headers.get("etag"), '"1"');
  const replay = await fetch(editUrl, { method: "PATCH", headers: { ...headers, "Idempotency-Key": "edit-once" }, body: JSON.stringify({ expectedRevision: 0, fields: { steps: 18 } }) });
  assert.equal(replay.status, 200); assert.equal((await replay.json()).revision, 1);
  const stale = await fetch(editUrl, { method: "PATCH", headers, body: JSON.stringify(edit) }); assert.equal(stale.status, 409);
  const exportResponse = await fetch(`${editUrl}/export`, { method: "POST", headers: { ...headers, "If-Match": '"1"' }, body: "{}" });
  assert.equal(exportResponse.status, 200);
  const exported = await exportResponse.json(); assert.equal(exported.integrity.preserved, true);
  assert.ok((await readFile(join(output, exported.filename))).length > 0);
});

test("stdio MCP edits and exports a permitted image through the same canonical engine", async (t) => {
  const { root, output, source } = await fileRoots(t);
  const client = new Client({ name: "studio-mcp-workflow-test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../mcp.mjs", import.meta.url)), "--read-root", root, "--write-root", output], stderr: "pipe" });
  t.after(() => client.close());
  await client.connect(transport); await client.listTools();
  const opened = (await client.callTool({ name: "open_image", arguments: { path: source } })).structuredContent;
  const changed = await client.callTool({ name: "edit_image", arguments: { imageId: opened.imageId, expectedRevision: 0, fields: { steps: 17, seed: "18446744073709551615" } } });
  assert.equal(changed.structuredContent.revision, 1);
  assert.equal(changed.structuredContent.fields.seed.value, "18446744073709551615");
  const exported = await client.callTool({ name: "export_image", arguments: { imageId: opened.imageId, expectedRevision: 1 } });
  assert.equal(exported.structuredContent.integrity.preserved, true);
  assert.ok((await readFile(join(output, exported.structuredContent.filename))).length > 0);
});

test("the official MCP client discovers and calls structured tools over current stdio", async (t) => {
  const client = new Client({ name: "studio-integration-test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../mcp.mjs", import.meta.url))], stderr: "pipe" });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 14);
  assert.ok(tools.tools.every((tool) => tool.inputSchema && tool.outputSchema));
  const result = await client.callTool({ name: "capabilities", arguments: {} });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.permissions.network, false);
  assert.equal(result.structuredContent.version, "1.0.0");
  const resources = await client.listResources(); assert.equal(resources.resources.length, 2);
  const resource = await client.readResource({ uri: "studio://capabilities" }); assert.equal(JSON.parse(resource.contents[0].text).name, "Civitai Metadata Studio");
  const prompts = await client.listPrompts(); assert.equal(prompts.prompts[0].name, "audit-image");
  const denied = await client.callTool({ name: "search_resources", arguments: { query: "Example" } });
  assert.equal(denied.isError, true); assert.match(denied.content[0].text, /network_denied/);
});

test("current MCP Streamable HTTP uses the same bearer boundary and metadata engine", async (t) => {
  const { base } = await apiFixture(t);
  const client = new Client({ name: "studio-http-mcp-test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  t.after(() => client.close());
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${testToken}` } } });
  await client.connect(transport);
  const result = await client.callTool({ name: "capabilities", arguments: {} });
  assert.equal(result.structuredContent.guarantees.pixelReencoding, false);
  assert.equal((await fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
});
