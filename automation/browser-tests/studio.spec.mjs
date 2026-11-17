import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { imageFixture, Studio } from "../../tests/fixtures.mjs";
const url = new URL("../../dist/civitai-metadata-studio.html", import.meta.url).href;
const payload = async (file) => ({ name: file.name, mimeType: file.type, buffer: Buffer.from(await file.arrayBuffer()) });
async function openImage(page, file = imageFixture()) {
  await page.locator("#fileInput").setInputFiles(await payload(file));
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("3");
}
test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.getByLabel("Automatic Civitai verification", { exact: true }).uncheck();
});

test("portable launch and editor have no horizontal overflow or blocked actions", async ({ page }) => {
  await expect(page.locator("#heroTitle")).toContainText("The whole story.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator("#themeButton").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("#themeButton").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await openImage(page);
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#top")).toBeHidden();
  const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, save: document.getElementById("saveButton").getBoundingClientRect().toJSON(), tabs: document.querySelector("[role=tablist]").getBoundingClientRect().toJSON() }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.save.bottom).toBeLessThanOrEqual(page.viewportSize().height + 1);
  expect(geometry.save.width).toBeGreaterThan(44);
  await page.screenshot({ path: `../.tmp/studio-${test.info().project.name}.png`, fullPage: true });
});

test("edits, validation, history and tab keyboard controls remain accessible", async ({ page }) => {
  await openImage(page);
  const steps = page.getByLabel("Steps", { exact: true });
  await steps.fill("12"); await steps.blur();
  await page.getByRole("button", { name: "Undo last edit" }).click();
  await expect(steps).toHaveValue("8");
  await page.getByRole("button", { name: "Redo last edit" }).click();
  await expect(steps).toHaveValue("12");
  const width = page.getByLabel("Width", { exact: true });
  await width.fill("0"); await width.blur();
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#saveButton")).toBeDisabled();
  await width.fill("3"); await width.blur();
  await expect(page.locator("#saveButton")).toBeEnabled();
  await page.getByRole("tab", { name: "Generation", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Resources", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#generationSection")).toBeHidden();
});

test("commands search, run an action, trap focus and close with Escape", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "What would you like to do?" })).toBeVisible();
  await page.getByLabel("Find a command").fill("assistant");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "One engine. More ways to create." })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("resource filters are local and queue clearing returns to the welcome state", async ({ page }) => {
  const requests = []; page.on("request", (request) => { if (request.url().startsWith("https:")) requests.push(request.url()); });
  await openImage(page, imageFixture("png", { resources: [{ name: "Nightglass", role: "lora", hashes: { AutoV2: "ABCDEF1234" } }, { name: "Lenscraft", role: "lora" }] }));
  await page.getByRole("tab", { name: "Resources", exact: true }).click();
  await page.getByLabel("Find a resource in this image").fill("Nightglass");
  await expect(page.locator("#resourcesList .resource-card")).toHaveCount(1);
  await expect(page.locator("#resourceResultCount")).toHaveText("1 of 2");
  await page.getByLabel("Filter resources by verification").selectOption("verified");
  await expect(page.locator("#resourcesList")).toHaveText("No resources match these filters.");
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Clear image queue", exact: true }).click();
  await expect(page.locator("#top")).toBeVisible();
  await expect(page.locator("#workspace")).toBeHidden();
});

test("a saved copy reopens with edited fields and an exact encoded-payload proof", async ({ page }) => {
  const source = imageFixture(); await openImage(page, source);
  await page.getByLabel("Positive prompt", { exact: true }).fill("A library among the stars");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#saveButton").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("sample_metadata.png");
  const bytes = await readFile(await download.path());
  const output = new File([bytes], download.suggestedFilename());
  const before = await Studio.canonical.createRecord(source, await Studio.canonical.inspectFile(source));
  const proof = await Studio.integrity.verifyExport(before, output);
  expect(proof.preserved).toBe(true);
  const reopened = await Studio.canonical.createRecord(output, await Studio.canonical.inspectFile(output));
  expect(reopened.fields.positivePrompt.value).toBe("A library among the stars");
  expect(reopened.fields.width.value).toBe(3);
});

test("malformed images are contained and do not disable the next valid image", async ({ page }) => {
  await page.locator("#fileInput").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not a PNG") });
  await expect(page.locator("#statusTitle")).toContainText("could not be opened");
  await page.locator("#fileInput").setInputFiles(await payload(imageFixture()));
  await page.locator("#fileQueue button[data-index='1']").click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("3");
  await expect(page.locator("#saveButton")).toBeEnabled();
});

test("browser verification batches hashes, links exact identities and reuses its cache", async ({ page }) => {
  const calls = [];
  const sha = "A".repeat(64);
  const version = { id: 34, modelId: 12, name: "Version One", air: "urn:air:sdxl:checkpoint:civitai:12@34", baseModel: "SDXL 1.0", model: { id: 12, name: "Official checkpoint", type: "Checkpoint", creator: { username: "fixture" }, allowNoCredit: true, allowCommercialUse: ["Image"], allowDerivatives: true, allowDifferentLicense: true }, files: [{ id: 56, name: "fixture.safetensors", primary: true, hashes: { SHA256: sha, AutoV2: sha.slice(0, 10) } }] };
  await page.route("https://civitai.com/api/v1/**", async (route) => {
    const request = route.request();
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    calls.push({ url: request.url(), method: request.method(), body: request.postData() });
    await route.fulfill({ json: [version], headers });
  });
  await openImage(page, imageFixture("png", { resources: [{ name: "Local checkpoint", role: "checkpoint", modelVersionId: 34, hashes: { SHA256: sha } }] }));
  await page.locator("#verifyButton").click();
  await expect(page.locator("#statusTitle")).toHaveText("Verified with Civitai");
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("POST");
  expect(JSON.parse(calls[0].body)).toEqual([sha]);
  await page.getByRole("tab", { name: "Resources", exact: true }).click();
  const link = page.locator("#resourcesList .resource-title a");
  await expect(link).toHaveAttribute("href", "https://civitai.com/models/12?modelVersionId=34");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await page.locator("#verifyButton").click();
  await expect(page.locator("#statusSummary")).toContainText("0 API requests");
  expect(calls).toHaveLength(1);
});

test("browser rate-limit cooldown survives clearing the public model cache", async ({ page }) => {
  const now = new Date();
  await page.clock.setFixedTime(now);
  let calls = 0;
  await page.route("https://civitai.com/api/v1/**", async (route) => {
    calls += 1;
    await route.fulfill({ status: 429, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Retry-After",
      "Retry-After": "60"
    }, json: {} });
  });
  await openImage(page, imageFixture("png", { resources: [{ name: "Fixture", role: "checkpoint", hashes: { AutoV2: "ABCDEF1234" } }] }));
  await page.locator("#verifyButton").click();
  await expect(page.locator("#statusTitle")).toHaveText("Verification needs attention");
  await expect(page.locator("#statusSummary")).toContainText("rate-limited");
  await expect(page.locator("#statusSummary")).toContainText("60 seconds");
  await page.getByRole("tab", { name: "Resources", exact: true }).click();
  await page.locator("#cacheButton").click();
  await page.locator("#clearCacheButton").click();
  await page.keyboard.press("Escape");
  // Go past the hidden-header fallback without relying on the runner's speed.
  await page.clock.setFixedTime(new Date(now.getTime() + 2000));
  await page.locator("#verifyButton").click();
  await expect(page.locator("#statusSummary")).toContainText("0 API requests");
  await expect(page.locator("#statusSummary")).toContainText("58 seconds");
  expect(calls).toBe(1);
});

test("real browser-encoded JPEG and WebP copies preserve pixels and edited metadata", async ({ page }) => {
  for (const format of ["jpeg", "webp"]) {
    const bytes = await page.evaluate(async (format) => {
      const canvas = document.createElement("canvas"); canvas.width = 3; canvas.height = 2;
      const context = canvas.getContext("2d"); context.fillStyle = "#006b59"; context.fillRect(0, 0, 3, 2);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, `image/${format}`));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, format);
    const source = new File([Uint8Array.from(bytes)], `sample.${format === "jpeg" ? "jpg" : format}`, { type: `image/${format}` });
    await openImage(page, source);
    await page.getByLabel("Negative prompt", { exact: true }).fill("test-only negative prompt");
    const pending = page.waitForEvent("download");
    await page.locator("#saveButton").click();
    const download = await pending;
    const output = new File([await readFile(await download.path())], download.suggestedFilename());
    const before = await Studio.canonical.createRecord(source, await Studio.canonical.inspectFile(source));
    expect((await Studio.integrity.verifyExport(before, output)).preserved).toBe(true);
    const reopened = await Studio.canonical.createRecord(output, await Studio.canonical.inspectFile(output));
    expect(reopened.format).toBe(format);
    expect(reopened.fields.negativePrompt.value).toBe("test-only negative prompt");
    await page.getByRole("button", { name: "Clear image queue", exact: true }).click();
  }
});
