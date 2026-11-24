import { pages } from "./content.mjs";
export const publicAssets = Object.freeze([
  "styles.css", "site.js", "assets/favicon.svg", "assets/social-preview.png",
  "assets/observatory.svg", "assets/night-shift.png", "assets/openapi.json"
]);
export const publicFiles = Object.freeze([
  ...pages.map(page => page.path), ...publicAssets,
  "app/index.html", "release.json", "stable-release.json", "robots.txt", "sitemap.xml", ".nojekyll"
]);
export const budgets = Object.freeze({ javascript: 32 * 1024, css: 32 * 1024, page: 64 * 1024, total: 2 * 1024 * 1024 });
