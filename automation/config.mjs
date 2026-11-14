import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export function config(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    "read-root": { type: "string", multiple: true, default: [] },
    "write-root": { type: "string" }, network: { type: "boolean", default: false },
    port: { type: "string", default: "4318" }, help: { type: "boolean", default: false }
  } });
  if (values.help) return { help: true };
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Port must be between 0 and 65535.");
  return { readRoots: values["read-root"], writeRoot: values["write-root"], network: values.network, port };
}
export const isMain = (url) => Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === url;
export const help = "Civitai Metadata Studio companion\n\n  --read-root <directory>  Permit local reads; repeat for additional roots\n  --write-root <directory> Permit new exports in this existing directory\n  --network                Permit explicit public Civitai lookups\n  --port <number>          HTTP port (default 4318); binds 127.0.0.1 only\n\nHTTP requires STUDIO_API_TOKEN in the process environment (24+ characters). Tokens are never printed or saved. Stdio MCP does not need an HTTP token.\nNo read roots, writes, or network calls are enabled implicitly.\n";
