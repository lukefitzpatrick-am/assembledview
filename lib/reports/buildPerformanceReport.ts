import fs from "node:fs"
import path from "node:path"
import JSZip from "jszip"

const SLIDE_XML_RE = /^ppt\/slides\/slide\d+\.xml$/

export type PerformanceReportPayload = {
  execSummary: string
  deliverySpend: string
  deliveryDeliverables: string
  channels: [string, string, string, string]
  kpis: [string, string, string, string]
  keyInsight: string
  insights: [string, string, string]
  recsInFlight: string
  recsNextPeriod: string
  steps: [
    { when: string; what: string },
    { when: string; what: string },
    { when: string; what: string },
    { when: string; what: string },
  ]
}

/** Escape for PowerPoint slide XML text runs. Ampersand first. */
export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export function performanceReportTemplatePath(cwd = process.cwd()): string {
  return path.join(cwd, "lib", "reports", "assets", "performance-report-template.pptx")
}

function tokenMap(payload: PerformanceReportPayload): Record<string, string> {
  return {
    "{{EXEC_SUMMARY}}": payload.execSummary,
    "{{DELIVERY_SPEND}}": payload.deliverySpend,
    "{{DELIVERY_DELIVERABLES}}": payload.deliveryDeliverables,
    "{{CHANNEL_1}}": payload.channels[0],
    "{{CHANNEL_2}}": payload.channels[1],
    "{{CHANNEL_3}}": payload.channels[2],
    "{{CHANNEL_4}}": payload.channels[3],
    "{{KPI_1}}": payload.kpis[0],
    "{{KPI_2}}": payload.kpis[1],
    "{{KPI_3}}": payload.kpis[2],
    "{{KPI_4}}": payload.kpis[3],
    "{{KEY_INSIGHT}}": payload.keyInsight,
    "{{INSIGHT_1}}": payload.insights[0],
    "{{INSIGHT_2}}": payload.insights[1],
    "{{INSIGHT_3}}": payload.insights[2],
    "{{RECS_IN_FLIGHT}}": payload.recsInFlight,
    "{{RECS_NEXT_PERIOD}}": payload.recsNextPeriod,
    "{{STEP_1_WHEN}}": payload.steps[0].when,
    "{{STEP_1_WHAT}}": payload.steps[0].what,
    "{{STEP_2_WHEN}}": payload.steps[1].when,
    "{{STEP_2_WHAT}}": payload.steps[1].what,
    "{{STEP_3_WHEN}}": payload.steps[2].when,
    "{{STEP_3_WHAT}}": payload.steps[2].what,
    "{{STEP_4_WHEN}}": payload.steps[3].when,
    "{{STEP_4_WHAT}}": payload.steps[3].what,
  }
}

function replaceTokens(xml: string, tokens: Record<string, string>): string {
  let out = xml
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(token).join(escapeXmlText(value))
  }
  return out
}

/**
 * Fill the tokenised performance-report template via string replacement in slide XML.
 * Throws if any `{{` remains after replacement (unfilled or unknown tokens).
 */
export async function buildPerformanceReport(
  payload: PerformanceReportPayload,
  templatePath = performanceReportTemplatePath(),
): Promise<Buffer> {
  const templateBuffer = fs.readFileSync(templatePath)
  const zip = await JSZip.loadAsync(templateBuffer)
  const tokens = tokenMap(payload)

  const slideFiles = Object.keys(zip.files).filter((name) => SLIDE_XML_RE.test(name))
  for (const name of slideFiles) {
    const file = zip.file(name)
    if (!file) continue
    const xml = await file.async("string")
    const filled = replaceTokens(xml, tokens)
    if (filled.includes("{{")) {
      throw new Error(`Unfilled report tokens remain in ${name}`)
    }
    zip.file(name, filled)
  }

  const out = await zip.generateAsync({ type: "nodebuffer" })
  return Buffer.from(out)
}
