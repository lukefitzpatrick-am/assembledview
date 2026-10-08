/**
 * List slide layouts and masters in a .pptx: name, index, placeholders, theme.
 * Run: npx tsx scripts/reports/describe-pptx-layouts.ts [pptx] [out.md]
 */
import fs from "node:fs"
import path from "node:path"

import { XMLParser } from "fast-xml-parser"
import JSZip from "jszip"

const DEFAULT_PPTX = path.join(
  "lib",
  "reports",
  "assets",
  "v5",
  "am-template-deck-16x9.pptx",
)
const TOKENS_PATH = path.join("lib", "brand", "tokens.json")

type BrandTokens = {
  colour: Record<string, string>
  font: { sans: string; serif: string }
}

type Placeholder = {
  type: string
  idx: string
  name: string
  x: string
  y: string
  cx: string
  cy: string
}

type Part = {
  kind: "master" | "layout"
  index: number
  part: string
  name: string
  layoutType: string
  placeholders: Placeholder[]
}

type ThemeReport = {
  part: string
  name: string
  usedBy: string[]
  fonts: { slot: string; typeface: string }[]
  colours: { slot: string; value: string }[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
})

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function attr(node: unknown, key: string): string {
  if (!node || typeof node !== "object") return ""
  const value = (node as Record<string, unknown>)[`@_${key}`]
  return value == null ? "" : String(value)
}

function partIndex(fileName: string, prefix: string): number {
  const base = path.posix.basename(fileName, ".xml")
  const raw = base.slice(prefix.length)
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function placeholderOf(node: Record<string, unknown>): {
  nv: Record<string, unknown>
  ph: Record<string, unknown>
} | null {
  const nv =
    (node.nvSpPr as Record<string, unknown> | undefined) ??
    (node.nvPicPr as Record<string, unknown> | undefined) ??
    (node.nvCxnSpPr as Record<string, unknown> | undefined) ??
    (node.nvGraphicFramePr as Record<string, unknown> | undefined)
  if (!nv) return null
  const nvPr = nv.nvPr as Record<string, unknown> | undefined
  const ph = asArray<Record<string, unknown>>(nvPr?.ph as Record<string, unknown> | undefined)[0]
  if (!ph) return null
  return { nv, ph }
}

function readXfrm(node: Record<string, unknown>): {
  x: string
  y: string
  cx: string
  cy: string
} {
  const spPr = node.spPr as Record<string, unknown> | undefined
  const xfrm = (spPr?.xfrm ?? node.xfrm) as Record<string, unknown> | undefined
  const off = xfrm?.off as Record<string, unknown> | undefined
  const ext = xfrm?.ext as Record<string, unknown> | undefined
  return {
    x: attr(off, "x") || "inherited",
    y: attr(off, "y") || "inherited",
    cx: attr(ext, "cx") || "inherited",
    cy: attr(ext, "cy") || "inherited",
  }
}

function collectPlaceholders(node: unknown, out: Placeholder[]): void {
  if (!node || typeof node !== "object") return
  if (Array.isArray(node)) {
    for (const item of node) collectPlaceholders(item, out)
    return
  }
  const record = node as Record<string, unknown>
  const hit = placeholderOf(record)
  if (hit) {
    const cNvPr = hit.nv.cNvPr as Record<string, unknown> | undefined
    const box = readXfrm(record)
    const type = attr(hit.ph, "type") || "body"
    const idx = attr(hit.ph, "idx") || "0"
    out.push({
      type,
      idx,
      name: attr(cNvPr, "name") || "",
      ...box,
    })
    return
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "Fallback" || key.startsWith("@_")) continue
    collectPlaceholders(value, out)
  }
}

function readPart(kind: "master" | "layout", fileName: string, xml: string): Part {
  const doc = parser.parse(xml) as Record<string, unknown>
  const root = (doc.sldLayout ?? doc.sldMaster ?? doc) as Record<string, unknown>
  const cSld = root.cSld as Record<string, unknown> | undefined
  const placeholders: Placeholder[] = []
  collectPlaceholders(cSld?.spTree, placeholders)
  return {
    kind,
    index: partIndex(fileName, kind === "layout" ? "slideLayout" : "slideMaster"),
    part: fileName,
    name: attr(cSld, "name") || "(unnamed)",
    layoutType: attr(root, "type") || "",
    placeholders,
  }
}

function colourValue(node: unknown): string {
  if (!node || typeof node !== "object") return ""
  const record = node as Record<string, unknown>
  const srgb = record.srgbClr as Record<string, unknown> | undefined
  if (srgb) return `#${attr(srgb, "val").toUpperCase()}`
  const sys = record.sysClr as Record<string, unknown> | undefined
  if (sys) {
    const last = attr(sys, "lastClr")
    const name = attr(sys, "val")
    return last ? `#${last.toUpperCase()} (${name})` : name
  }
  const scheme = record.schemeClr as Record<string, unknown> | undefined
  if (scheme) return `scheme:${attr(scheme, "val")}`
  return ""
}

function readTheme(fileName: string, xml: string): ThemeReport {
  const doc = parser.parse(xml) as Record<string, unknown>
  const theme = doc.theme as Record<string, unknown> | undefined
  const elements = theme?.themeElements as Record<string, unknown> | undefined
  const fontScheme = elements?.fontScheme as Record<string, unknown> | undefined
  const clrScheme = elements?.clrScheme as Record<string, unknown> | undefined
  const fonts: ThemeReport["fonts"] = []
  for (const slot of ["majorFont", "minorFont"] as const) {
    const block = fontScheme?.[slot] as Record<string, unknown> | undefined
    if (!block) continue
    for (const face of ["latin", "ea", "cs"] as const) {
      const typeface = attr(block[face], "typeface")
      if (typeface) fonts.push({ slot: `${slot} ${face}`, typeface })
    }
  }
  const colours: ThemeReport["colours"] = []
  if (clrScheme) {
    for (const [slot, value] of Object.entries(clrScheme)) {
      if (slot.startsWith("@_")) continue
      const shown = colourValue(value)
      if (shown) colours.push({ slot, value: shown })
    }
  }
  return {
    part: fileName,
    name: attr(theme, "name") || "(unnamed)",
    usedBy: [],
    fonts,
    colours,
  }
}

function resolveRelTarget(relFile: string, target: string): string {
  const from = path.posix.dirname(path.posix.dirname(relFile))
  let resolved = path.posix.normalize(path.posix.join(from, target))
  if (resolved.startsWith("/")) resolved = resolved.slice(1)
  return resolved
}

function hexOf(value: string): string {
  const match = value.toUpperCase().match(/#([0-9A-F]{6})/)
  return match?.[1] ?? ""
}

function comparison(themes: ThemeReport[], tokens: BrandTokens, serifHits: number): string[] {
  const lines: string[] = []
  const sans = tokens.font.sans
  const serif = tokens.font.serif
  const deckThemes = themes.filter((theme) =>
    theme.usedBy.some((user) => user.includes("slideMaster") || user.includes("presentation")),
  )
  const judged = deckThemes.length > 0 ? deckThemes : themes
  lines.push(`Expected fonts from tokens.json: ${sans} (sans) and ${serif} (serif).`)
  lines.push("The check uses themes referenced by the slide master or the presentation.")
  for (const theme of judged) {
    const typefaces = new Set(theme.fonts.map((font) => font.typeface))
    const used = theme.usedBy.length > 0 ? ` Used by ${theme.usedBy.join(", ")}.` : ""
    lines.push(`${theme.part} (${theme.name}).${used}`)
    if (typefaces.has(sans) && typefaces.has(serif)) {
      lines.push("Both typefaces match the token names.")
    } else {
      const missing = [sans, serif].filter((name) => !typefaces.has(name))
      if (missing.length > 0) {
        const serifNote =
          missing.includes(serif) && serifHits === 0
            ? " That name does not appear in any XML part."
            : missing.includes(serif)
              ? ` The name appears in ${serifHits} XML parts, outside the theme font scheme.`
              : ""
        lines.push(`Difference: missing ${missing.join(", ")}.${serifNote}`)
      }
    }
    const extraFaces = [...typefaces].filter((name) => name !== sans && name !== serif)
    if (extraFaces.length > 0) {
      lines.push(`Difference: also names ${extraFaces.join(", ")}.`)
    }
    for (const font of theme.fonts) {
      lines.push(`${font.slot}: ${font.typeface}.`)
    }
  }
  const unused = themes.filter((theme) => !judged.includes(theme))
  for (const theme of unused) {
    const faces = theme.fonts.map((font) => font.typeface).join(", ")
    lines.push(
      `${theme.part} (${theme.name}) is in the package and is not referenced by the slide master. Its fonts are ${faces}.`,
    )
  }

  const wanted = ["sand", "ink", "forest", "lime", "sky"] as const
  const schemeHex = new Set(
    judged.flatMap((theme) => theme.colours.map((colour) => hexOf(colour.value))).filter(Boolean),
  )
  lines.push("")
  lines.push("Expected colours from tokens.json: sand, ink, forest, lime, sky.")
  for (const name of wanted) {
    const token = tokens.colour[name]?.toUpperCase() ?? ""
    const hex = token.replace("#", "")
    if (!token) {
      lines.push(`Difference: tokens.json has no colour.${name}.`)
      continue
    }
    if (schemeHex.has(hex)) {
      lines.push(`${name} ${token} is in the theme.`)
    } else {
      lines.push(`Difference: ${name} ${token} is not in the theme colour scheme.`)
    }
  }
  const wantedHex = new Set(
    wanted.map((name) => (tokens.colour[name] ?? "").replace("#", "").toUpperCase()).filter(Boolean),
  )
  const tokenByHex = new Map<string, string[]>()
  for (const [name, value] of Object.entries(tokens.colour)) {
    const hex = value.replace("#", "").toUpperCase()
    const names = tokenByHex.get(hex) ?? []
    names.push(name)
    tokenByHex.set(hex, names)
  }
  const extras = judged.flatMap((theme) =>
    theme.colours
      .filter((colour) => {
        const hex = hexOf(colour.value)
        return hex && !wantedHex.has(hex)
      })
      .map((colour) => {
        const hex = hexOf(colour.value)
        const tokenNames = tokenByHex.get(hex)
        const via = tokenNames ? ` (tokens.json ${tokenNames.join(", ")})` : " (not in tokens.json colour)"
        return `${theme.part} ${colour.slot} ${colour.value}${via}`
      }),
  )
  if (extras.length > 0) {
    lines.push(`Other scheme colours, outside sand, ink, forest, lime and sky: ${extras.join("; ")}.`)
  }
  return lines
}

function table(placeholders: Placeholder[]): string[] {
  if (placeholders.length === 0) return ["No placeholders."]
  const lines = [
    "| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ]
  for (const item of placeholders) {
    const name = item.name.replace(/\|/g, "\\|")
    lines.push(
      `| ${item.type} | ${item.idx} | ${name} | ${item.x} | ${item.y} | ${item.cx} | ${item.cy} |`,
    )
  }
  return lines
}

function render(parts: Part[], themes: ThemeReport[], tokens: BrandTokens, serifHits: number): string {
  const lines: string[] = [
    "# v5 deck layouts",
    "",
    "Slide layouts and masters in `lib/reports/assets/v5/am-template-deck-16x9.pptx`.",
    "Positions and sizes are the shape's own off and ext values, in English Metric Units.",
    "A value of inherited means the layout does not set that edge and the master supplies it.",
    "",
    "## Theme",
    "",
  ]
  for (const theme of themes) {
    lines.push(`### ${theme.part}`)
    lines.push("")
    const used = theme.usedBy.length > 0 ? ` Used by ${theme.usedBy.join(", ")}.` : " Not referenced by a slide master."
    lines.push(`Name: ${theme.name}.${used}`)
    lines.push("")
    lines.push("| Slot | Typeface |")
    lines.push("| --- | --- |")
    for (const font of theme.fonts) {
      lines.push(`| ${font.slot} | ${font.typeface} |`)
    }
    lines.push("")
    lines.push("| Slot | Colour |")
    lines.push("| --- | --- |")
    for (const colour of theme.colours) {
      lines.push(`| ${colour.slot} | ${colour.value} |`)
    }
    lines.push("")
  }
  lines.push("## Comparison with lib/brand/tokens.json")
  lines.push("")
  for (const line of comparison(themes, tokens, serifHits)) {
    lines.push(line)
    lines.push("")
  }
  for (const part of parts) {
    const heading = part.kind === "master" ? "Slide master" : "Slide layout"
    lines.push(`## ${heading} ${part.index}`)
    lines.push("")
    lines.push(`Part: \`${part.part}\`.`)
    lines.push(`Name: ${part.name}.`)
    if (part.layoutType) lines.push(`Layout type: ${part.layoutType}.`)
    lines.push("")
    lines.push(...table(part.placeholders))
    lines.push("")
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`
}

async function main(): Promise<void> {
  const pptxPath = path.resolve(process.cwd(), process.argv[2] || DEFAULT_PPTX)
  const outPath = path.resolve(
    process.cwd(),
    process.argv[3] || path.join(path.dirname(pptxPath), "LAYOUTS.md"),
  )
  const tokens = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), TOKENS_PATH), "utf8")) as BrandTokens
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
  const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir)

  const masters = names
    .filter((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name))
    .sort((a, b) => partIndex(a, "slideMaster") - partIndex(b, "slideMaster"))
  const layouts = names
    .filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name))
    .sort((a, b) => partIndex(a, "slideLayout") - partIndex(b, "slideLayout"))
  const themes = names
    .filter((name) => /^ppt\/theme\/theme\d+\.xml$/.test(name))
    .sort()

  const parts: Part[] = []
  for (const fileName of masters) {
    parts.push(readPart("master", fileName, await zip.file(fileName)!.async("string")))
  }
  for (const fileName of layouts) {
    const xml = await zip.file(fileName)!.async("string")
    const part = readPart("layout", fileName, xml)
    const rawCount = xml.match(/<p:ph[\s/>]/g)?.length ?? 0
    if (rawCount !== part.placeholders.length) {
      console.warn(
        `${fileName}: XML has ${rawCount} p:ph tags, listed ${part.placeholders.length}.`,
      )
    }
    parts.push(part)
  }
  const themeReports: ThemeReport[] = []
  for (const fileName of themes) {
    themeReports.push(readTheme(fileName, await zip.file(fileName)!.async("string")))
  }
  let serifHits = 0
  const relFiles = names.filter((name) => name.endsWith(".rels"))
  for (const fileName of names) {
    if (!fileName.endsWith(".xml") && !fileName.endsWith(".rels")) continue
    const xml = await zip.file(fileName)!.async("string")
    if (xml.includes(tokens.font.serif)) serifHits += 1
    if (!relFiles.includes(fileName)) continue
    const owner = fileName.replace(/_rels\/([^/]+)\.rels$/, "$1")
    for (const match of xml.matchAll(/Target="([^"]+)"/g)) {
      const target = resolveRelTarget(fileName, match[1] ?? "")
      const theme = themeReports.find((item) => item.part === target)
      if (theme && !theme.usedBy.includes(owner)) theme.usedBy.push(owner)
    }
  }

  const markdown = render(parts, themeReports, tokens, serifHits)
  fs.writeFileSync(outPath, markdown, "utf8")
  const placeholderCount = parts.reduce((sum, part) => sum + part.placeholders.length, 0)
  console.log(
    `Wrote ${outPath} (${masters.length} masters, ${layouts.length} layouts, ${placeholderCount} placeholders, ${themes.length} themes).`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
