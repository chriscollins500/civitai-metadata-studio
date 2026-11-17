import test from "node:test";
import assert from "node:assert/strict";
import { checkWiki, validateWiki } from "../scripts/check-wiki.mjs";

function fixture({ heading = "Details", fragment = "details" } = {}) {
  const base = "https://example.test/wiki/";
  const manifest = { schemaVersion: 1, applicationVersion: "1.0.0", reviewed: "2026-11-14", wikiBase: base,
    pages: ["Home", "Reference"], navigation: ["_Sidebar", "_Footer"],
    coverage: { generationFields: "Reference", resourceRoles: "Reference", httpOperations: "Reference", mcpTools: "Reference" } };
  const padding = "An intentionally small synthetic guide for testing documentation integrity. ".repeat(4);
  const pages = new Map([
    ["Home", `# Welcome\n\n${padding}\n[Reference](${base}Reference#${encodeURIComponent(fragment)})`],
    ["Reference", `# Reference\n\n${padding}\n## ${heading}\n\n\`seed\` \`checkpoint\` \`read_image\` \`GET /v1/images/{imageId}\`\n\n\`\`\`json\n{"example":true}\n\`\`\``],
    ["_Sidebar", `[Home](${base}Home)\n[Reference](${base}Reference)`],
    ["_Footer", `[Home](${base}Home)`]
  ]);
  const contract = { version: "1.0.0", generationFields: ["seed"], resourceRoles: ["checkpoint"], mcpTools: ["read_image"],
    httpOperations: [{ method: "get", path: "/v1/images/{imageId}", operationId: "read_image" }] };
  return { manifest, pages, contract };
}

test("wiki checker accepts complete navigation, anchors, JSON, and contract coverage", () => {
  assert.deepEqual(validateWiki(fixture()).errors, []);
});
for (const [description, heading, fragment] of [
  ["inline tags", "<em>Details</em>", "details"],
  ["double-quoted tag delimiters", '<span title="2 > 1">Details</span>', "details"],
  ["single-quoted tag delimiters", "<span title='2 > 1'>Details</span>", "details"],
  ["markup inside quoted attributes", '<span title="<script>example</script>">Details</span>', "details"],
  ["nested tags", "<strong><em>Details</em></strong>", "details"],
  ["malformed nested delimiters", "<<span>Details</span>>", "details"],
  ["comment contents", 'Details<!-- <script> " > -->', "details"],
  ["unfinished comments", "Details<!-- unfinished <script>", "details"],
  ["unfinished quoted attributes", 'Details<span title="unfinished > content', "details"],
  ["unfinished tags", "Details<script", "details"],
  ["a trailing opening delimiter", "Details<", "details"],
  ["Unicode including supplementary letters", "<em>Überblick 中文 𐐀</em>", "überblick-中文-𐐨"]
]) {
  test(`wiki heading anchors handle ${description}`, () => {
    assert.deepEqual(validateWiki(fixture({ heading, fragment })).errors, []);
  });
}
test("wiki heading duplicate suffixes use the final slug", () => {
  const data = fixture({ heading: "<em>Details</em>", fragment: "details-1" });
  data.pages.set("Reference", `${data.pages.get("Reference")}\n## <span title="2 > 1">Details</span>`);
  assert.deepEqual(validateWiki(data).errors, []);
});
test("wiki heading anchors never accept a fragment containing markup", () => {
  const data = fixture({ heading: "Details<script", fragment: "details<script" });
  const errors = validateWiki(data).errors.join("\n");
  assert.match(errors, /broken anchor Reference#details<script/);
});
test("wiki checker rejects missing and unlisted pages", () => {
  const data = fixture(); data.pages.delete("Reference"); data.pages.set("Unexpected", "# Unexpected");
  const errors = validateWiki(data).errors.join("\n");
  assert.match(errors, /Missing page: Reference/); assert.match(errors, /Unlisted page: Unexpected/);
});
test("wiki checker rejects broken targets and heading anchors", () => {
  const data = fixture(); data.pages.set("Home", `${data.pages.get("Home")}\n[bad](${data.manifest.wikiBase}Absent)\n[anchor](${data.manifest.wikiBase}Reference#absent)`);
  const errors = validateWiki(data).errors.join("\n");
  assert.match(errors, /broken wiki target Absent/); assert.match(errors, /broken anchor Reference#absent/);
});
test("wiki checker finds unreachable pages and sidebar omissions", () => {
  const data = fixture(); data.pages.set("Home", "# Home\n" + "Home content. ".repeat(30)); data.pages.set("_Sidebar", `[Home](${data.manifest.wikiBase}Home)`);
  const errors = validateWiki(data).errors.join("\n");
  assert.match(errors, /unreachable from Home: Reference/); assert.match(errors, /missing from sidebar: Reference/);
});
test("wiki checker rejects incomplete field, role, operation, and tool references", () => {
  const data = fixture(); data.pages.set("Reference", "# Reference\n" + "Reference content. ".repeat(30));
  const errors = validateWiki(data).errors.join("\n");
  for (const entry of ["generationFields entry seed", "resourceRoles entry checkpoint", "HTTP operation read_image", "HTTP route get", "mcpTools entry read_image"]) assert.ok(errors.includes(entry), entry);
});
test("wiki checker rejects invalid JSON and an unclosed fence", () => {
  const data = fixture(); data.pages.set("Home", `${data.pages.get("Home")}\n\`\`\`json\n{broken}\n\`\`\`\n\`\`\`text\nunclosed`);
  const errors = validateWiki(data).errors.join("\n");
  assert.match(errors, /invalid JSON example/); assert.match(errors, /unclosed code fence/);
});
test("wiki checker ignores fake Markdown links inside code examples", () => {
  const data = fixture(); data.pages.set("Home", `${data.pages.get("Home")}\n\`\`\`text\n[not a link](${data.manifest.wikiBase}Absent)\n\`\`\``);
  assert.deepEqual(validateWiki(data).errors, []);
});
test("wiki checker catches private machine paths and relative links", () => {
  const data = fixture(); data.pages.set("Home", `${data.pages.get("Home")}\nC:\\Users\\Example\\private.png\n[relative](other.md)`);
  const errors = validateWiki(data).errors.join("\n");
  assert.match(errors, /personal profile path/); assert.match(errors, /absolute public URL/);
});
test("wiki checker detects application-version drift", () => {
  const data = fixture(); data.contract.version = "2.0.0";
  assert.match(validateWiki(data).errors.join("\n"), /Application version differs/);
});
test("the actual wiki matches the current application, HTTP, and MCP contracts", async () => {
  const result = await checkWiki();
  assert.deepEqual(result.errors, []);
  assert.equal(result.pages, 28);
  assert.equal(result.contract.generationFields.length, 16);
  assert.equal(result.contract.resourceRoles.length, 14);
  assert.equal(result.contract.httpOperations.length, 14);
  assert.equal(result.contract.mcpTools.length, 14);
});
