import { deflateSync } from "node:zlib";
import Studio from "../src/engine.mjs";
const ascii = (value) => Uint8Array.from(value, (character) => character.charCodeAt(0));
const { concatBytes, putU32be, putU32le, putU24le, putU16be } = Studio.binary;
export function imageFixture(format = "png", { prompt = "A quiet observatory above the clouds", width = 3, height = 2, resources = [], name = `sample.${format === "jpeg" ? "jpg" : format}` } = {}) {
  const parameters = `${prompt}\nNegative prompt: blurred\nSteps: 8, Seed: 280561459454064, Size: 512x512`;
  if (format === "png") return new File([
    Uint8Array.of(137,80,78,71,13,10,26,10),
    Studio.png.chunkBytes("IHDR", concatBytes(putU32be(width), putU32be(height), Uint8Array.of(8, 6, 0, 0, 0))),
    Studio.png.textChunk("tEXt", "parameters", parameters),
    Studio.png.textChunk("iTXt", "civitai", JSON.stringify({ resources })),
    Studio.png.chunkBytes("IDAT", deflateSync(new Uint8Array((1 + width * 4) * height))),
    Studio.png.chunkBytes("IEND", new Uint8Array())
  ], name, { type: "image/png" });
  if (format === "jpeg") return new File([
    Uint8Array.of(0xFF, 0xD8),
    Studio.jpeg.segmentBytes(0xE0, concatBytes(ascii("JFIF\0"), Uint8Array.of(1,1,0,0,1,0,1,0,0))),
    Studio.jpeg.segmentBytes(0xC0, concatBytes(Uint8Array.of(8), putU16be(height), putU16be(width), Uint8Array.of(1,1,0x11,0))),
    Studio.jpeg.segmentBytes(0xDA, Uint8Array.of(1,1,0,0,63,0)), Uint8Array.of(42,43,44,0xFF,0xD9)
  ], name, { type: "image/jpeg" });
  const bits = (width - 1) | ((height - 1) << 14);
  const vp8l = concatBytes(Uint8Array.of(0x2F), putU32le(bits), Uint8Array.of(0,0,0,0));
  const body = Studio.webp.chunkBytes("VP8L", vp8l);
  return new File([ascii("RIFF"), putU32le(4 + body.length), ascii("WEBP"), body], name, { type: "image/webp" });
}
export async function recordFixture(options) {
  const file = imageFixture("png", options);
  return Studio.canonical.createRecord(file, await Studio.canonical.inspectFile(file));
}
export { Studio };
