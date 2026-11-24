import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("issue-form attributes use block mappings so prose commas cannot become unknown keys", async () => {
  for (const form of ["bug_report", "feature_request", "metadata_mismatch"]) {
    const text = await read(`.github/ISSUE_TEMPLATE/${form}.yml`);
    assert.doesNotMatch(text, /^\s*attributes:\s*\{/m, `${form}: block attributes are required for safe prose`);
    assert.match(text, /private/i);
    assert.match(text, /required:\s*true/);
  }
  const mismatch = await read(".github/ISSUE_TEMPLATE/metadata_mismatch.yml");
  assert.match(mismatch, /description: Include current versions, not local paths\./);
});
test("reviewed main rules require CI and PRs without a solo-maintainer review deadlock", async () => {
  const main = JSON.parse(await read(".github/repository/main-ruleset.json"));
  assert.equal(main.enforcement, "active"); assert.deepEqual(main.bypass_actors, []);
  assert.equal(main.rules.find((rule) => rule.type === "pull_request").parameters.required_approving_review_count, 0);
  const checks = main.rules.find((rule) => rule.type === "required_status_checks").parameters;
  assert.equal(checks.strict_required_status_checks_policy, true);
  assert.deepEqual(checks.required_status_checks.map((check) => check.context).sort(), ["CodeQL", "Verify (ubuntu-latest)", "Verify (windows-latest)"]);
  for (const check of checks.required_status_checks) assert.equal(check.integration_id, check.context === "CodeQL" ? 57789 : 15368);
  assert.equal(main.rules.find(rule => rule.type === "pull_request").parameters.require_extra_approval_for_unattributed_changes, true);
  assert.ok(main.rules.some((rule) => rule.type === "deletion")); assert.ok(main.rules.some((rule) => rule.type === "non_fast_forward"));
});

test("public entry points route back to the hub without stale first-release claims", async () => {
  const home = "https://chriscollins500.github.io/civitai-metadata-studio/";
  for (const path of ["README.md", "SUPPORT.md", "CONTRIBUTING.md", "ROADMAP.md", "docs/wiki/Home.md", "docs/wiki/_Sidebar.md", "docs/wiki/_Footer.md", ".github/community/welcome.md", ".github/community/support-and-privacy.md", ".github/ISSUE_TEMPLATE/config.yml"]) {
    assert.ok((await read(path)).includes(home), path + " must link to the project website");
  }
  assert.doesNotMatch(await read("ROADMAP.md"), /The 1\.0\.0 product/);
  const bug = await read(".github/ISSUE_TEMPLATE/bug_report.yml");
  assert.match(bug, /Project website, navigation, search, or learning hub/);
  assert.match(bug, /Application version or website URL/);
  for (const form of ["bug_report", "metadata_mismatch"]) assert.doesNotMatch(await read(".github/ISSUE_TEMPLATE/" + form + ".yml"), /placeholder: 1\.0\.0/);
});

test("roadmap notes scope only the five existing Next/Explore cards", async () => {
  const notes = JSON.parse(await read(".github/community/roadmap-notes.json"));
  assert.equal(notes.schemaVersion, 1);
  assert.equal(notes.projectNumber, 1);
  assert.equal(notes.items.length, 5);
  assert.equal(new Set(notes.items.map(item => item.draftId)).size, 5);
  for (const item of notes.items) {
    assert.ok(["Next", "Explore"].includes(item.expectedStatus));
    assert.match(item.draftId, /^DI_/);
    assert.match(item.body, /## Scope/); assert.match(item.body, /## Acceptance/); assert.match(item.body, /## Boundaries/);
    assert.match(item.body, /https:\/\/chriscollins500\.github\.io\/civitai-metadata-studio\//);
    assert.doesNotMatch(item.body, /deadline|will ship on/i);
  }
});
test("version-tag profile prevents moves and deletion but permits new versions", async () => {
  const tags = JSON.parse(await read(".github/repository/release-tags-ruleset.json"));
  assert.deepEqual(tags.conditions.ref_name.include, ["refs/tags/v*"]);
  assert.deepEqual(tags.bypass_actors, []);
  assert.deepEqual(tags.rules.map((rule) => rule.type).sort(), ["deletion", "non_fast_forward", "update"]);
});
test("Pages publishing stays main-only, behind verification, without contents-write permissions", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  const pages = workflow.slice(workflow.indexOf("  pages-build:"));
  assert.match(pages, /needs: verify/);
  assert.equal((pages.match(/github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/g) || []).length, 2);
  assert.match(pages, /needs: pages-build/);
  assert.match(pages, /pages: write/); assert.match(pages, /id-token: write/);
  assert.doesNotMatch(pages, /contents: write|secrets\./);
  assert.match(pages, /without rebuilding it/);
});

test("required OS checks cover clean repack installs and all browser checks on both Node runtimes", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  const verify = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  attest:"));
  assert.match(verify, /name: Verify \(\$\{\{ matrix\.os \}\}\)/);
  assert.match(verify, /- ubuntu-latest/); assert.match(verify, /- windows-latest/);
  assert.match(verify, /node-version: 24/); assert.match(verify, /node-version: 26/);
  assert.ok(verify.indexOf("npm run sdk:repack") < verify.indexOf("npm ci --prefix automation --ignore-scripts"));
  assert.ok(verify.indexOf("npm ci --prefix automation --ignore-scripts") < verify.indexOf("npm run sdk:check"));
  assert.ok(verify.indexOf("npm run sdk:check") < verify.indexOf("npm run test:automation"));
  assert.match(verify.slice(verify.indexOf("node-version: 26")), /npm run sdk:repack\s+npm ci --prefix automation --ignore-scripts\s+npm run sdk:check\s+npm run ci\s+npm run test:browser/);
  assert.equal((verify.match(/npm run test:browser/g) || []).length, 2);
  assert.match(verify, /node node_modules\/playwright\/cli\.js install --with-deps chrome msedge/);
  const manifest = JSON.parse(await read("automation/package.json"));
  assert.match(manifest.scripts.test, /^node \.\.\/scripts\/verify-mcp-sdk\.mjs && node --import \.\/test-support\/block-legacy-spawn\.mjs --test /);
  for (const hook of ["preinstall", "install", "postinstall", "prepare"]) assert.equal(manifest.scripts[hook], undefined);
});
