import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpServer } from "./mcp.mjs";
import { StudioService, StudioError } from "./service.mjs";
import { openapi, routes } from "./openapi.mjs";
import { config, isMain, help } from "./config.mjs";
import Studio from "../src/engine.mjs";
import { outputs } from "./schemas.mjs";

const MAX_BODY = 2 * 1024 * 1024;
async function jsonBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) throw new StudioError("content_type", "Send application/json.", 415);
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new StudioError("body_limit", "JSON body exceeds 2 MiB.", 413);
    chunks.push(chunk);
  }
  try { const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new StudioError("invalid_json", "Send a JSON object."); }
}
const authorized = (header, token) => {
  const value = Buffer.from(header || ""); const expected = Buffer.from(`Bearer ${token}`);
  return value.length === expected.length && timingSafeEqual(value, expected);
};
export async function createApi(options = {}) {
  const service = options.service || await new StudioService(options).initialize();
  const token = options.token || process.env.STUDIO_API_TOKEN || randomBytes(32).toString("base64url");
  if (token.length < 24 || /[\r\n]/.test(token)) throw new Error("STUDIO_API_TOKEN must be at least 24 characters without newlines.");
  const idempotency = new Map();
  const mcpHandler = createMcpHandler(() => createMcpServer(service), { legacy: "reject", maxRequestBodySize: MAX_BODY, maxSubscriptions: 4 });
  const handleMcp = toNodeHandler(mcpHandler, { maxRequestBodySize: MAX_BODY });
  let active = 0, budget = 120, budgetStart = Date.now();
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 15_000, headersTimeout: 10_000, keepAliveTimeout: 5000 }, async (request, response) => {
    const requestId = randomUUID();
    let acquired = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Operation timed out.", "AbortError")), 120_000);
    timer.unref();
    response.on("close", () => { if (!response.writableFinished) controller.abort(); });
    const send = (status, value, type = "application/json") => {
      if (response.destroyed) return;
      response.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-ID": requestId, "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" });
      response.end(JSON.stringify(value));
    };
    try {
      const port = server.address()?.port;
      if (request.headers.host !== `127.0.0.1:${port}`) throw new StudioError("invalid_host", "Use the loopback address printed on startup.", 403);
      if (request.headers.origin) throw new StudioError("origin_denied", "The automation API accepts local non-browser clients only.", 403);
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (url.username || url.password) throw new StudioError("invalid_url", "Invalid request URL.");
      if (request.method === "GET" && url.pathname === "/health") { send(200, { status: "ok", version: service.capabilities().version }); return; }
      if (request.method === "GET" && url.pathname === "/openapi.json") { send(200, openapi(`http://127.0.0.1:${port}`)); return; }
      if (!authorized(request.headers.authorization, token)) {
        response.setHeader("WWW-Authenticate", 'Bearer realm="Civitai Metadata Studio"');
        throw new StudioError("unauthorized", "A valid local process bearer token is required.", 401);
      }
      if (Date.now() - budgetStart > 60_000) { budgetStart = Date.now(); budget = 120; }
      if (--budget < 0) { response.setHeader("Retry-After", "60"); throw new StudioError("request_limit", "Local request budget reached. Wait one minute.", 429); }
      if (active >= 4) { response.setHeader("Retry-After", "1"); throw new StudioError("busy", "Four operations are already active.", 503); }
      active += 1; acquired = true;
      if (url.pathname === "/mcp") {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        await handleMcp(request, response);
        return;
      }
      const route = routes.map(([method, path, name]) => ({ method, path, name, match: url.pathname.match(new RegExp(`^${path.replace("{imageId}", "([a-fA-F0-9-]+)")}$`)) })).find((item) => item.method.toUpperCase() === request.method && item.match);
      if (!route) throw new StudioError("not_found", "Unknown API operation.", 404);
      const args = ["POST", "PATCH"].includes(request.method) ? await jsonBody(request) : {};
      if (route.match[1]) args.imageId = route.match[1];
      if (url.searchParams.has("includePrompts")) {
        if (!["true", "false"].includes(url.searchParams.get("includePrompts"))) throw new StudioError("invalid_arguments", "includePrompts must be true or false.", 422);
        args.includePrompts = url.searchParams.get("includePrompts") === "true";
      }
      if (request.headers["if-match"]) {
        const value = /^"(\d+)"$/.exec(request.headers["if-match"]);
        if (!value) throw new StudioError("invalid_precondition", 'If-Match must contain a quoted revision such as "0".');
        const revision = Number(value[1]);
        if (args.expectedRevision !== undefined && args.expectedRevision !== revision) throw new StudioError("revision_conflict", "If-Match and expectedRevision disagree.", 409);
        args.expectedRevision = revision;
      }
      const key = request.headers["idempotency-key"];
      if (key && (typeof key !== "string" || key.length > 128)) throw new StudioError("invalid_idempotency_key", "Idempotency-Key must contain at most 128 characters.");
      const fingerprint = createHash("sha256").update(`${route.name}:${Studio.util.stableStringify(args, 0)}`).digest("hex");
      for (const [storedKey, item] of idempotency) if (item.expires <= Date.now()) idempotency.delete(storedKey);
      if (key && idempotency.has(key)) {
        const cached = idempotency.get(key);
        if (cached.fingerprint !== fingerprint) throw new StudioError("idempotency_conflict", "That key was used for different arguments.", 409);
        const result = await cached.result;
        if (result.revision !== undefined) response.setHeader("ETag", `"${result.revision}"`);
        send(200, result); return;
      }
      const pending = service.call(route.name, args, { signal: controller.signal });
      if (key) {
        if (idempotency.size >= 128) idempotency.delete(idempotency.keys().next().value);
        idempotency.set(key, { fingerprint, result: pending, expires: Date.now() + 5 * 60_000 });
      }
      let result;
      try { result = outputs[route.name].parse(await pending); } catch (error) { if (key) idempotency.delete(key); throw error; }
      if (result.revision !== undefined) response.setHeader("ETag", `"${result.revision}"`);
      send(200, result);
    } catch (error) {
      const known = error instanceof StudioError;
      send(known ? error.status : error.name === "AbortError" ? 408 : 500,
        { type: "about:blank", title: known ? error.message : error.name === "AbortError" ? "Operation cancelled or timed out." : "The operation could not be completed.", status: known ? error.status : error.name === "AbortError" ? 408 : 500, code: known ? error.code : "operation_failed", requestId }, "application/problem+json");
    } finally { clearTimeout(timer); if (acquired) active -= 1; }
  });
  server.maxConnections = 32;
  server.on("close", () => { service.dispose(); void mcpHandler.close(); });
  return { server, service, token, listen: (port = 4318) => new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", () => resolve(server.address())); }) };
}
if (isMain(import.meta.url)) {
  try {
    const options = config();
    if (options.help) console.error(help);
    else if (!process.env.STUDIO_API_TOKEN) {
      console.error("Set STUDIO_API_TOKEN in this terminal before starting the HTTP API. See docs/automation.md or --help. Tokens are never printed or saved.");
      process.exitCode = 1;
    }
    else {
      const api = await createApi(options);
      const address = await api.listen(options.port);
      console.error(`Civitai Metadata Studio API: http://127.0.0.1:${address.port}\nOpenAPI: http://127.0.0.1:${address.port}/openapi.json\nAuthentication: STUDIO_API_TOKEN from the process environment (not logged).`);
      for (const event of ["SIGINT", "SIGTERM"]) process.once(event, () => { api.server.close(); api.server.closeAllConnections(); });
    }
  } catch { console.error("Unable to start Studio API. Check configured roots, port, token length, and permissions. Use --help."); process.exitCode = 1; }
}
