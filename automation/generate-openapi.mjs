import { writeFile } from "node:fs/promises";
import { openapi } from "./openapi.mjs";
await writeFile(new URL("../docs/openapi.json", import.meta.url), `${JSON.stringify(openapi(), null, 2)}\n`);
console.log("Wrote docs/openapi.json from the shared operation schemas.");
