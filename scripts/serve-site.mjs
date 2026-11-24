import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { siteOutput, assertSiteOutput } from "./build-site.mjs";
import { publicFiles } from "../site/contract.mjs";
import { project } from "../site/content.mjs";

const types = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8", svg: "image/svg+xml", png: "image/png", xml: "application/xml; charset=utf-8", txt: "text/plain; charset=utf-8" };
export async function createSiteServer(output = siteOutput, port = 0) {
  output = await assertSiteOutput(output);
  // Request text is only a lookup key; filesystem paths come from our catalog.
  const allowed = new Map(publicFiles.map(name => [name, { path: resolve(output, name), type: types[name.split(".").at(-1)] || "application/octet-stream" }]));
  const server = createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405, { Allow: "GET, HEAD" }); response.end(); return; }
    let requested;
    try { requested = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname); } catch { response.writeHead(400); response.end("Bad request"); return; }
    if (requested === "/") { response.writeHead(302, { Location: project.base }); response.end(); return; }
    let relative = requested.startsWith(project.base) ? requested.slice(project.base.length) : "";
    if (requested.endsWith("/")) relative += "index.html";
    const found = requested.startsWith(project.base) && !relative.includes("\\") ? allowed.get(relative) : undefined;
    const file = found || allowed.get("404.html");
    try {
      const bytes = await readFile(file.path);
      response.writeHead(found ? 200 : 404, { "Content-Type": file.type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      if (request.method === "GET") response.end(bytes); else response.end();
    } catch { response.writeHead(503, { "Content-Type": "text/plain" }); response.end("Build the website before previewing it."); }
  });
  await new Promise((yes, no) => { server.once("error", no); server.listen(port, "127.0.0.1", yes); });
  return { server, url: `http://127.0.0.1:${server.address().port}${project.base}`, close: async () => { server.closeAllConnections(); await new Promise(resolveClose => server.close(resolveClose)); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--port");
  const port = index < 0 ? 4173 : Number(process.argv[index + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Use a port between 1 and 65535.");
  const preview = await createSiteServer(siteOutput, port);
  console.log(`Local: ${preview.url}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
