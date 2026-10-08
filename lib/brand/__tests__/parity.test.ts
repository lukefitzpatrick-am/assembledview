import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { getChartTheme } from "../../chart-theme"
import { hexToHslTriplet } from "../index"
import tokens from "../tokens.json"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

type BlockName = ":root" | ".dark"

function extractBlock(css: string, selector: BlockName): Map<string, string> {
  const pattern = selector === ":root" ? /:root\s*\{/ : /\.dark\s*\{/
  const start = pattern.exec(css)
  if (!start) throw new Error(`No ${selector} block`)

  let depth = 1
  let index = start.index + start[0].length
  let body = ""
  while (index < css.length && depth > 0) {
    const char = css[index]
    if (char === "{") depth += 1
    else if (char === "}") depth -= 1
    if (depth > 0) body += char
    index += 1
  }

  const declarations = new Map<string, string>()
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "")
  for (const part of stripped.split(";")) {
    const colon = part.indexOf(":")
    if (colon === -1) continue
    const name = part.slice(0, colon).trim()
    const value = part.slice(colon + 1).trim()
    if (name.startsWith("--") && !declarations.has(name)) {
      declarations.set(name, value)
    }
  }
  return declarations
}

function withinOne(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1
}

function assertToken(label: string, actual: string | undefined, expectedHex: string): void {
  if (actual === undefined) {
    assert.fail(`${label}: missing declaration (expected ${expectedHex})`)
  }
  if (actual.startsWith("#")) {
    assert.equal(
      actual.toLowerCase(),
      expectedHex.toLowerCase(),
      `${label}: ${actual} !== ${expectedHex}`,
    )
    return
  }

  const hsl = /^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(actual)
  if (!hsl) {
    assert.fail(`${label}: unrecognised value "${actual}" (expected ${expectedHex})`)
  }
  const [hue, saturation, lightness] = hexToHslTriplet(expectedHex)
  const got = [Number(hsl[1]), Number(hsl[2]), Number(hsl[3])]
  const expected = [hue, saturation, lightness]
  const ok = got.every((channel, index) => withinOne(channel, expected[index]))
  assert.ok(
    ok,
    `${label}: ${got.map((channel) => String(channel)).join(" ")} vs ${expected
      .map((channel) => String(channel))
      .join(" ")} (${expectedHex})`,
  )
}

const globalsLight: Array<[string, string]> = [
  ["--foreground", tokens.colour.ink],
  ["--primary", tokens.colour.forest],
  ["--accent", tokens.colour.lime],
  ["--muted", tokens.colour.sand],
  ["--muted-foreground", tokens.colour.muted],
  ["--destructive", tokens.functional.coral],
  ["--border", tokens.colour.line],
  ["--input", tokens.colour.context],
  ["--surface-muted", tokens.colour.sand],
  ["--app-bg", tokens.colour.sand],
  ["--sidebar-bg", tokens.colour.ink],
  ["--pacing-ahead", tokens.colour.forest],
  ["--pacing-on-track", tokens.colour.forest],
  ["--pacing-behind", tokens.functional.amber],
  ["--pacing-critical", tokens.functional.coral],
  ["--channel-social", tokens.colour.sky],
  ["--dashboard-surface", tokens.colour.sand],
  ["--dashboard-border", tokens.colour.line],
  ["--dashboard-border-hover", tokens.colour.forestLight],
  ["--text-secondary", tokens.colour.body],
  ["--text-tertiary", tokens.colour.muted],
  ["--status-behind-fg", tokens.functional.amberText],
  ["--status-critical-fg", tokens.functional.coralText],
  ["--status-on-track-fg", tokens.colour.forest],
  ["--tone-outcome", tokens.colour.lime],
  ["--tone-insight", tokens.colour.sky],
  ["--tone-action", tokens.colour.forest],
  ["--tone-attention", tokens.functional.amber],
  ["--tone-critical", tokens.functional.coral],
  ["--tone-neutral-bg", tokens.colour.line],
  ["--tone-ink", tokens.colour.ink],
]

const globalsDark: Array<[string, string]> = [
  ["--background", tokens.colour.ink],
  ["--card", tokens.colour.panel],
  ["--primary", tokens.colour.lime],
  ["--secondary", tokens.colour.forestLight],
  ["--pacing-ahead", tokens.colour.forestLight],
  ["--pacing-on-track", tokens.colour.forestLight],
  ["--channel-search", tokens.colour.forestLight],
  ["--dashboard-card", tokens.colour.panel],
  ["--dashboard-border-hover", tokens.colour.forestLight],
  ["--status-behind-fg", tokens.functional.amberTextOnBlack],
  ["--status-critical-fg", tokens.functional.coralTextOnBlack],
  ["--status-ahead-fg", tokens.functional.forestTextOnBlack],
  ["--status-on-track-fg", tokens.functional.forestTextOnBlack],
  ["--tone-outcome", tokens.colour.lime],
  ["--tone-insight", tokens.colour.sky],
  ["--tone-action", tokens.colour.forestLight],
  ["--tone-attention", tokens.functional.amber],
  ["--tone-critical", tokens.functional.coral],
]

const chartsLight: Array<[string, string]> = [
  ["--av-chart-1", tokens.colour.forest],
  ["--av-chart-2", tokens.colour.sky],
  ["--av-chart-3", tokens.colour.lime],
  ["--av-chart-4", tokens.colour.forestLight],
  ["--av-chart-5", tokens.colour.muted],
  ["--av-chart-6", tokens.colour.context],
  ["--av-chart-7", tokens.colour.mutedOnBlack],
  ["--av-chart-8", tokens.colour.contextBlack],
  ["--av-status-ahead", tokens.colour.sky],
  ["--av-status-ontrack", tokens.colour.forest],
  ["--av-status-behind", tokens.functional.amber],
  ["--av-status-critical", tokens.functional.coral],
  ["--av-ink", tokens.colour.ink],
  ["--av-grid", tokens.colour.line],
]

const chartsDark: Array<[string, string]> = [
  ["--av-chart-1", tokens.colour.forestLight],
  ["--av-chart-2", tokens.colour.sky],
  ["--av-chart-3", tokens.colour.lime],
  ["--av-chart-4", tokens.functional.forestTextOnBlack],
  ["--av-chart-5", tokens.colour.mutedOnBlack],
  ["--av-chart-6", tokens.colour.contextBlack],
  ["--av-chart-7", tokens.colour.muted],
  ["--av-chart-8", tokens.colour.context],
  ["--av-status-ahead", tokens.colour.sky],
  ["--av-status-ontrack", tokens.colour.forestLight],
  ["--av-ink", tokens.colour.white],
  ["--av-surface", tokens.colour.panel],
]

const suites: Array<{ file: string; block: BlockName; pairs: Array<[string, string]> }> = [
  { file: "app/globals.css", block: ":root", pairs: globalsLight },
  { file: "app/globals.css", block: ".dark", pairs: globalsDark },
  { file: "styles/chart-tokens.css", block: ":root", pairs: chartsLight },
  { file: "styles/chart-tokens.css", block: ".dark", pairs: chartsDark },
]

for (const suite of suites) {
  const css = readFileSync(path.join(root, suite.file), "utf8")
  const declarations = extractBlock(css, suite.block)
  for (const [variable, expected] of suite.pairs) {
    test(`${suite.file} ${suite.block} ${variable}`, () => {
      assertToken(
        `${suite.file} ${suite.block} ${variable}`,
        declarations.get(variable),
        expected,
      )
    })
  }
}

test("light and dark chart series are eight distinct colours", () => {
  const chartCss = readFileSync(path.join(root, "styles/chart-tokens.css"), "utf8")
  const darkDeclarations = extractBlock(chartCss, ".dark")
  for (const mode of ["light", "dark"] as const) {
    const series = [...getChartTheme(mode).series]
    assert.equal(series.length, 8, `${mode} series length`)
    assert.equal(new Set(series).size, 8, `${mode} series must be eight distinct values`)
  }
  const darkSeries = getChartTheme("dark").series
  for (let index = 0; index < darkSeries.length; index++) {
    const variable = `--av-chart-${index + 1}`
    assert.equal(
      darkSeries[index]?.toLowerCase(),
      darkDeclarations.get(variable)?.toLowerCase(),
      `dark series ${index + 1} must match ${variable}`,
    )
  }
})
