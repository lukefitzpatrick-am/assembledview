/**
 * Build a Demand Flow planner deck from the Assembled Media brand template.
 * Root is assembled-root.pptx (cover only); slides are imported from
 * assembled-template.pptx. Never starts from a blank presentation.
 */
import fs from "fs"
import os from "os"
import path from "path"
import { Automizer, ModifyTextHelper } from "pptx-automizer"
import { summariseInsight } from "@/lib/planning/insightText"

export { summariseInsight } from "@/lib/planning/insightText"

const ROOT_NAME = "assembled-root.pptx"
const TEMPLATE_NAME = "assembled-template.pptx"

/** Right-hand content area on narrative slides 27–29 (Content Placeholder 2). */
const CONTENT = {
  x: 6.18,
  y: 0.43,
  w: 6.57,
  h: 6.49,
}

export type PlannerDeckBrief = {
  clientName?: string
  campaignName?: string
  category?: string
  market?: string
  objectiveKind?: string
  createCapture?: number
  budget?: number
  startDate?: string | null
  endDate?: string | null
}

export type PlannerDeckAudience = {
  name: string
  definition: string
  stats: string
  insight?: string | null
  topMix: string
  topDfii: string
  charts: {
    reachIndexPng?: string | null
    reachIndexPngWidth?: number | null
    reachIndexPngHeight?: number | null
    quadrantPng?: string | null
    quadrantPngWidth?: number | null
    quadrantPngHeight?: number | null
    dfiiPng?: string | null
    dfiiPngWidth?: number | null
    dfiiPngHeight?: number | null
  }
}

export type PlannerDeckInput = {
  brief: PlannerDeckBrief
  diagnosis: {
    penetrationPct?: number | null
    targetPct?: number | null
    salience?: string | null
    createCapture: number
  }
  constraintsSummary: {
    includedCount: number
    excludedNames: string[]
  }
  waveLabel: string
  reachBasis: string
  audiences: PlannerDeckAudience[]
  splitTablePng?: string | null
  splitTablePngWidth?: number | null
  splitTablePngHeight?: number | null
  generatedAtLabel: string
}

function templateDir() {
  return path.join(process.cwd(), "lib", "planning", "export", "assets")
}

function assertAssetsExist() {
  const root = path.join(templateDir(), ROOT_NAME)
  const tpl = path.join(templateDir(), TEMPLATE_NAME)
  if (!fs.existsSync(root)) {
    throw new Error(`Assembled root missing at ${root}`)
  }
  if (!fs.existsSync(tpl)) {
    throw new Error(`Assembled template missing at ${tpl}`)
  }
}

function stripDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = /^data:(image\/png);base64,(.+)$/i.exec(dataUrl.trim())
  if (m) return { mime: m[1]!, base64: m[2]! }
  // bare base64
  return { mime: "image/png", base64: dataUrl.replace(/\s/g, "") }
}

function toPptxImageData(dataUrl: string | null | undefined): string | null {
  if (!dataUrl?.trim()) return null
  const { mime, base64 } = stripDataUrl(dataUrl)
  return `${mime};base64,${base64}`
}

/** Read IHDR width/height from a PNG data URL when client dims are absent. */
export function pngPixelSize(
  dataUrl: string | null | undefined
): { width: number; height: number } | null {
  if (!dataUrl?.trim()) return null
  try {
    const { base64 } = stripDataUrl(dataUrl)
    const buf = Buffer.from(base64, "base64")
    if (buf.length < 24) return null
    if (buf.toString("ascii", 1, 4) !== "PNG") return null
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    if (!width || !height) return null
    return { width, height }
  } catch {
    return null
  }
}

function resolvePngSize(
  dataUrl: string | null | undefined,
  width?: number | null,
  height?: number | null
): { width: number; height: number } {
  if (
    typeof width === "number" &&
    width > 0 &&
    typeof height === "number" &&
    height > 0
  ) {
    return { width, height }
  }
  return pngPixelSize(dataUrl) ?? { width: 1200, height: 340 }
}

function setText(slide: { modifyElement: Function }, name: string, text: string) {
  const lines = String(text).split(/\r?\n/)
  // Empty placeholders have no <a:r>/<a:t> — setText is a no-op; setMultiText injects runs.
  slide.modifyElement(name, [
    ModifyTextHelper.setMultiText(
      lines.map((line) => ({
        paragraph: {},
        textRuns: [{ text: line.length ? line : " " }],
      }))
    ),
  ])
}

function safe(text: string | null | undefined, fallback = "—") {
  const t = (text ?? "").trim()
  return t || fallback
}

function fmtBudget(n: number | undefined) {
  if (n == null || !Number.isFinite(n) || n <= 0) return "Not set"
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n)}`
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "TBC"
  return d
}

function createCapturePair(createCapture: number) {
  const capture = Math.max(0, Math.min(100, createCapture))
  const create = 100 - capture
  return `${create}:${capture}`
}

function addImage(
  slide: { generate: Function },
  data: string | null,
  box: { x: number; y: number; w: number; h: number },
  name: string
) {
  if (!data) return
  slide.generate((pSlide: { addImage: Function }) => {
    pSlide.addImage({
      data,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
    })
  }, name)
}

/** Fit image into content area at full width, capped height, vertically centred. */
function contentBoxCentered(
  pngW: number,
  pngH: number,
  maxH: number
): { x: number; y: number; w: number; h: number } {
  const w = CONTENT.w
  let h = w * (pngH / pngW)
  if (h > maxH) h = maxH
  const y = CONTENT.y + (CONTENT.h - h) / 2
  return { x: CONTENT.x, y, w, h }
}

/** Stack images top-down in the content area; each width = CONTENT.w, h by aspect ≤ maxEachH. */
function contentBoxesStacked(
  sizes: Array<{ width: number; height: number }>,
  maxEachH: number,
  gap = 0.2
): Array<{ x: number; y: number; w: number; h: number }> {
  const boxes = sizes.map(({ width, height }) => {
    const w = CONTENT.w
    let h = w * (height / width)
    if (h > maxEachH) h = maxEachH
    return { x: CONTENT.x, y: 0, w, h }
  })
  const totalH =
    boxes.reduce((sum, b) => sum + b.h, 0) + gap * Math.max(0, boxes.length - 1)
  let y = CONTENT.y + Math.max(0, (CONTENT.h - totalH) / 2)
  return boxes.map((b) => {
    const placed = { ...b, y }
    y += b.h + gap
    return placed
  })
}

export async function buildPlannerDeck(input: PlannerDeckInput): Promise<Buffer> {
  assertAssetsExist()
  const audiences = input.audiences.slice(0, 3)
  const client = safe(input.brief.clientName, "Client")
  const campaign = safe(input.brief.campaignName, "Demand Flow plan")
  const cc = createCapturePair(input.diagnosis.createCapture)
  const active = audiences[0]

  const automizer = new Automizer({
    templateDir: templateDir(),
    outputDir: os.tmpdir(),
    removeExistingSlides: false,
    autoImportSlideMasters: true,
    cleanup: false,
    verbosity: 0,
    cleanupPlaceholders: false,
    compression: 6,
  })

  // Root already contains the cover as slide 1 — do not re-add cover from tpl.
  const pres = automizer.loadRoot(ROOT_NAME).load(TEMPLATE_NAME, "tpl")

  // 2 Statement Lime
  pres.addSlide("tpl", 16, (slide) => {
    const lines = [
      `Demand Flow plan - ${client}`,
      campaign,
      `Wave ${input.waveLabel}`,
      input.generatedAtLabel,
    ]
    setText(slide, "Text Placeholder 1", lines.join("\n"))
  })

  // 3 Agenda
  const agendaItems = [
    "Brief & objective",
    "Audiences & insights",
    "Demand diagnosis",
    "Constraints",
    "Recommended plan",
  ]
  pres.addSlide("tpl", 3, (slide) => {
    setText(slide, "Text Placeholder 1", "Agenda.")
    agendaItems.forEach((label, i) => {
      setText(slide, `Text Placeholder ${i + 2}`, String(i + 1).padStart(2, "0"))
      setText(slide, `Text Placeholder ${i + 7}`, label)
    })
  })

  // 4 Breaker 01 Brief
  pres.addSlide("tpl", 6, (slide) => {
    setText(slide, "Text Placeholder 1", "01")
    setText(slide, "Text Placeholder 2", "Brief & objective")
  })

  // 5 Say Four Things — brief
  pres.addSlide("tpl", 37, (slide) => {
    setText(slide, "Title 1", "Brief & objective")
    setText(
      slide,
      "Text Placeholder 2",
      `Objective\n${safe(input.brief.objectiveKind, "Not set")}, Create:Capture ${cc}`
    )
    setText(slide, "Text Placeholder 3", `Budget\n${fmtBudget(input.brief.budget)}`)
    setText(
      slide,
      "Text Placeholder 4",
      `Flight\n${fmtDate(input.brief.startDate)} - ${fmtDate(input.brief.endDate)}`
    )
    setText(
      slide,
      "Text Placeholder 5",
      `Category & market\n${safe(input.brief.category, "Not set")} · ${safe(input.brief.market, "Australia")}`
    )
  })

  // 6 Breaker 02 Audiences
  pres.addSlide("tpl", 7, (slide) => {
    setText(slide, "Text Placeholder 1", "02")
    setText(slide, "Text Placeholder 2", "Audiences & insights")
  })

  // Per audience — chart-free narrative slide 27 (never import 57–66)
  for (const aud of audiences) {
    const insight = summariseInsight(aud.insight)
    const block2 = insight.headline
      ? [insight.headline, ...insight.findings].filter(Boolean).join("\n")
      : `${aud.topMix || "Top affinity channels from the planner."}\nGenerate insight in the planner for the full story.`

    pres.addSlide("tpl", 33, (slide) => {
      setText(slide, "Title 1", aud.name)
      setText(slide, "Text Placeholder 2", `${aud.definition}\n${aud.stats}`)
      setText(slide, "Text Placeholder 3", block2)
    })

    const reachPng = toPptxImageData(aud.charts.reachIndexPng)
    const reachSize = resolvePngSize(
      aud.charts.reachIndexPng,
      aud.charts.reachIndexPngWidth,
      aud.charts.reachIndexPngHeight
    )
    const commentary =
      insight.reachArchitecture ||
      `Reach architecture for ${aud.name} · ${input.reachBasis} basis · wave ${input.waveLabel}`

    pres.addSlide("tpl", 27, (slide) => {
      setText(
        slide,
        "Text Placeholder 1",
        `${aud.name}\nReach × index\n${commentary}`
      )
      addImage(
        slide,
        reachPng,
        contentBoxCentered(reachSize.width, reachSize.height, 5.0),
        `reach-${aud.name}`
      )
    })
  }

  // Breaker 03 Diagnosis
  pres.addSlide("tpl", 8, (slide) => {
    setText(slide, "Text Placeholder 1", "03")
    setText(slide, "Text Placeholder 2", "Demand diagnosis")
  })

  const pen =
    input.diagnosis.penetrationPct != null
      ? `${input.diagnosis.penetrationPct}%`
      : "—"
  const target =
    input.diagnosis.targetPct != null ? `${input.diagnosis.targetPct}%` : "—"
  pres.addSlide("tpl", 37, (slide) => {
    setText(slide, "Title 1", "Demand diagnosis")
    setText(slide, "Text Placeholder 2", `Penetration\n${pen}`)
    setText(slide, "Text Placeholder 3", `Target / ambition\n${target}`)
    setText(
      slide,
      "Text Placeholder 4",
      `Salience\n${safe(input.diagnosis.salience, "Not set")}`
    )
    setText(slide, "Text Placeholder 5", `Create:Capture\n${cc}`)
  })

  // Breaker 04 Constraints
  pres.addSlide("tpl", 9, (slide) => {
    setText(slide, "Text Placeholder 1", "04")
    setText(slide, "Text Placeholder 2", "Constraints")
  })

  const excluded =
    input.constraintsSummary.excludedNames.length > 0
      ? `Excluded: ${input.constraintsSummary.excludedNames.join(", ")}`
      : "No channels excluded"
  pres.addSlide("tpl", 21, (slide) => {
    setText(
      slide,
      "Text Placeholder 1",
      `${input.constraintsSummary.includedCount} channels in play`
    )
    setText(slide, "Text Placeholder 2", excluded)
  })

  // Breaker 05 Recommended plan (reuse breaker 6)
  pres.addSlide("tpl", 6, (slide) => {
    setText(slide, "Text Placeholder 1", "05")
    setText(slide, "Text Placeholder 2", "Recommended plan")
  })

  const dfiiPng = toPptxImageData(active?.charts.dfiiPng)
  const quadPng = toPptxImageData(active?.charts.quadrantPng)
  const dfiiSize = resolvePngSize(
    active?.charts.dfiiPng,
    active?.charts.dfiiPngWidth,
    active?.charts.dfiiPngHeight
  )
  const quadSize = resolvePngSize(
    active?.charts.quadrantPng,
    active?.charts.quadrantPngWidth,
    active?.charts.quadrantPngHeight
  )
  const planCommentary = active
    ? `Active audience: ${active.name}. Top DFII: ${active.topDfii}. Mix: ${active.topMix}.`
    : "Recommended plan from scored channels."

  // Chart-free narrative slide 28 — DFII + quadrant stacked in content area
  pres.addSlide("tpl", 28, (slide) => {
    setText(slide, "Text Placeholder 1", `Recommended plan\n${planCommentary}`)
    const sizes: Array<{ width: number; height: number }> = []
    const images: Array<{ data: string | null; name: string }> = []
    if (dfiiPng) {
      sizes.push(dfiiSize)
      images.push({ data: dfiiPng, name: "dfii-chart" })
    }
    if (quadPng) {
      sizes.push(quadSize)
      images.push({ data: quadPng, name: "quadrant-chart" })
    }
    const boxes = contentBoxesStacked(sizes, 2.9)
    images.forEach((img, i) => {
      const box = boxes[i]
      if (box) addImage(slide, img.data, box, img.name)
    })
  })

  const splitPng = toPptxImageData(input.splitTablePng)
  const splitSize = resolvePngSize(
    input.splitTablePng,
    input.splitTablePngWidth,
    input.splitTablePngHeight
  )

  // Chart-free narrative slide 29
  pres.addSlide("tpl", 29, (slide) => {
    setText(
      slide,
      "Text Placeholder 1",
      "Recommended split\nBudget concentrates in the top 8 by BCS (power 1.5). All channels shown with DFII."
    )
    addImage(
      slide,
      splitPng,
      contentBoxCentered(splitSize.width, splitSize.height, 5.0),
      "split-table"
    )
  })

  // End
  pres.addSlide("tpl", 20)

  const zip = await pres.getJSZip()
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })
}
