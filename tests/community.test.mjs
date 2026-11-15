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
  assert.deepEqual(checks.required_status_checks.map((check) => check.context).sort(), ["Verify (ubuntu-latest)", "Verify (windows-latest)"]);
  assert.ok(checks.required_status_checks.every((check) => check.integration_id === 15368));
  assert.ok(main.rules.some((rule) => rule.type === "deletion")); assert.ok(main.rules.some((rule) => rule.type === "non_fast_forward"));
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
