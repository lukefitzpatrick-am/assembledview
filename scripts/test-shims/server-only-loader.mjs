import { pathToFileURL } from "node:url"
import { fileURLToPath } from "node:url"
import path from "node:path"

const empty = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "server-only-empty.mjs")
).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { shortCircuit: true, url: empty }
  }
  return nextResolve(specifier, context)
}
