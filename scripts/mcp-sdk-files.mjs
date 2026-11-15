import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { join, relative, isAbsolute, sep } from "node:path";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const integrity = bytes => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
export function within(root, target) {
  const path = relative(root, target);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
export async function fileTree(root) {
  const resolvedRoot = await realpath(root);
  if ((await lstat(root)).isSymbolicLink()) throw new Error("SDK tree must not be linked.");
  const files = {};
  async function walk(directory, prefix = "") {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = join(directory, entry.name), key = prefix + entry.name;
      if (entry.isSymbolicLink() || !within(resolvedRoot, await realpath(path))) throw new Error(`Linked or out-of-root SDK entry: ${key}`);
      if (entry.isDirectory()) await walk(path, key + "/");
      else if (entry.isFile()) files[key] = sha256(await readFile(path));
      else throw new Error(`Non-file SDK entry: ${key}`);
    }
  }
  await walk(root); return files;
}
