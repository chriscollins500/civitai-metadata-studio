(() => {
  "use strict";
  const root = document.documentElement;
  root.classList.add("enhanced");
  document.querySelectorAll(".js-only").forEach(node => { node.hidden = false; });
  const announce = message => { document.getElementById("site-announcement").textContent = message; };
  const themeButton = document.querySelector("[data-theme-toggle]");
  const setTheme = theme => {
    root.dataset.theme = theme;
    themeButton.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  };
  let savedTheme;
  try { savedTheme = localStorage.getItem("cms.site.theme"); } catch { /* Optional preference; storage is never required. */ }
  setTheme(["light", "dark"].includes(savedTheme) ? savedTheme : "dark");
  themeButton.addEventListener("click", () => {
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    setTheme(theme);
    try { localStorage.setItem("cms.site.theme", theme); } catch { /* Session-only fallback. */ }
    announce(`${theme === "dark" ? "Dark" : "Light"} theme selected.`);
  });
  const dialog = document.getElementById("project-search");
  const query = document.getElementById("project-query");
  const searchItems = [...dialog.querySelectorAll("[data-search-item]")];
  const normalize = value => value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/gu, "");
  const updateSearch = () => {
    const terms = normalize(query.value.slice(0, 200)).split(/\s+/u).filter(Boolean);
    let count = 0;
    for (const item of searchItems) {
      item.hidden = !terms.every(term => normalize(item.textContent).includes(term));
      if (!item.hidden) count += 1;
    }
    document.getElementById("search-count").textContent = `${count} ${count === 1 ? "destination" : "destinations"}`;
    dialog.querySelector(".search-empty").hidden = count > 0;
  };
  document.querySelectorAll("[data-open-search]").forEach(button => button.addEventListener("click", () => { dialog.showModal(); query.focus(); }));
  dialog.querySelector("[data-close-search]").addEventListener("click", () => dialog.close());
  query.addEventListener("input", updateSearch);
  // Search inputs may consume Escape to clear themselves before native dialog
  // cancellation. Close deliberately so one key always dismisses the palette.
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); dialog.close(); }
  });
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (dialog.open) dialog.close(); else { dialog.showModal(); query.focus(); }
    }
  });
  const guideQuery = document.getElementById("guide-query");
  const guideCards = [...document.querySelectorAll("[data-guide]")];
  const filters = [...document.querySelectorAll("[data-guide-topic]")];
  let topic = "All guides";
  const filterGuides = () => {
    const terms = normalize(guideQuery?.value.slice(0, 200) || "").split(/\s+/u).filter(Boolean);
    let count = 0;
    for (const card of guideCards) {
      card.hidden = (topic !== "All guides" && card.dataset.topic !== topic) || !terms.every(term => normalize(card.textContent).includes(term));
      if (!card.hidden) count += 1;
    }
    document.getElementById("guide-count").textContent = `${count} of ${guideCards.length} guides`;
    document.getElementById("guide-empty").hidden = count > 0;
  };
  if (guideQuery) {
    guideQuery.addEventListener("input", filterGuides);
    filters.forEach(button => button.addEventListener("click", () => {
      topic = button.dataset.guideTopic;
      filters.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      filterGuides();
    }));
  }
  const caseButtons = [...document.querySelectorAll("[data-case]")];
  const casePanels = [...document.querySelectorAll("[data-case-panel]")];
  const chooseCase = (button, moveFocus = false) => {
    caseButtons.forEach(item => { item.setAttribute("aria-selected", String(item === button)); item.tabIndex = item === button ? 0 : -1; });
    casePanels.forEach(panel => { panel.hidden = panel.id !== button.getAttribute("aria-controls"); });
    if (moveFocus) button.focus();
  };
  if (caseButtons.length) {
    caseButtons.forEach((button, index) => {
      button.addEventListener("click", () => chooseCase(button));
      button.addEventListener("keydown", event => {
        const target = event.key === "ArrowRight" ? (index + 1) % caseButtons.length : event.key === "ArrowLeft" ? (index + caseButtons.length - 1) % caseButtons.length : event.key === "Home" ? 0 : event.key === "End" ? caseButtons.length - 1 : null;
        if (target !== null) { event.preventDefault(); chooseCase(caseButtons[target], true); }
      });
    });
    chooseCase(caseButtons[0]);
  }
  document.querySelectorAll("[data-copy-target]").forEach(button => button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    try { await navigator.clipboard.writeText(target.textContent); announce("Command copied. Review it before running."); button.textContent = "Copied"; }
    catch { const range = document.createRange(); range.selectNodeContents(target); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); announce("Clipboard unavailable. Command selected for manual copying."); }
  }));
})();
