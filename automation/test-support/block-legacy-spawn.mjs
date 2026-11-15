// Test-only tripwire: the managed client must not fall back to legacy spawning.
import { registerHooks } from "node:module";
const forbidden = new Set(["cross-spawn", "path-key", "shebang-regex", "shebang-command", "which", "isexe"]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
    if (forbidden.has(name)) throw Object.assign(new Error(`Legacy spawn dependency was loaded: ${name}`), { code: "ERR_STUDIO_LEGACY_SPAWN" });
    const result = nextResolve(specifier, context);
    if ([...forbidden].some(entry => result.url.replaceAll("\\", "/").includes(`/node_modules/${entry}/`))) {
      throw Object.assign(new Error("A legacy spawn dependency file was loaded."), { code: "ERR_STUDIO_LEGACY_SPAWN" });
    }
    return result;
  }
});
