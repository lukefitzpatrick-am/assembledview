/**
 * Build a Demand Flow planner deck from the Assembled Media brand template.
 * Never starts from a blank presentation — always assembled-template.pptx.
 */
import fs from "fs"
import os from "os"
import path from "path"
import { Automizer, ModifyTextHelper } from "pptx-automizer"

const TEMPLATE_NAME = "assembled-template.pptx"

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
    quadrantPng?: string | null
    dfiiPng?: string | null
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
  generatedAtLabel: string
}

const EMU = 914400
function emuToIn(n: number) {
  return n / EMU
}

/** Slide 57 chart frame */
const CHART_57 = {
  x: emuToIn(552450),
  y: emuToIn(1476375),
  w: emuToIn(11099800),
  h: emuToIn(4681538),
}
/** Slide 63 left / right chart frames */
const CHART_63_L = {
  x: emuToIn(4641850),
  y: emuToIn(1243013),
  w: emuToIn(3295650),
  h: emuToIn(4908550),
}
const CHART_63_R = {
  x: emuToIn(8382000),
  y: emuToIn(1243013),
  w: emuToIn(3294063),
  h: emuToIn(4908550),
}

function templateDir() {
  return path.join(process.cwd(), "lib", "planning", "export", "assets")
}

function assertTemplateExists() {
  const p = path.join(templateDir(), TEMPLATE_NAME)
  if (!fs.existsSync(p)) {
    throw new Error(`Assembled template missing at ${p}`)
  }
  return p
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

/** Pull HEADLINE + first two bullet-ish findings from insight markdown. */
export function summariseInsight(insight: string | null | undefined): {
  headline: string | null
  findings: string[]
  reachArchitecture: string | null
} {
  if (!insight?.trim()) {
    return { headline: null, findings: [], reachArchitecture: null }
  }
  const lines = insight
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  let headline: string | null = null
  const findings: string[] = []
  let reachArchitecture: string | null = null
  let section: string | null = null

  for (const line of lines) {
    const upper = line.toUpperCase()
    if (upper.startsWith("HEADLINE")) {
      section = "headline"
      const rest = line.replace(/^HEADLINE[:\s]*/i, "").trim()
      if (rest) headline = rest
      continue
    }
    if (upper.startsWith("WHAT STANDS OUT")) {
      section = "stands"
      continue
    }
    if (upper.startsWith("REACH ARCHITECTURE")) {
      section = "reach"
      continue
    }
    if (
      upper.startsWith("CREATIVE") ||
      upper.startsWith("WATCH-OUTS") ||
      upper.startsWith("WATCH OUTS")
    ) {
      section = "other"
      continue
    }
    const cleaned = line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "")
    if (section === "headline" && !headline) headline = cleaned
    else if (section === "stands" && findings.length < 2) findings.push(cleaned)
    else if (section === "reach" && !reachArchitecture) reachArchitecture = cleaned
  }

  if (!headline) headline = lines[0] ?? null
  return { headline, findings, reachArchitecture }
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

export async function buildPlannerDeck(input: PlannerDeckInput): Promise<Buffer> {
  assertTemplateExists()
  const audiences = input.audiences.slice(0, 3)
  const client = safe(input.brief.clientName, "Client")
  const campaign = safe(input.brief.campaignName, "Demand Flow plan")
  const cc = createCapturePair(input.diagnosis.createCapture)
  const active = audiences[0]

  const automizer = new Automizer({
    templateDir: templateDir(),
    outputDir: os.tmpdir(),
    removeExistingSlides: true,
    autoImportSlideMasters: true,
    cleanup: true,
    verbosity: 0,
    cleanupPlaceholders: false,
    compression: 6,
  })

  const pres = automizer.loadRoot(TEMPLATE_NAME).load(TEMPLATE_NAME, "tpl")

  // 1 Cover
  pres.addSlide("tpl", 1)

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

  // Per audience
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
    const commentary =
      insight.reachArchitecture ||
      `Reach architecture for ${aud.name} · ${input.reachBasis} basis · wave ${input.waveLabel}`

    pres.addSlide("tpl", 57, (slide) => {
      try {
        slide.removeElement("Content Placeholder 6")
      } catch {
        /* chart may already be absent */
      }
      setText(slide, "Text Placeholder 2", `${aud.name} - reach x index`)
      setText(slide, "Text Placeholder 3", commentary)
      addImage(slide, reachPng, CHART_57, `reach-${aud.name}`)
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
  const planCommentary = active
    ? `Active audience: ${active.name}. Top DFII: ${active.topDfii}. Mix: ${active.topMix}.`
    : "Recommended plan from scored channels."

  pres.addSlide("tpl", 63, (slide) => {
    try {
      slide.removeElement("Chart Placeholder 10")
    } catch {
      /* ignore */
    }
    try {
      slide.removeElement("Chart Placeholder 13")
    } catch {
      /* ignore */
    }
    setText(slide, "Text Placeholder 6", "Recommended plan")
    setText(slide, "Text Placeholder 7", planCommentary)
    setText(slide, "Text Placeholder 3", "DFII ranked")
    setText(slide, "Text Placeholder 4", "Reach × index")
    setText(
      slide,
      "Text Placeholder 5",
      `Roy Morgan · wave ${input.waveLabel} · ${input.reachBasis}`
    )
    addImage(slide, dfiiPng, CHART_63_L, "dfii-chart")
    addImage(slide, quadPng, CHART_63_R, "quadrant-chart")
  })

  const splitPng = toPptxImageData(input.splitTablePng)
  pres.addSlide("tpl", 57, (slide) => {
    try {
      slide.removeElement("Content Placeholder 6")
    } catch {
      /* ignore */
    }
    setText(slide, "Text Placeholder 2", "Recommended split")
    setText(
      slide,
      "Text Placeholder 3",
      "Budget concentrates in the top 8 by BCS (power 1.5). All channels shown with DFII."
    )
    addImage(slide, splitPng, CHART_57, "split-table")
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
