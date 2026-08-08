import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = path.join(root, "src", specifier.slice(2));
    return nextResolve(`${pathToFileURL(target).href}.ts`, context);
  }
  return nextResolve(specifier, context);
}
