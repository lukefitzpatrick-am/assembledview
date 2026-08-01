/**
 * Campaign performance report deck on the Assembled brand template
 * (pptx-automizer + assembled-root / assembled-template).
 *
 * Native charts via pptxgenjs addChart inside slide.generate (supported by
 * pptx-automizer). Never starts from a blank presentation.
 *
 * Copy rules: Australian English, sentence case, no em dashes.
 * Numbers are taken verbatim from the assembled payload — never re-derived.
 */
import "server-only"
import fs from "fs"
import os from "os"
import path from "path"
import { Automizer, ModifyTextHelper } from "pptx-automizer"
import type { CampaignReportPayload } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import {
  formatReportInt,
  formatReportMoney,
} from "@/lib/reports/campaignReport/formatters"

const ROOT_NAME = "assembled-root.pptx"
const TEMPLATE_NAME = "assembled-template.pptx"

/** Right-hand content area on narrative slides 27–29. */
const CONTENT = {
  x: 6.18,
  y: 0.43,
  w: 6.57,
  h: 6.49,
}

const BRAND_GREEN = "7A9B3C"
const BRAND_INK = "1F2A1F"
const BRAND_MUTED = "5C6B5C"

function templateDir() {
  return path.join(process.cwd(), "lib", "planning", "export", "assets")
}

function assertAssetsExist() {
  const root = path.join(templateDir(), ROOT_NAME)
  const tpl = path.join(templateDir(), TEMPLATE_NAME)
  if (!fs.existsSync(root)) throw new Error(`Assembled root missing at ${root}`)
  if (!fs.existsSync(tpl)) throw new Error(`Assembled template missing at ${tpl}`)
}

function setText(slide: { modifyElement: Function }, name: string, text: string) {
  const lines = String(text).split(/\r?\n/)
  slide.modifyElement(name, [
    ModifyTextHelper.setMultiText(
      lines.map((line) => ({
        paragraph: {},
        textRuns: [{ text: line.length ? line : " " }],
      })),
    ),
  ])
}

function safe(text: string | null | undefined, fallback = "—") {
  const t = (text ?? "").trim()
  return t || fallback
}

function pctLabel(fraction: number | null): string {
  if (fraction == null || !Number.isFinite(fraction)) return "—"
  return `${(fraction * 100).toFixed(1)}%`
}

function spendVsPlanLine(payload: CampaignReportPayload): string {
  const { spend, plannedBudget, expectedSpendToDate } = payload.totals
  const parts = [
    `Delivered ${formatReportMoney(spend)}`,
    `planned ${formatReportMoney(plannedBudget)}`,
  ]
  if (expectedSpendToDate != null) {
    parts.push(`expected to date ${formatReportMoney(expectedSpendToDate)}`)
  }
  return parts.join(". ") + "."
}

function previousCompareLine(payload: CampaignReportPayload): string {
  const prev = payload.totals.previousSpend
  if (prev == null) return "Previous period delivery is not available for this window."
  return `Previous period delivered ${formatReportMoney(prev)} spend and ${formatReportInt(payload.totals.previousImpressions ?? 0)} impressions.`
}

export async function buildCampaignReportDeck(
  payload: CampaignReportPayload,
): Promise<Buffer> {
  assertAssetsExist()

  const client = safe(payload.clientName, "Client")
  const campaign = safe(payload.campaignName, payload.mbaNumber)
  const periodLabel = payload.period.label
  const asOfLabel = `As of ${payload.asOf}`

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

  const pres = automizer.loadRoot(ROOT_NAME).load(TEMPLATE_NAME, "tpl")

  // Title (Statement Lime)
  pres.addSlide("tpl", 16, (slide) => {
    setText(
      slide,
      "Text Placeholder 1",
      [
        `Campaign report. ${client}`,
        campaign,
        `MBA ${payload.mbaNumber}`,
        periodLabel,
        asOfLabel,
      ].join("\n"),
    )
  })

  // Period summary (Say Four Things layout: Title 1 + Text Placeholder 2–5)
  pres.addSlide("tpl", 37, (slide) => {
    setText(slide, "Title 1", "Period summary")
    setText(slide, "Text Placeholder 2", `Period\n${periodLabel}`)
    setText(
      slide,
      "Text Placeholder 3",
      `Window\n${payload.period.current.startISO} to ${payload.period.current.endISO}`,
    )
    setText(slide, "Text Placeholder 4", `Spend vs plan\n${spendVsPlanLine(payload)}`)
    setText(
      slide,
      "Text Placeholder 5",
      `Delivery\nImpressions ${formatReportInt(payload.totals.impressions)}. Clicks ${formatReportInt(payload.totals.clicks)}. Time elapsed ${pctLabel(payload.totals.timeElapsedPct)}. ${previousCompareLine(payload)}`,
    )
  })

  // One slide per channel: native bar chart + data table
  for (const ch of payload.channels) {
    const hasPrev = ch.previousSpend != null
    const labels = hasPrev
      ? ["Delivered spend", "Previous spend", "Planned spend"]
      : ["Delivered spend", "Planned spend"]
    const values = hasPrev
      ? [ch.spend, ch.previousSpend ?? 0, ch.plannedBudget]
      : [ch.spend, ch.plannedBudget]
    const series = [{ name: ch.label, labels, values }]

    // Chart slide (content layout)
    pres.addSlide("tpl", 28, (slide) => {
      setText(
        slide,
        "Text Placeholder 1",
        `${ch.label}\nSpend delivered versus plan${hasPrev ? " and previous period" : ""}.`,
      )
      slide.generate((pSlide: any, pptxGenJs: any) => {
        const ChartType = pptxGenJs?.ChartType ?? { bar: "bar" }
        pSlide.addChart(ChartType.bar, series, {
          x: CONTENT.x,
          y: CONTENT.y,
          w: CONTENT.w,
          h: 3.6,
          showTitle: false,
          showLegend: false,
          chartColors: [BRAND_GREEN],
          color: BRAND_INK,
        })
      }, `chart-${ch.group}`)
    })

    // Data table slide (verbatim numbers from payload)
    pres.addSlide("tpl", 29, (slide) => {
      setText(slide, "Text Placeholder 1", `${ch.label}. Data table.`)
      slide.generate((pSlide: any) => {
        const rows: Array<Array<{ text: string; options?: Record<string, unknown> }>> = [
          [
            { text: "Metric", options: { bold: true } },
            { text: "Selected", options: { bold: true } },
            { text: "Previous", options: { bold: true } },
            { text: "Planned", options: { bold: true } },
          ],
          [
            { text: "Spend" },
            { text: formatReportMoney(ch.spend) },
            { text: ch.previousSpend == null ? "—" : formatReportMoney(ch.previousSpend) },
            { text: formatReportMoney(ch.plannedBudget) },
          ],
          [
            { text: "Impressions" },
            { text: formatReportInt(ch.impressions) },
            {
              text:
                ch.previousImpressions == null
                  ? "—"
                  : formatReportInt(ch.previousImpressions),
            },
            { text: "—" },
          ],
          [
            { text: "Clicks" },
            { text: formatReportInt(ch.clicks) },
            { text: "—" },
            { text: "—" },
          ],
          [
            { text: "Results" },
            { text: formatReportInt(ch.results) },
            { text: "—" },
            { text: "—" },
          ],
        ]
        pSlide.addTable(rows, {
          x: CONTENT.x,
          y: CONTENT.y + 0.2,
          w: CONTENT.w,
          colW: [1.6, 1.7, 1.6, 1.6],
          border: { type: "solid", pt: 0.5, color: "D0D5D0" },
          fontFace: "Arial",
          fontSize: 11,
          color: BRAND_INK,
          align: "left",
          valign: "middle",
        })
      }, `table-${ch.group}`)
    })
  }

  if (payload.channels.length === 0) {
    pres.addSlide("tpl", 33, (slide) => {
      setText(slide, "Title 1", "Delivery by channel")
      setText(
        slide,
        "Text Placeholder 2",
        "No digital delivery channels reported for this period.",
      )
      setText(slide, "Text Placeholder 3", previousCompareLine(payload))
    })
  }

  // KPI summary (omit ambiguous rows from the deck)
  const kpiLines = payload.kpis
    .filter((k) => !k.omitted)
    .map((k) => {
      const actual = k.actualDisplay ?? "No delivery feed"
      return `${k.label}: target ${k.targetDisplay}, delivered ${actual}`
    })
  const omittedNote = payload.kpis.some((k) => k.omitted)
    ? " Some KPI targets were omitted pending KPI data review."
    : ""

  pres.addSlide("tpl", 37, (slide) => {
    setText(slide, "Title 1", "KPI summary")
    setText(
      slide,
      "Text Placeholder 2",
      kpiLines[0] ?? "No campaign KPI targets with clear units for this period.",
    )
    setText(slide, "Text Placeholder 3", kpiLines[1] ?? " ")
    setText(slide, "Text Placeholder 4", kpiLines[2] ?? " ")
    setText(
      slide,
      "Text Placeholder 5",
      (kpiLines[3] ?? previousCompareLine(payload)) + omittedNote,
    )
  })

  // Commentary placeholder (AVA wiring is follow-up)
  pres.addSlide("tpl", 33, (slide) => {
    setText(slide, "Title 1", "Commentary")
    setText(slide, "Text Placeholder 2", payload.commentaryPlaceholder)
    setText(slide, "Text Placeholder 3", "Follow-up: wire assembled-insight-commentary.")
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

export { campaignReportFilename } from "@/lib/reports/campaignReport/filename"
