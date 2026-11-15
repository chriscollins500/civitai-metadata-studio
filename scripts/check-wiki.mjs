import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Studio from "../src/engine.mjs";

const wikiDirectory = new URL("../docs/wiki/", import.meta.url);

// This deliberately checks the small Markdown subset used by these guides. It is
// not a renderer or an external-link crawler; rendered GitHub review is separate.
function proseAndFences(markdown, report, page) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const prose = [], blocks = [];
  let fence = null, block = [];
  for (const line of lines) {
    const marker = /^\s*(`{3,}|~{3,})([^`]*)$/.exec(line);
    if (!fence && marker) {
      fence = { char: marker[1][0], length: marker[1].length, language: marker[2].trim() };
      block = [];
    } else if (fence && marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) {
      blocks.push({ language: fence.language, text: block.join("\n") });
      fence = null;
    } else if (fence) block.push(line);
    else prose.push(line);
  }
  if (fence) report(`${page}: unclosed code fence`);
  return { prose: prose.join("\n"), blocks };
}

function headingAnchors(prose) {
  const anchors = new Set(), counts = new Map();
  for (const match of prose.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1].toLowerCase().replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/\s/g, "-");
    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    anchors.add(count ? `${base}-${count}` : base);
  }
  return anchors;
}

export function validateWiki({ manifest, pages, contract }) {
  const errors = [], report = (message) => errors.push(message);
  const expected = [...manifest.pages, ...manifest.navigation];
  if (manifest.schemaVersion !== 1) report("Unsupported wiki manifest schema");
  if (new Set(expected).size !== expected.length) report("Duplicate manifest page");
  if (!manifest.pages.includes("Home")) report("Home must be a content page");
  if (manifest.applicationVersion !== contract.version) report("Application version differs from the wiki manifest");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.reviewed)) report("Invalid documentation review date");
  for (const name of expected) if (!pages.has(name)) report(`Missing page: ${name}`);
  for (const name of pages.keys()) if (!expected.includes(name)) report(`Unlisted page: ${name}`);

  const parsed = new Map();
  let words = 0, jsonExamples = 0, internalLinks = 0;
  for (const [name, markdown] of pages) {
    const document = proseAndFences(markdown, report, name);
    parsed.set(name, { ...document, anchors: headingAnchors(document.prose), targets: new Set() });
    if (manifest.pages.includes(name)) {
      if (!/^# [^\n]+/m.test(document.prose)) report(`${name}: missing level-one title`);
      if (markdown.trim().length < 200) report(`${name}: placeholder-sized content`);
      words += markdown.split(/\s+/).filter(Boolean).length;
    }
    // Public guides must not accidentally include this machine's private paths.
    if (/[A-Z]:[\\/]Users[\\/]/i.test(markdown)) report(`${name}: personal profile path in public documentation`);
    for (const block of document.blocks) if (block.language === "json") {
      jsonExamples += 1;
      try { JSON.parse(block.text); } catch { report(`${name}: invalid JSON example`); }
    }
  }

  for (const [name, document] of parsed) {
    for (const match of document.prose.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1];
      let target, fragment;
      try {
        if (href.startsWith(manifest.wikiBase)) {
          const url = new URL(href);
          target = decodeURIComponent(url.pathname.slice(new URL(manifest.wikiBase).pathname.length)) || "Home";
          fragment = decodeURIComponent(url.hash.slice(1));
        } else if (href.startsWith("#")) { target = name; fragment = decodeURIComponent(href.slice(1)); }
        else if (!/^(?:https?:|mailto:)/.test(href)) {
          report(`${name}: use an absolute public URL, not ${href}`);
          continue;
        } else continue;
      } catch { report(`${name}: malformed link ${href}`); continue; }
      internalLinks += 1;
      if (!manifest.pages.includes(target)) report(`${name}: broken wiki target ${target}`);
      else {
        document.targets.add(target);
        if (fragment && !parsed.get(target)?.anchors.has(fragment)) report(`${name}: broken anchor ${target}#${fragment}`);
      }
    }
  }

  const visited = new Set(), queue = ["Home"];
  while (queue.length) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    visited.add(name);
    queue.push(...(parsed.get(name)?.targets || []));
  }
  for (const name of manifest.pages) {
    if (!visited.has(name)) report(`Page unreachable from Home: ${name}`);
    if (!parsed.get("_Sidebar")?.targets.has(name)) report(`Page missing from sidebar: ${name}`);
  }

  for (const [category, tokens] of Object.entries({ generationFields: contract.generationFields, resourceRoles: contract.resourceRoles, mcpTools: contract.mcpTools })) {
    const page = manifest.coverage[category];
    const text = parsed.get(page)?.prose || "";
    for (const token of tokens) if (!text.includes(`\`${token}\``)) report(`${page}: undocumented ${category} entry ${token}`);
  }
  const httpPage = manifest.coverage.httpOperations;
  const http = parsed.get(httpPage)?.prose || "";
  for (const { method, path, operationId } of contract.httpOperations) {
    if (!http.includes(`\`${operationId}\``)) report(`${httpPage}: undocumented HTTP operation ${operationId}`);
    if (!http.includes(`\`${method.toUpperCase()} ${path}\``)) report(`${httpPage}: undocumented HTTP route ${method} ${path}`);
  }
  return { errors, pages: manifest.pages.length, navigation: manifest.navigation.length, internalLinks, jsonExamples, words };
}

export async function checkWiki() {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", wikiDirectory), "utf8"));
  const names = (await readdir(wikiDirectory)).filter((name) => name.endsWith(".md")).sort();
  const pages = new Map(await Promise.all(names.map(async (name) => [name.slice(0, -3), await readFile(new URL(name, wikiDirectory), "utf8")])));
  const specification = JSON.parse(await readFile(new URL("../docs/openapi.json", import.meta.url), "utf8"));
  const httpOperations = Object.entries(specification.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => ({ path, method, operationId: operation.operationId })));
  const routeSource = await readFile(new URL("../automation/openapi.mjs", import.meta.url), "utf8");
  const sourceRoutes = [...routeSource.matchAll(/\["(get|post|patch|delete)", "([^"]+)", "([^"]+)"\]/g)].map(([, method, path, operationId]) => ({ method, path, operationId }));
  const schemaSource = await readFile(new URL("../automation/schemas.mjs", import.meta.url), "utf8");
  const inputSource = schemaSource.split("export const inputs = {")[1]?.split("export const descriptions")[0] || "";
  const mcpTools = [...inputSource.matchAll(/\b([a-z][a-z0-9_]*): z\.strictObject\(/g)].map((match) => match[1]);
  if (!sourceRoutes.length || !mcpTools.length) throw new Error("Wiki contract discovery failed; review source declaration changes.");
  const routeKey = ({ method, path, operationId }) => `${method} ${path} ${operationId}`;
  const actualRoutes = sourceRoutes.map(routeKey).sort(), documentedRoutes = httpOperations.map(routeKey).sort();
  if (JSON.stringify(actualRoutes) !== JSON.stringify(documentedRoutes)) throw new Error("Checked-in OpenAPI routes differ from the source contract.");
  if (JSON.stringify([...mcpTools].sort()) !== JSON.stringify(httpOperations.map((item) => item.operationId).sort())) throw new Error("MCP and HTTP operation inventory differs.");
  const contract = { version: Studio.constants.APP_VERSION,
    generationFields: Studio.constants.GENERATION_FIELDS.map((field) => field.key),
    resourceRoles: Studio.constants.RESOURCE_ROLES.map(([role]) => role), httpOperations, mcpTools };
  const result = validateWiki({ manifest, pages, contract });
  return { ...result, contract };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkWiki();
    if (result.errors.length) throw new Error(result.errors.join("\n"));
    console.log(`Wiki verified: ${result.pages} pages, ${result.navigation} navigation files, ${result.internalLinks} internal links, ${result.jsonExamples} JSON examples, ${result.words.toLocaleString("en-US")} words.`);
    console.log(`Contract coverage: ${result.contract.generationFields.length} fields, ${result.contract.resourceRoles.length} roles, ${result.contract.httpOperations.length} HTTP operations, ${result.contract.mcpTools.length} MCP tools.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
