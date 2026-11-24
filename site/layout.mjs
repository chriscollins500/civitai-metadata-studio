import { project, pages, links, guides, siteHref } from "./content.mjs";

export const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
export const anchor = (href, text, className = "") => `<a href="${escape(href)}"${className ? ` class="${escape(className)}"` : ""}>${escape(text)}</a>`;
export const button = (href, text, secondary = false) => anchor(href, text, `button${secondary ? " secondary" : ""}`);
export const eyebrow = text => `<p class="eyebrow">${escape(text)}</p>`;
export const heading = (id, kicker, title, description = "") => `<div class="section-heading">${eyebrow(kicker)}<h2 id="${id}">${title}</h2>${description ? `<p>${description}</p>` : ""}</div>`;
export const card = (title, text, href, label, accent = "") => `<article class="card ${accent}"><h3>${title}</h3><p>${text}</p>${href ? anchor(href, label || "Read the guide", "card-link") : ""}</article>`;
export const callout = (title, body, className = "") => `<aside class="callout ${className}"><strong>${title}</strong><p>${body}</p></aside>`;
export const icon = name => {
  const paths = { search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>' };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${paths[name] || paths.search}</svg>`;
};
export function renderLayout(page, body, { scriptIntegrity, styleIntegrity, release }) {
  const title = `${page.key === "home" ? project.name : `${page.label} · ${project.name}`} — ${page.title}`;
  const canonical = `${project.url}${page.route}`;
  const nav = pages.filter(item => item.key !== "notFound").map(item => `<a href="${siteHref(item.route)}"${item.key === page.key ? ' aria-current="page"' : ""}>${item.label}</a>`).join("");
  const directory = [
    ...pages.filter(item => item.key !== "notFound").map(item => ({ title: item.label, summary: item.description, url: siteHref(item.route) })),
    { title: "Open the editor", summary: "The real portable browser workspace", url: siteHref("app/") },
    ...guides,
    { title: "Ask a question", summary: "GitHub Q&A and community help", url: links.questions },
    { title: "Report a bug", summary: "Website, editor, automation, and metadata reports", url: links.issues },
    { title: "Report a vulnerability privately", summary: "Private security advisory, never a public issue", url: links.vulnerability },
    { title: "Public roadmap", summary: "Plans, explorations, and evidence on GitHub Project #1", url: links.roadmap },
    { title: "Contribute source", summary: "Pull requests, contribution rules, and shared engine", url: links.contribute }
  ];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; upgrade-insecure-requests">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="dark light">
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(page.description)}">
  ${page.key === "notFound" ? '<meta name="robots" content="noindex">' : ""}
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(page.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${project.url}assets/social-preview.png">
  <meta property="og:image:alt" content="Civitai Metadata Studio: your image, the whole story">
  <meta property="og:image:width" content="1280"><meta property="og:image:height" content="640">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/svg+xml" href="${siteHref("assets/favicon.svg")}">
  <link rel="stylesheet" href="${siteHref("styles.css")}" integrity="${styleIntegrity}">
  <script src="${siteHref("site.js")}" integrity="${scriptIntegrity}" defer></script>
</head>
<body data-page="${page.key}">
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header"><div class="wrap header-inner">
    <a class="brand" href="${siteHref("")}" aria-label="Civitai Metadata Studio home"><span class="brand-mark" aria-hidden="true">CM</span><span>Civitai<br><strong>Metadata Studio</strong></span></a>
    <nav class="main-nav" aria-label="Main navigation">${nav}</nav>
    <div class="header-actions"><button class="icon-button js-only" data-open-search hidden aria-label="Search the project">${icon("search")}</button><button class="icon-button js-only" data-theme-toggle hidden aria-label="Switch to light theme">${icon("theme")}</button>${anchor(siteHref("app/"), "Open editor", "button compact")}</div>
  </div></header>
  <main id="main" tabindex="-1">${body}</main>
  <footer class="site-footer"><div class="wrap footer-grid">
    <div class="footer-intro"><a class="brand" href="${siteHref("")}"><span class="brand-mark" aria-hidden="true">CM</span><span>Your image.<br><strong>The whole story.</strong></span></a><p>A little less metadata mystery.<br>A little more creative possibility.</p><span class="version-label">Stable release ${escape(release.version)} · one portable HTML</span></div>
    <nav aria-label="Product links"><h2>Make something</h2>${anchor(siteHref("app/"), "Open the editor")}${anchor(siteHref("downloads/"), "Download & verify")}${anchor(siteHref("learn/"), "Learn the basics")}${anchor(links.wiki, "The complete wiki")}</nav>
    <nav aria-label="Build and trust links"><h2>Look under the hood</h2>${anchor(siteHref("trust/"), "Privacy & proof")}${anchor(siteHref("developers/"), "API & MCP")}${anchor(links.source, "Source on GitHub")}${anchor(links.actions, "Build & security checks")}${anchor(links.changelog, "Changelog")}</nav>
    <nav aria-label="Community links"><h2>Join the project</h2>${anchor(links.questions, "Ask a question")}${anchor(links.issues, "Report a problem")}${anchor(links.roadmap, "Public roadmap")}${anchor(links.contribute, "Contribute")}${anchor(links.vulnerability, "Private security report")}</nav>
    <p class="footer-note">Independent, community-maintained software; not an official Civitai product. ${anchor(links.license, "MIT source license")}. This static website adds no analytics, remote fonts, or advertising. GitHub receives ordinary website requests. The editor processes selected images locally; ${anchor(siteHref("trust/#network"), "read the exact network boundary")}. Theme choice is the site's only optional stored preference.</p>
  </div></footer>
  <dialog class="search-dialog" id="project-search" aria-labelledby="search-heading">
    <div class="dialog-heading"><div>${eyebrow("Find your next step")}<h2 id="search-heading">Search the project</h2></div><button class="icon-button" data-close-search aria-label="Close search">${icon("close")}</button></div>
    <label for="project-query">A topic, question, field, or tool</label><input id="project-query" type="search" maxlength="200" autocomplete="off" placeholder="Try “hash”, “privacy”, or “MCP”…">
    <p id="search-count" class="search-count" role="status" aria-live="polite">${directory.length} destinations</p>
    <ul class="search-results">${directory.map(item => `<li data-search-item><a href="${escape(item.url)}"><strong>${escape(item.title)}</strong><span>${escape(item.summary)}</span></a></li>`).join("")}</ul>
    <p class="search-empty" hidden>No match yet. Try a shorter phrase, or ${anchor(links.guideMap, "browse the complete handbook")}.</p><p class="muted">Ctrl / ⌘ K to open · Escape to close. Search stays in this page.</p>
  </dialog>
  <p class="sr-only" id="site-announcement" role="status" aria-live="polite"></p>
</body>
</html>\n`;
}
