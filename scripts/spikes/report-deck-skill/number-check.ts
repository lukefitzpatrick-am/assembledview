import fs from "node:fs"
import JSZip from "jszip"

const TOKEN = /\$?\d[\d,]*(?:\.\d+)?%?/g

export type StrayFigure = {
  slide: string
  raw: string
  normalised: string
}

function canon(raw: string): string {
  const stripped = raw.replace(/[$,%\s]/g, "")
  const [whole, frac] = stripped.split(".")
  const integer = whole.replace(/^0+(?=\d)/, "")
  return frac === undefined ? integer : `${integer}.${frac}`
}

function tokensIn(text: string): string[] {
  return text.match(TOKEN) ?? []
}

function slideText(xml: string): string {
  const parts: string[] = []
  const pattern = /<a:t[^>]*>([^<]*)<\/a:t>/g
  let match = pattern.exec(xml)
  while (match) {
    parts.push(match[1] ?? "")
    match = pattern.exec(xml)
  }
  return parts.join(" ")
}

export async function checkDeckNumbers(
  pptxPath: string,
  jsonPath: string,
): Promise<{ stray: StrayFigure[]; slideCount: number }> {
  const jsonText = fs.readFileSync(jsonPath, "utf8")
  const allowed = new Set(tokensIn(jsonText).map(canon))
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
  const names = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const stray: StrayFigure[] = []
  for (const name of names) {
    const xml = await zip.files[name].async("string")
    for (const raw of tokensIn(slideText(xml))) {
      const normalised = canon(raw)
      if (!allowed.has(normalised)) stray.push({ slide: name, raw, normalised })
    }
  }
  return { stray, slideCount: names.length }
}
