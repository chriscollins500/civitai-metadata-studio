import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildSite } from "../../scripts/build-site.mjs";
import { createSiteServer } from "../../scripts/serve-site.mjs";
import { pages, guides, project } from "../../site/content.mjs";
import Studio from "../../src/engine.mjs";

let output, preview;
const temporary = fileURLToPath(new URL("../../.tmp/", import.meta.url));
test.beforeAll(async () => {
  await mkdir(temporary, { recursive: true });
  output = await mkdtemp(resolve(temporary, "site-browser-"));
  await buildSite(output);
  preview = await createSiteServer(output);
});
test.afterAll(async () => {
  await preview?.close();
  if (output && resolve(output).startsWith(resolve(temporary, "site-browser-"))) await rm(output, { recursive: true, force: true });
});
const noOverflow = async page => {
  const bounds = await page.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll("main *")].filter(node => {
      const box = node.getBoundingClientRect();
      return box.width && getComputedStyle(node).position !== "absolute" && (box.right > innerWidth + 1 || box.left < -1);
    }).slice(0, 6).map(node => node.tagName + "." + node.className)
  }));
  expect(bounds.scroll, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.width + 1);
};
test("all hub routes render with semantics, local assets, and no horizontal overflow", async ({ page }) => {
  const errors = [], violations = [], external = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (!request.url().startsWith(preview.url)) external.push(request.url()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", event => window.__csp.push(event.violatedDirective));
  });
  for (const item of pages) {
    const response = await page.goto(preview.url + item.route);
    expect(response.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation", exact: true })).toBeVisible();
    await expect(page.locator(".main-nav [aria-current=page]")).toHaveCount(item.key === "notFound" ? 0 : 1);
    await expect(page.getByRole("button", { name: "Search the project", exact: true })).toBeVisible();
    await noOverflow(page);
    if (test.info().project.name === "chrome-desktop") await page.screenshot({ path: resolve(temporary, "hub-page-" + item.key + ".png"), fullPage: true });
    violations.push(...await page.evaluate(() => window.__csp));
  }
  expect(errors).toEqual([]); expect(violations).toEqual([]); expect(external).toEqual([]);
  await page.goto(preview.url);
  await page.screenshot({ path: resolve(temporary, "hub-" + test.info().project.name + ".png"), fullPage: true });
});
test("keyboard search is local, bounded, escapable, and restores focus", async ({ page }) => {
  await page.goto(preview.url);
  const open = page.getByRole("button", { name: "Search the project", exact: true });
  await open.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Search the project", exact: true });
  await expect(dialog).toBeVisible();
  const query = page.getByLabel("A topic, question, field, or tool");
  await expect(query).toBeFocused();
  await query.fill("hash");
  await expect(dialog.locator("[data-search-item]:visible")).not.toHaveCount(0);
  await query.fill("no-such-synthetic-answer-91823");
  await expect(dialog.locator(".search-empty")).toBeVisible();
  await expect(page.locator("#search-count")).toHaveText("0 destinations");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible(); await expect(open).toBeFocused();
  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Close search", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
test("guide search combines query and topic without losing the complete handbook", async ({ page }) => {
  await page.goto(preview.url + "learn/");
  await expect(page.locator("[data-guide]:visible")).toHaveCount(28);
  await page.getByRole("button", { name: "Developers", exact: true }).click();
  const developerCount = guides.filter(guide => guide.topic === "Developers").length;
  await expect(page.locator("[data-guide]:visible")).toHaveCount(developerCount);
  await expect(page.locator("#guide-count")).toHaveText(developerCount + " of 28 guides");
  await page.getByLabel("Find a guide").fill("no-such-guide-91823");
  await expect(page.locator("#guide-empty")).toBeVisible();
  await page.getByLabel("Find a guide").fill("");
  await page.getByRole("button", { name: "All guides", exact: true }).click();
  await expect(page.locator("[data-guide]:visible")).toHaveCount(28);
  await expect(page.getByRole("button", { name: "All guides", exact: true })).toHaveAttribute("aria-pressed", "true");
});
test("case-study tabs expose roving focus and correct panels", async ({ page }) => {
  await page.goto(preview.url + "learn/");
  const size = page.getByRole("tab", { name: "The size plot twist" });
  await size.focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "The unused guest" })).toBeFocused();
  await expect(page.locator("#case-resource")).toBeVisible();
  await expect(page.locator("#case-size")).toBeHidden();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "The echoing prompt" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(size).toBeFocused();
  await expect(page.getByRole("tab", { selected: true })).toHaveCount(1);
  await expect(page.locator("[data-case-panel]:visible")).toHaveCount(1);
});
test("themes have readable token contrast and store only a disclosed preference", async ({ page }) => {
  await page.goto(preview.url);
  for (const theme of ["dark", "light"]) {
    if (theme === "light") await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const contrasts = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const color = name => style.getPropertyValue(name).trim();
      const luminance = hex => {
        const value = hex.slice(1); const expanded = value.length === 3 ? [...value].map(c => c + c).join("") : value;
        const rgb = [0, 2, 4].map(offset => parseInt(expanded.slice(offset, offset + 2), 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      return ["--bg", "--surface", "--raised"].flatMap(background => ["--ink", "--muted", "--accent"].map(foreground => ({ foreground, background, ratio: ratio(color(foreground), color(background)) })));
    });
    for (const contrast of contrasts) expect(contrast.ratio, JSON.stringify({ theme, ...contrast })).toBeGreaterThanOrEqual(4.5);
    if (theme === "light" && test.info().project.name === "chrome-desktop") await page.screenshot({ path: resolve(temporary, "hub-light.png"), fullPage: true });
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["cms.site.theme"]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});
test("blocked storage and clipboard degrade without blocking navigation or commands", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Synthetic storage policy", "SecurityError"); } });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("Synthetic denied clipboard"); } } });
  });
  await page.goto(preview.url + "downloads/");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Copy command", exact: true }).click();
  await expect(page.locator("#site-announcement")).toContainText("Command selected");
  expect(await page.evaluate(() => getSelection().toString())).toContain("gh attestation verify");
  await noOverflow(page);
});
test("content and destinations remain useful with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: test.info().project.use.viewport });
  try {
    const page = await context.newPage();
    await page.goto(preview.url + "learn/");
    await expect(page.locator("[data-guide]")).toHaveCount(28);
    await expect(page.locator("[data-case-panel]:visible")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Download the sample PNG" })).toBeVisible();
    await expect(page.locator(".main-nav a")).toHaveCount(6);
    await expect(page.locator(".js-only:visible")).toHaveCount(0);
    await noOverflow(page);
  } finally { await context.close(); }
});
test("320px, enlarged text, reduced motion, focus, and forced colors remain operable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const item of pages.filter(item => item.key !== "notFound")) {
    await page.goto(preview.url + item.route);
    await noOverflow(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await noOverflow(page);
  }
  await page.goto(preview.url);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  expect(await page.getByRole("link", { name: "Skip to content" }).evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.emulateMedia({ forcedColors: "active" });
  await page.getByRole("button", { name: "Search the project", exact: true }).click();
  await expect(page.locator("#project-search")).toBeVisible();
  await page.keyboard.press("Escape");
});
test("hosted artifact is exact and tutorial save reopens with encoded pixels intact", async ({ page, request }) => {
  const manifest = await (await request.get(preview.url + "release.json")).json();
  const html = await (await request.get(preview.url + "app/")).body();
  expect(createHash("sha256").update(html).digest("hex")).toBe(manifest.portable.sha256);
  const sample = await (await request.get(preview.url + "assets/night-shift.png")).body();
  const source = new File([sample], "night-shift.png", { type: "image/png" });
  const external = [];
  page.on("request", request => { if (request.url().startsWith("https:")) external.push(request.url()); });
  await page.goto(preview.url + "app/");
  await page.getByLabel("Automatic Civitai verification", { exact: true }).uncheck();
  await page.locator("#fileInput").setInputFiles({ name: "night-shift.png", mimeType: "image/png", buffer: sample });
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("768");
  await expect(page.getByLabel("Height", { exact: true })).toHaveValue("512");
  await page.getByLabel("Positive prompt", { exact: true }).fill("A synthetic edited night shift");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#saveButton").click();
  const download = await downloadPromise;
  const copy = new File([await readFile(await download.path())], download.suggestedFilename(), { type: "image/png" });
  const before = await Studio.canonical.createRecord(source, await Studio.canonical.inspectFile(source));
  expect((await Studio.integrity.verifyExport(before, copy)).preserved).toBe(true);
  const reopened = await Studio.canonical.createRecord(copy, await Studio.canonical.inspectFile(copy));
  expect(reopened.fields.positivePrompt.value).toBe("A synthetic edited night shift");
  expect(external).toEqual([]);
});
test("sample download is a real file and setup commands keep separate lines", async ({ page }) => {
  await page.goto(preview.url + "learn/");
  const promise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download the sample PNG", exact: true }).click();
  const download = await promise;
  expect(download.suggestedFilename()).toBe("night-shift.png");
  expect(await readFile(await download.path())).toEqual(await readFile(resolve(output, "assets/night-shift.png")));
  await page.goto(preview.url + "developers/");
  await expect(page.locator("#setup-command")).toHaveText("npm ci --prefix automation --ignore-scripts\nnpm run sdk:check");
});
test("nested missing routes recover with working assets and project-root navigation", async ({ page }) => {
  const response = await page.goto(preview.url + "missing/deep/page");
  expect(response.status()).toBe(404);
  await expect(page.locator("h1")).toContainText("off the map");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.getByRole("link", { name: "Back to the overview" }).click();
  await expect(page).toHaveURL(preview.url);
  await expect(page.locator("h1")).toContainText("Better backstory");
});
