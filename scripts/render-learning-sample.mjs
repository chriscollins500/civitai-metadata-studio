import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import Studio from "../src/engine.mjs";

// Maintainer-only rendering from our original vector. Not a build dependency.
// The sample's deliberately wrong dimensions are synthetic test metadata.
const scratch = new URL("../.tmp/site-sample/", import.meta.url);
await mkdir(scratch, { recursive: true });
const raster = fileURLToPath(new URL("illustration.png", scratch));
const rendered = spawnSync("magick", [fileURLToPath(new URL("../site/assets/observatory.svg", import.meta.url)), "-strip", "-depth", "8", `PNG24:${raster}`], { encoding: "utf8", windowsHide: true });
if (rendered.status !== 0) throw new Error(rendered.stderr || "Use the existing shared ImageMagick installation.");
const pixels = await readFile(raster);
const iend = Buffer.from(Studio.png.chunkBytes("IEND", new Uint8Array()));
assert.ok(pixels.subarray(-12).equals(iend));
const recipe = "Synthetic learning recipe: a tiny observatory, a very big sky\nNegative prompt: blurred\nSteps: 8, Seed: 280561459454064, Size: 1024x1024";
const sample = Buffer.concat([pixels.subarray(0, -12), Buffer.from(Studio.png.textChunk("tEXt", "parameters", recipe)), pixels.subarray(-12)]);
const file = new File([sample], "night-shift.png", { type: "image/png" });
const record = await Studio.canonical.createRecord(file, await Studio.canonical.inspectFile(file));
assert.equal(record.fields.width.value, 768); assert.equal(record.fields.height.value, 512);
assert.match(record.fields.positivePrompt.value, /Synthetic learning recipe/);
await writeFile(new URL("../site/assets/night-shift.png", import.meta.url), sample);
console.log(`Rendered original learning sample: 768 × 512, ${sample.length} bytes; synthetic metadata says 1024 × 1024.`);
