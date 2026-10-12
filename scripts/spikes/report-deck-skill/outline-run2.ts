/**
 * Dump slide number, layout name, and every text frame from a pptx.
 * Usage: node --import tsx scripts/spikes/report-deck-skill/outline-run2.ts
 */
import fs from "node:fs"
import path from "node:path"
import JSZip from "jszip"

const pptxPath = path.join(import.meta.dirname, "out", "hema007-run2.pptx")
const outPath = path.join(import.meta.dirname, "out", "hema007-run2-outline.md")

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function textFrames(xml: string): string[] {
  const frames: string[] = []
  for (const body of xml.matchAll(/<p:txBody>([\s\S]*?)<\/p:txBody>/g)) {
    const paragraphs: string[] = []
    for (const para of body[1].matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)) {
      const runs = [...para[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) =>
        decodeXml(m[1]),
      )
      paragraphs.push(runs.join(""))
    }
    const text = paragraphs.join("\n").replace(/\n+$/g, "")
    if (text.trim().length > 0) frames.push(text)
  }
  return frames
}

function fence(text: string): string {
  const longest = text.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0
  const fence = "`".repeat(Math.max(3, longest + 1))
  return `${fence}\n${text}\n${fence}`
}

async function main(): Promise<void> {
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
  const layoutNameByFile = new Map<string, string>()
  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)) continue
    const xml = await zip.file(name)!.async("string")
    const layoutName = xml.match(/<p:cSld[^>]*\sname="([^"]*)"/)?.[1]
    if (layoutName) layoutNameByFile.set(path.posix.basename(name), decodeXml(layoutName))
  }

  const pres = await zip.file("ppt/presentation.xml")!.async("string")
  const rels = await zip.file("ppt/_rels/presentation.xml.rels")!.async("string")
  const targetById = new Map<string, string>()
  for (const match of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    targetById.set(match[1], match[2])
  }

  const lines = [
    "# hema007 run 2 outline",
    "",
    "Source: `scripts/spikes/report-deck-skill/out/hema007-run2.pptx`.",
    "Reference design for option D. Text frames are each `p:txBody` in document order. Empty frames are omitted.",
    "",
  ]

  let slideNumber = 0
  for (const match of pres.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)) {
    slideNumber += 1
    const target = targetById.get(match[1]) ?? ""
    const slidePath = path.posix.normalize(path.posix.join("ppt", target))
    const relPath = path.posix.join(
      path.posix.dirname(slidePath),
      "_rels",
      `${path.posix.basename(slidePath)}.rels`,
    )
    const slideRels = (await zip.file(relPath)?.async("string")) ?? ""
    const layoutFile = slideRels.match(/slideLayouts\/(slideLayout\d+\.xml)/)?.[1]
    const layoutName = (layoutFile && layoutNameByFile.get(layoutFile)) || "(layout name not found)"
    const slideXml = await zip.file(slidePath)!.async("string")
    const frames = textFrames(slideXml)

    lines.push(`## Slide ${slideNumber}`)
    lines.push("")
    lines.push(`Layout: ${layoutName}`)
    lines.push("")
    if (frames.length === 0) {
      lines.push("No text frames.")
      lines.push("")
      continue
    }
    frames.forEach((frame, index) => {
      lines.push(`### Frame ${index + 1}`)
      lines.push("")
      lines.push(fence(frame))
      lines.push("")
    })
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8")
  console.log(`slides=${slideNumber}`)
  console.log(outPath)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
