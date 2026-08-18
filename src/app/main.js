(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};

  function missingFeatures() {
    const checks = [
      ["File streaming", typeof File !== "undefined" && typeof File.prototype.stream === "function"],
      ["Blob slicing", typeof Blob !== "undefined" && typeof Blob.prototype.slice === "function"],
      ["Web Crypto", typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"],
      ["structuredClone", typeof structuredClone === "function"],
      ["fetch", typeof fetch === "function"],
      ["decompression streams", typeof DecompressionStream === "function"],
      ["modal dialogs", typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function"]
    ];
    return checks.filter(([, supported]) => !supported).map(([name]) => name);
  }

  function start() {
    let theme = "";
    try {
      theme = localStorage.getItem("civitai-metadata-studio.theme") || "";
    } catch {
      // Storage can be unavailable in private or hardened browser contexts.
    }
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
    const missing = missingFeatures();
    const ui = new Studio.AppUI(Studio.state);
    Studio.ui = ui;
    if (missing.length) {
      Studio.state.announce(
        `This portable build intentionally targets current browsers. Update the browser to enable: ${missing.join(", ")}.`,
        "error"
      );
      document.getElementById("openButton").disabled = true;
      document.getElementById("fileInput").disabled = true;
    }
    addEventListener("error", (event) => {
      if (event.error?.message) Studio.state.announce(`Unexpected error: ${event.error.message}`, "error");
    });
    addEventListener("unhandledrejection", (event) => {
      const message = event.reason?.message || String(event.reason || "Unknown error");
      if (event.reason?.name !== "AbortError") Studio.state.announce(`Unexpected error: ${message}`, "error");
    });
  }

  start();
})();
