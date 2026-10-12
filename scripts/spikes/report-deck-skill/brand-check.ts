/**
 * Palette, gradient, font, title and type-size checks for a v5 deck.
 */
import fs from "node:fs"
import JSZip from "jszip"

const PALETTE = new Set([
  "0F1D13",
  "FFFFFF",
  "EFE9DF",
  "B5D337",
  "49C7EB",
  "246646",
  "4E8F6A",
  "1A2620",
  "CFC8BA",
  "E4DED2",
  "6B6A5E",
  "3B4A3F",
])

export type BrandFailure = {
  slide: string
  rule: string
  detail: string
}

function slideName(part: string): string {
  return part.match(/slide(\d+)\.xml$/)?.[1] ?? part
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function textOf(xml: string): string {
  return decode([...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((match) => match[1] ?? "").join(""))
}

function themeFonts(xml: string): Set<string> {
  const fonts = new Set<string>()
  for (const match of xml.matchAll(/typeface="([^"]*)"/g)) {
    const name = match[1]
    if (name) fonts.add(name)
  }
  return fonts
}

function fontAllowed(name: string, theme: Set<string>): boolean {
  if (name.startsWith("+")) return true
  if (name === "Instrument Serif" || name.startsWith("Plus Jakarta Sans")) return true
  return theme.has(name)
}

function titleOf(xml: string): string {
  const shapes = xml.match(/<p:sp[\s>][\s\S]*?<\/p:sp>/g) ?? []
  for (const shape of shapes) {
    if (/<p:ph[^>]*type="(?:title|ctrTitle)"/.test(shape)) {
      const text = textOf(shape).trim()
      if (text) return text
    }
  }
  let best = ""
  let bestSize = -1
  for (const shape of shapes) {
    if (/<p:ph[^>]*type="sldNum"/.test(shape)) continue
    const text = textOf(shape).trim()
    if (!/[A-Za-z]/.test(text)) continue
    const sizes = [...shape.matchAll(/\ssz="(\d+)"/g)].map((match) => Number(match[1]))
    const size = sizes.length ? Math.max(...sizes) : 0
    if (size >= bestSize) {
      best = text
      bestSize = size
    }
  }
  return best
}

export async function checkBrand(pptxPath: string): Promise<BrandFailure[]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
  const theme = new Set<string>()
  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/theme\/theme\d+\.xml$/.test(name)) continue
    for (const font of themeFonts(await zip.files[name].async("string"))) theme.add(font)
  }
  const slides = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const failures: BrandFailure[] = []
  const seen = new Set<string>()
  const push = (failure: BrandFailure) => {
    const key = `${failure.slide}|${failure.rule}|${failure.detail}`
    if (seen.has(key)) return
    seen.add(key)
    failures.push(failure)
  }
  for (const part of slides) {
    const slide = slideName(part)
    const xml = await zip.files[part].async("string")
    if (/<a:gradFill[\s>]/.test(xml)) {
      push({ slide, rule: "gradFill", detail: "gradient fill" })
    }
    for (const match of xml.matchAll(/<a:srgbClr[^>]*\sval="([0-9A-Fa-f]{6})"/g)) {
      const colour = (match[1] ?? "").toUpperCase()
      if (!PALETTE.has(colour)) push({ slide, rule: "srgbClr", detail: colour })
    }
    for (const match of xml.matchAll(/typeface="([^"]+)"/g)) {
      const name = match[1] ?? ""
      if (!fontAllowed(name, theme)) push({ slide, rule: "font", detail: name })
    }
    for (const match of xml.matchAll(/\ssz="(\d+)"/g)) {
      const hundredths = Number(match[1])
      if (hundredths < 800) push({ slide, rule: "min-size", detail: `${hundredths / 100}pt` })
    }
    const title = titleOf(xml)
    if (!title.endsWith(".")) {
      push({ slide, rule: "title-stop", detail: title || "(no title text)" })
    }
  }
  return failures
}
