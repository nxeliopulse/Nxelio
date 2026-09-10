import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Build-time-only marker modules Next.js resolves itself. They have no runtime
// behaviour, but they ARE unresolvable under plain `node --test`, which would
// otherwise make every server module that guards itself with one untestable.
const STUBS = {
  "server-only": path.join(root, "scripts", "stubs", "server-only.mjs"),
};

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS[specifier];
  if (stub) {
    return nextResolve(pathToFileURL(stub).href, context);
  }
  if (specifier.startsWith("@/")) {
    const target = path.join(root, "src", specifier.slice(2));
    return nextResolve(`${pathToFileURL(target).href}.ts`, context);
  }
  return nextResolve(specifier, context);
}
