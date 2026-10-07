/**
 * Chart paint comes from lib/chart-theme.ts. Colour literals in chart components fail this scan.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const COLOUR = /#[0-9A-Fa-f]{3,8}\b|\brgb\(|\bhsl\(/

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(name)) out.push(path)
  }
}

function files(): string[] {
  const out: string[] = []
  walk("components/charts", out)
  walk("components/dashboard", out)
  return out.filter((path) => path.includes(`${join("dashboard", "")}`) ? (
    path.includes("chart") || path.includes("Chart")
  ) : true)
}

describe("no bespoke chart colour literals", () => {
  it("components/charts and dashboard chart files have no hex, rgb(, or hsl(", () => {
    const hits: string[] = []
    for (const path of files()) {
      const text = readFileSync(path, "utf8")
      if (COLOUR.test(text)) hits.push(path)
    }
    assert.deepEqual(hits, [])
  })
})
