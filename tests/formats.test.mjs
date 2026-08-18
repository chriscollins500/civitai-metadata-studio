import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

globalThis.CMStudio = {};
for (const module of [
  "../src/core/constants.js",
  "../src/core/util.js",
  "../src/core/binary.js",
  "../src/core/crc32.js",
  "../src/core/sha256.js",
  "../src/core/air.js",
  "../src/core/civitai-contract.js",
  "../src/core/a1111.js",
  "../src/core/exif.js",
  "../src/formats/png.js",
  "../src/formats/jpeg.js",
  "../src/formats/webp.js",
  "../src/core/comfy.js",
  "../src/core/canonical.js",
  "../src/core/identity-cache.js",
  "../src/core/civitai.js",
  "../src/core/zip.js"
]) {
  await import(module);
}

const Studio = globalThis.CMStudio;
const { concatBytes, putU16be, putU24le, putU32be, putU32le } = Studio.binary;
const ascii = (value) => Uint8Array.from(value, (character) => character.charCodeAt(0));

function file(parts, name, type) {
  return new File(parts, name, { type, lastModified: Date.UTC(2026, 0, 1) });
}

function pngFixture() {
  const ihdr = concatBytes(
    putU32be(1),
    putU32be(1),
    Uint8Array.of(8, 6, 0, 0, 0)
  );
  const pixels = new Uint8Array(deflateSync(Uint8Array.of(0, 255, 0, 0, 255)));
  return file([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    Studio.png.chunkBytes("IHDR", ihdr),
    Studio.png.textChunk("tEXt", "parameters", "old prompt\nNegative prompt:\nSteps: 4, Seed: 1, Size: 1x1"),
    Studio.png.textChunk("iTXt", "prompt", '{"1":{"class_type":"SaveImage","inputs":{}}}'),
    Studio.png.chunkBytes("IDAT", pixels),
    Studio.png.chunkBytes("IEND", new Uint8Array())
  ], "tiny.png", "image/png");
}

function conflictingSizePngFixture() {
  const width = 3;
  const height = 2;
  const ihdr = concatBytes(
    putU32be(width),
    putU32be(height),
    Uint8Array.of(8, 6, 0, 0, 0)
  );
  const pixels = new Uint8Array((1 + width * 4) * height);
  const manifest = JSON.stringify({ generation: { width: 1024, height: 768 } });
  return file([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    Studio.png.chunkBytes("IHDR", ihdr),
    Studio.png.textChunk("tEXt", "parameters", "old prompt\nNegative prompt:\nSteps: 4, Seed: 1, Size: 512x512"),
    Studio.png.textChunk("iTXt", "civitai", manifest),
    Studio.png.chunkBytes("IDAT", new Uint8Array(deflateSync(pixels))),
    Studio.png.chunkBytes("IEND", new Uint8Array())
  ], "conflicting-size.png", "image/png");
}

function eightKpngFixture() {
  const width = 8192;
  const height = 8192;
  const ihdr = concatBytes(
    putU32be(width),
    putU32be(height),
    Uint8Array.of(1, 0, 0, 0, 0)
  );
  const bytesPerRow = 1 + Math.ceil(width / 8);
  const pixels = new Uint8Array(deflateSync(new Uint8Array(bytesPerRow * height)));
  return file([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    Studio.png.chunkBytes("IHDR", ihdr),
    Studio.png.chunkBytes("IDAT", pixels),
    Studio.png.chunkBytes("IEND", new Uint8Array())
  ], "eight-k.png", "image/png");
}

function jpegFixture() {
  const app0 = Studio.jpeg.segmentBytes(0xE0, concatBytes(ascii("JFIF\0"), Uint8Array.of(1, 1, 0, 0, 1, 0, 1, 0, 0)));
  const sof = Studio.jpeg.segmentBytes(0xC0, Uint8Array.of(8, 0, 2, 0, 3, 1, 1, 0x11, 0));
  const scan = concatBytes(
    Studio.jpeg.segmentBytes(0xDA, Uint8Array.of(1, 1, 0, 0, 63, 0)),
    Uint8Array.of(1, 2, 3, 0xFF, 0, 4, 0xFF, 0xD9)
  );
  return file([Uint8Array.of(0xFF, 0xD8), app0, sof, scan], "tiny.jpg", "image/jpeg");
}

function webpFixture() {
  const width = 3;
  const height = 2;
  const bits = (width - 1) | ((height - 1) << 14);
  const vp8l = concatBytes(Uint8Array.of(0x2F), putU32le(bits), Uint8Array.of(0));
  const chunk = Studio.webp.chunkBytes("VP8L", vp8l);
  return file([
    ascii("RIFF"),
    putU32le(4 + chunk.length),
    ascii("WEBP"),
    chunk
  ], "tiny.webp", "image/webp");
}

function idatSlices(blob, inspection) {
  return Promise.all(
    inspection.chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) =>
      blob.slice(chunk.offset, chunk.offset + chunk.totalLength).arrayBuffer().then((buffer) => Buffer.from(buffer).toString("hex"))
    )
  );
}

test("PNG rewrite preserves IDAT and original ComfyUI prompt bytes", async () => {
  const original = pngFixture();
  const inspection = await Studio.png.inspect(original);
  const record = await Studio.canonical.createRecord(original, inspection);
  const beforeIdat = await idatSlices(original, inspection);
  const originalPrompt = inspection.carriers.find((carrier) => carrier.name.endsWith(":prompt")).value;
  Studio.canonical.setField(record, "positivePrompt", "new prompt");
  const output = Studio.canonical.rewrite(record);
  const outputFile = file([output], "edited.png", "image/png");
  const edited = await Studio.png.inspect(outputFile);
  assert.deepEqual(await idatSlices(outputFile, edited), beforeIdat);
  assert.equal(edited.carriers.find((carrier) => carrier.name.endsWith(":prompt")).value, originalPrompt);
  assert.equal(edited.a1111.fields.positivePrompt, "new prompt");
});

test("actual pixels initialize editable dimensions ahead of embedded metadata", async () => {
  const original = conflictingSizePngFixture();
  const inspection = await Studio.png.inspect(original);
  const record = await Studio.canonical.createRecord(original, inspection);

  assert.equal(record.fields.width.value, 3);
  assert.equal(record.fields.height.value, 2);
  assert.equal(record.fields.width.source, "image_header");
  assert.equal(record.fields.height.source, "image_header");

  Studio.canonical.setField(record, "width", 777);
  Studio.canonical.setField(record, "height", 555);
  assert.equal(record.fields.width.source, "manual");
  assert.equal(record.fields.height.source, "manual");

  const output = Studio.canonical.rewrite(record);
  const outputFile = file([output], "edited-size.png", "image/png");
  const edited = await Studio.png.inspect(outputFile);

  assert.equal(edited.width, 3);
  assert.equal(edited.height, 2);
  assert.equal(edited.a1111.fields.width, 777);
  assert.equal(edited.a1111.fields.height, 555);
  assert.equal(edited.manifests[0].generation.width, 777);
  assert.equal(edited.manifests[0].generation.height, 555);
});

test("PNG rewrite and reopen keep resource roles without creating duplicates", async () => {
  const original = pngFixture();
  const inspection = await Studio.png.inspect(original);
  const record = await Studio.canonical.createRecord(original, inspection);
  record.resources = [Studio.canonical.normalizeResource({
    name: "diffusion.gguf",
    role: "unet",
    type: "Checkpoint",
    identitySource: "comfy_active"
  }, "comfy_active")];

  const output = Studio.canonical.rewrite(record);
  const outputFile = file([output], "resource-roundtrip.png", "image/png");
  const edited = await Studio.png.inspect(outputFile);
  const reopened = await Studio.canonical.createRecord(outputFile, edited);

  assert.deepEqual(
    reopened.resources.map((resource) => ({
      name: resource.name,
      role: resource.role,
      identitySource: resource.identitySource
    })),
    [{ name: "diffusion.gguf", role: "unet", identitySource: "comfy_active" }]
  );
});

test("8K PNG inspection and rewrite preserve dimensions and compressed pixels", async () => {
  const original = eightKpngFixture();
  const inspection = await Studio.png.inspect(original);
  const record = await Studio.canonical.createRecord(original, inspection);
  const beforeIdat = await idatSlices(original, inspection);
  const output = Studio.canonical.rewrite(record);
  const outputFile = file([output], "eight-k-edited.png", "image/png");
  const edited = await Studio.png.inspect(outputFile);

  assert.equal(inspection.width, 8192);
  assert.equal(inspection.height, 8192);
  assert.equal(edited.width, 8192);
  assert.equal(edited.height, 8192);
  assert.deepEqual(await idatSlices(outputFile, edited), beforeIdat);
});

test("JPEG rewrite keeps scan bytes and adds readable EXIF", async () => {
  const original = jpegFixture();
  const inspection = await Studio.jpeg.inspect(original);
  const scanBefore = Buffer.from(await original.slice(inspection.scanOffset).arrayBuffer()).toString("hex");
  const record = await Studio.canonical.createRecord(original, inspection);
  Studio.canonical.setField(record, "positivePrompt", "jpeg prompt");
  const output = Studio.canonical.rewrite(record);
  const outputFile = file([output], "edited.jpg", "image/jpeg");
  const edited = await Studio.jpeg.inspect(outputFile);
  const scanAfter = Buffer.from(await outputFile.slice(edited.scanOffset).arrayBuffer()).toString("hex");
  assert.equal(scanAfter, scanBefore);
  assert.equal(edited.width, 3);
  assert.equal(edited.height, 2);
  assert.match(edited.exif.userComment, /jpeg prompt/);
});

test("WebP rewrite keeps VP8L payload and creates VP8X plus EXIF", async () => {
  const original = webpFixture();
  const inspection = await Studio.webp.inspect(original);
  const sourceChunk = inspection.chunks.find((chunk) => chunk.type === "VP8L");
  const sourceBytes = Buffer.from(await original.slice(sourceChunk.offset, sourceChunk.offset + sourceChunk.totalLength).arrayBuffer()).toString("hex");
  const record = await Studio.canonical.createRecord(original, inspection);
  Studio.canonical.setField(record, "positivePrompt", "webp prompt");
  record.resources = [Studio.canonical.normalizeResource({
    name: "diffusion model",
    filename: "diffusion.safetensors",
    role: "unet",
    type: "Checkpoint",
    rawAir: "urn:air:sdxl:checkpoint:civitai:100@200",
    modelId: 100,
    modelVersionId: 200,
    fileId: 300,
    verification: "verified",
    sourceUrl: "https://civitai.com/models/100?modelVersionId=200",
    hashes: { AutoV2: "ABCDEF1234" }
  }, "manual")];
  const output = Studio.canonical.rewrite(record);
  const outputFile = file([output], "edited.webp", "image/webp");
  const edited = await Studio.webp.inspect(outputFile);
  const editedChunk = edited.chunks.find((chunk) => chunk.type === "VP8L");
  const editedBytes = Buffer.from(await outputFile.slice(editedChunk.offset, editedChunk.offset + editedChunk.totalLength).arrayBuffer()).toString("hex");
  assert.equal(editedBytes, sourceBytes);
  assert.equal(edited.width, 3);
  assert.equal(edited.height, 2);
  assert.match(edited.exif.userComment, /webp prompt/);
  assert.equal(edited.chunks[0].type, "VP8X");
  const reopened = await Studio.canonical.createRecord(outputFile, edited);
  assert.deepEqual(
    reopened.resources.map((resource) => ({
      name: resource.name,
      filename: resource.filename,
      role: resource.role,
      modelId: resource.modelId,
      modelVersionId: resource.modelVersionId,
      fileId: resource.fileId,
      sourceUrl: resource.sourceUrl,
      autoV2: resource.hashes.AutoV2
    })),
    [{
      name: "diffusion model",
      filename: "diffusion.safetensors",
      role: "unet",
      modelId: 100,
      modelVersionId: 200,
      fileId: 300,
      sourceUrl: "https://civitai.com/models/100?modelVersionId=200",
      autoV2: "ABCDEF1234"
    }]
  );
});

test("ZIP writer creates a standards-shaped stored archive", async () => {
  const archive = await Studio.zip.build([
    { name: "one.txt", blob: new Blob(["one"]) },
    { name: "two.txt", blob: new Blob(["two"]) }
  ]);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034B50);
  assert.equal(new DataView(bytes.buffer).getUint32(bytes.length - 22, true), 0x06054B50);
});

test("structured save-node AIR objects normalize without losing IDs", () => {
  const resource = Studio.canonical.normalizeResource({
    role: "checkpoint",
    type: "checkpoint",
    name: "example.safetensors",
    rawAir: "urn:air:sdxl:checkpoint:civitai:100@200",
    air: {
      raw: "urn:air:sdxl:checkpoint:civitai:100@200",
      modelId: 100,
      modelVersionId: 200
    },
    hashes: { AutoV2: "aaaaaaaaaa" },
    resolutionSource: "local_identity_cache"
  }, "civitai_manifest");
  assert.equal(resource.canonicalAir, "urn:air:sdxl:checkpoint:civitai:100@200");
  assert.equal(resource.modelId, 100);
  assert.equal(resource.modelVersionId, 200);
  assert.equal(resource.identitySource, "local_identity_cache");
});
