/**
 * Campaign performance report on the 05b v5 deck.
 * pptx-automizer copies a slide for each role. The slide number is resolved
 * from the layout name. It is not a fixed index.
 *
 * Layout map (name in lib/reports/assets/v5/LAYOUTS.md):
 * cover         Cover - Sand        title
 * section       Title and Text      period summary, empty delivery, commentary
 * chart + text  Title and Text      channel chart, sand insight card, data headline
 * table         Two Column          channel data table
 * big number    Statement - Sky     KPI summary
 * closing       Thank You - Black   end
 *
 * Chart series here are spend measures, so the highlight is forest and the
 * rest is context. A series that is a media type uses channelColorFor.
 * Bars are pill-ended shapes (native chart bars cannot round their ends),
 * with a 2px gap, no gridlines, and a value label.
 *
 * Copy: Australian English, sentence case, no em dashes.
 * Numbers come from the payload. They are not re-derived.
 */
import "server-only"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { Automizer } from "pptx-automizer"
import { BRAND } from "@/lib/brand"
import { channelColorFor, getChartTheme } from "@/lib/chart-theme"
import type {
  CampaignReportChannelRow,
  CampaignReportPayload,
  ReportCommentary,
} from "@/lib/reports/campaignReport/assembleCampaignReportData"
import {
  formatReportInt,
  formatReportMoney,
} from "@/lib/reports/campaignReport/formatters"

const TEMPLATE_FILE = "am-template-deck-16x9.pptx"
const NOT_GENERATED = "Commentary not generated for this period."

const LAYOUT = {
  cover: "Cover - Sand",
  section: "Title and Text",
  chart: "Title and Text",
  table: "Two Column",
  bigNumber: "Statement - Sky",
  closing: "Thank You - Black",
} as const

const theme = getChartTheme("light")
const FONT = BRAND.font.sans
const INK = pptColour(BRAND.colour.ink)
const WHITE = pptColour(BRAND.colour.white)
const SAND = pptColour(BRAND.colour.sand)
const SKY = pptColour(BRAND.colour.sky)
const FOREST = pptColour(BRAND.colour.forest)
const LIME = pptColour(BRAND.colour.lime)
const HIGHLIGHT = pptColour(theme.highlight)
const CONTEXT = pptColour(theme.context)
const MUTED = pptColour(BRAND.colour.muted)
const LINE = pptColour(BRAND.colour.line)
const BAR_GAP_IN = theme.barGap / 96

type XmlNode = {
  textContent: string | null
  parentNode: XmlNode | null
  getAttribute?: (name: string) => string | null
}

type DrawSlide = {
  addShape: (kind: string, opts: Record<string, unknown>) => void
  addText: (text: string, opts: Record<string, unknown>) => void
  addTable: (rows: unknown[], opts: Record<string, unknown>) => void
}

function pptColour(token: string): string {
  return token.replace("#", "").toUpperCase()
}

function templateDir(): string {
  return path.join(process.cwd(), "lib", "reports", "assets", "v5")
}

function templatePath(): string {
  return path.join(templateDir(), TEMPLATE_FILE)
}

function safe(text: string | null | undefined, fallback = "Not available"): string {
  const value = (text ?? "").trim()
  return value || fallback
}

function pctLabel(fraction: number | null): string {
  if (fraction == null || !Number.isFinite(fraction)) return "Not available"
  return `${(fraction * 100).toFixed(1)}%`
}

function spendShareSentence(channel: CampaignReportChannelRow, totalSpend: number): string {
  if (!(totalSpend > 0)) return `${channel.label} delivered no spend in this period.`
  const share = Math.round((channel.spend / totalSpend) * 100)
  return `${channel.label} delivered ${share}% of spend.`
}

function spendVsPlanLine(payload: CampaignReportPayload): string {
  const { spend, plannedBudget, expectedSpendToDate } = payload.totals
  const expected =
    expectedSpendToDate == null
      ? ""
      : `, expected to date ${formatReportMoney(expectedSpendToDate)}`
  return `Delivered ${formatReportMoney(spend)}, planned ${formatReportMoney(plannedBudget)}${expected}.`
}

function previousCompareLine(payload: CampaignReportPayload): string {
  const prev = payload.totals.previousSpend
  if (prev == null) return "Previous period delivery is not available for this window."
  return `Previous period delivered ${formatReportMoney(prev)} spend and ${formatReportInt(payload.totals.previousImpressions ?? 0)} impressions.`
}

function insideSlideNumber(node: XmlNode): boolean {
  let current: XmlNode | null = node
  while (current) {
    if (current.getAttribute?.("type") === "sldNum") return true
    current = current.parentNode
  }
  return false
}

function clearSampleText(doc: { getElementsByTagName: (name: string) => ArrayLike<XmlNode> }): void {
  const nodes = doc.getElementsByTagName("a:t")
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    if (!node || insideSlideNumber(node)) continue
    node.textContent = ""
  }
}

async function slidesByLayoutName(filePath: string): Promise<Map<string, number>> {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
  const layoutNameByFile = new Map<string, string>()
  const names = Object.keys(zip.files)
  for (const name of names) {
    if (!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)) continue
    const xml = await zip.file(name)!.async("string")
    const layoutName = xml.match(/<p:cSld[^>]*name="([^"]*)"/)?.[1]
    if (layoutName) layoutNameByFile.set(path.posix.basename(name), layoutName)
  }

  const pres = await zip.file("ppt/presentation.xml")!.async("string")
  const rels = await zip.file("ppt/_rels/presentation.xml.rels")!.async("string")
  const targetById = new Map<string, string>()
  for (const match of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    targetById.set(match[1]!, match[2]!)
  }

  const found = new Map<string, number>()
  let index = 0
  for (const match of pres.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)) {
    index += 1
    const target = targetById.get(match[1]!) ?? ""
    const slidePath = path.posix.normalize(path.posix.join("ppt", target))
    const relPath = path.posix.join(
      path.posix.dirname(slidePath),
      "_rels",
      `${path.posix.basename(slidePath)}.rels`,
    )
    const slideRels = await zip.file(relPath)?.async("string")
    const layoutFile = slideRels?.match(/slideLayouts\/(slideLayout\d+\.xml)/)?.[1]
    const layoutName = layoutFile ? layoutNameByFile.get(layoutFile) : undefined
    if (layoutName && !found.has(layoutName)) found.set(layoutName, index)
  }
  return found
}

function requireLayout(map: Map<string, number>, name: string): number {
  const slide = map.get(name)
  if (!slide) throw new Error(`v5 layout not found: ${name}`)
  return slide
}

type PaintableSlide = {
  prepare: (
    callback: (doc: { getElementsByTagName: (name: string) => ArrayLike<XmlNode> }) => void,
  ) => void
  generate: (callback: (page: DrawSlide) => void) => void
}

function paint(slide: PaintableSlide, draw: (page: DrawSlide) => void): void {
  // prepare runs before generated shapes are imported. modify runs after and
  // would wipe the text those shapes just wrote.
  slide.prepare((doc: { getElementsByTagName: (name: string) => ArrayLike<XmlNode> }) => {
    clearSampleText(doc)
  })
  slide.generate((page: DrawSlide) => {
    draw(page)
  })
}

function pill(
  page: DrawSlide,
  box: { x: number; y: number; w: number; h: number },
  label: string,
  fill: string,
  text: string,
): void {
  page.addShape("roundRect", {
    ...box,
    fill: { color: fill },
    rectRadius: 1,
    line: { color: fill, pt: 0 },
  })
  page.addText(label, {
    ...box,
    fontFace: FONT,
    fontSize: 11,
    color: text,
    align: "center",
    valign: "middle",
    margin: 0,
  })
}

function insightCard(page: DrawSlide, x: number, y: number, w: number, sentence: string): void {
  page.addShape("roundRect", {
    x,
    y,
    w,
    h: 1.05,
    fill: { color: SAND },
    rectRadius: 0.12,
    line: { color: SAND, pt: 0 },
  })
  pill(page, { x: x + 0.16, y: y + 0.16, w: 1.15, h: 0.28 }, "Insight", SKY, INK)
  page.addText(sentence, {
    x: x + 0.16,
    y: y + 0.52,
    w: w - 0.32,
    h: 0.4,
    fontFace: FONT,
    fontSize: 14,
    color: INK,
    margin: 0,
  })
}

function heading(page: DrawSlide, text: string, colour = INK): void {
  page.addText(text, {
    x: 0.55,
    y: 0.36,
    w: 12.2,
    h: 0.62,
    fontFace: FONT,
    fontSize: 28,
    color: colour,
    margin: 0,
  })
}

type Bar = { label: string; value: number; colour: string }

function drawBars(page: DrawSlide, bars: Bar[], origin: { x: number; y: number }): void {
  const max = Math.max(...bars.map((bar) => bar.value), 1)
  const barH = 0.32
  const labelW = 2.3
  const trackW = 7.2
  bars.forEach((bar, index) => {
    const y = origin.y + index * (barH + BAR_GAP_IN)
    page.addText(bar.label, {
      x: origin.x,
      y,
      w: labelW,
      h: barH,
      fontFace: FONT,
      fontSize: 12,
      color: INK,
      margin: 0,
      valign: "middle",
    })
    const width = Math.max(barH, (bar.value / max) * trackW)
    page.addShape("roundRect", {
      x: origin.x + labelW,
      y,
      w: width,
      h: barH,
      fill: { color: bar.colour },
      rectRadius: 1,
      line: { color: bar.colour, pt: 0 },
    })
    page.addText(formatReportMoney(bar.value), {
      x: origin.x + labelW + trackW + 0.15,
      y,
      w: 1.8,
      h: barH,
      fontFace: FONT,
      fontSize: 12,
      color: INK,
      margin: 0,
      valign: "middle",
    })
  })
}

function mediaBarColour(group: string): string {
  return pptColour(channelColorFor(group))
}

function drawCommentary(page: DrawSlide, commentary: ReportCommentary): void {
  heading(page, "Commentary.")
  page.addText(commentary.summary, {
    x: 0.55,
    y: 1.1,
    w: 12.2,
    h: 0.55,
    fontFace: FONT,
    fontSize: 14,
    color: INK,
    margin: 0,
  })
  const items = commentary.items.slice(0, 4)
  const rowH = Math.min(1.3, 5.1 / Math.max(items.length, 1))
  const columns = [
    { tag: "Insight", fill: SKY, text: INK, x: 0.55 },
    { tag: "Action", fill: FOREST, text: WHITE, x: 4.7 },
    { tag: "Outcome", fill: LIME, text: INK, x: 8.85 },
  ] as const
  items.forEach((item, index) => {
    const y = 1.8 + index * rowH
    const bodies = [item.insight, item.action, item.outcome]
    columns.forEach((column, columnIndex) => {
      pill(page, { x: column.x, y, w: 1.2, h: 0.26 }, column.tag, column.fill, column.text)
      page.addText(bodies[columnIndex] ?? "", {
        x: column.x,
        y: y + 0.32,
        w: 3.9,
        h: 0.48,
        fontFace: FONT,
        fontSize: 12,
        color: INK,
        margin: 0,
      })
    })
    page.addText(`Owner: ${item.actionOwner}`, {
      x: 4.7,
      y: y + 0.82,
      w: 3.9,
      h: 0.24,
      fontFace: FONT,
      fontSize: 11,
      color: MUTED,
      margin: 0,
    })
    const kind = item.outcomeKind === "achieved" ? "Achieved" : "Expected"
    page.addText(kind, {
      x: 10.15,
      y,
      w: 1.3,
      h: 0.26,
      fontFace: FONT,
      fontSize: 11,
      color: MUTED,
      margin: 0,
      valign: "middle",
    })
  })
}

export async function buildCampaignReportDeck(
  payload: CampaignReportPayload,
): Promise<Buffer> {
  const filePath = templatePath()
  if (!fs.existsSync(filePath)) throw new Error(`v5 deck template missing at ${filePath}`)

  const layouts = await slidesByLayoutName(filePath)
  const client = safe(payload.clientName, "Client")
  const campaign = safe(payload.campaignName, payload.mbaNumber)
  const onDark = LAYOUT.closing

  const automizer = new Automizer({
    templateDir: templateDir(),
    outputDir: os.tmpdir(),
    removeExistingSlides: true,
    autoImportSlideMasters: true,
    cleanup: false,
    verbosity: 0,
    cleanupPlaceholders: false,
    compression: 6,
  })

  const pres = automizer.loadRoot(TEMPLATE_FILE).load(TEMPLATE_FILE, "v5")

  const add = (layoutName: string, draw: (page: DrawSlide) => void) => {
    pres.addSlide("v5", requireLayout(layouts, layoutName), (slide) => {
      paint(slide, draw)
    })
  }

  add(LAYOUT.cover, (page) => {
    heading(page, "Campaign report.")
    page.addText(
      [client, campaign, `MBA ${payload.mbaNumber}`, payload.period.label, `As of ${payload.asOf}.`].join(
        "\n",
      ),
      {
        x: 0.55,
        y: 1.2,
        w: 10,
        h: 2.4,
        fontFace: FONT,
        fontSize: 18,
        color: INK,
        margin: 0,
      },
    )
  })

  add(LAYOUT.section, (page) => {
    heading(page, "Period summary.")
    page.addText(
      [
        `Period. ${payload.period.label}.`,
        `Window. ${payload.period.current.startISO} to ${payload.period.current.endISO}.`,
        `Spend vs plan. ${spendVsPlanLine(payload)}`,
        `Delivery. Impressions ${formatReportInt(payload.totals.impressions)}. Clicks ${formatReportInt(payload.totals.clicks)}. Time elapsed ${pctLabel(payload.totals.timeElapsedPct)}. ${previousCompareLine(payload)}`,
      ].join("\n\n"),
      {
        x: 0.55,
        y: 1.2,
        w: 12.2,
        h: 5.4,
        fontFace: FONT,
        fontSize: 16,
        color: INK,
        margin: 0,
      },
    )
  })

  for (const channel of payload.channels) {
    const hasPrev = channel.previousSpend != null
    const bars: Bar[] = [
      { label: "Delivered", value: channel.spend, colour: HIGHLIGHT },
      ...(hasPrev
        ? [{ label: "Previous", value: channel.previousSpend ?? 0, colour: CONTEXT }]
        : []),
      { label: "Planned", value: channel.plannedBudget, colour: CONTEXT },
    ]
    add(LAYOUT.chart, (page) => {
      heading(page, `${channel.label} spend.`)
      insightCard(page, 0.55, 1.15, 12.2, spendShareSentence(channel, payload.totals.spend))
      drawBars(page, bars, { x: 0.55, y: 2.5 })
      page.addShape("roundRect", {
        x: 0.55,
        y: 6.55,
        w: 0.28,
        h: 0.28,
        fill: { color: mediaBarColour(channel.group) },
        rectRadius: 1,
        line: { color: mediaBarColour(channel.group), pt: 0 },
      })
      page.addText(channel.label, {
        x: 0.95,
        y: 6.55,
        w: 4,
        h: 0.28,
        fontFace: FONT,
        fontSize: 12,
        color: MUTED,
        margin: 0,
        valign: "middle",
      })
    })

    add(LAYOUT.table, (page) => {
      heading(page, `${channel.label} data.`)
      const cell = (text: string, header = false) => ({
        text,
        options: {
          fill: { color: header ? FOREST : WHITE },
          color: header ? WHITE : INK,
          bold: header,
          align: "left" as const,
          valign: "middle" as const,
        },
      })
      const rows = [
        ["Metric", "Selected", "Previous", "Planned"].map((label) => cell(label, true)),
        [
          cell("Spend"),
          cell(formatReportMoney(channel.spend)),
          cell(channel.previousSpend == null ? "Not available" : formatReportMoney(channel.previousSpend)),
          cell(formatReportMoney(channel.plannedBudget)),
        ],
        [
          cell("Impressions"),
          cell(formatReportInt(channel.impressions)),
          cell(
            channel.previousImpressions == null
              ? "Not available"
              : formatReportInt(channel.previousImpressions),
          ),
          cell("Not available"),
        ],
        [cell("Clicks"), cell(formatReportInt(channel.clicks)), cell("Not available"), cell("Not available")],
        [cell("Results"), cell(formatReportInt(channel.results)), cell("Not available"), cell("Not available")],
      ]
      page.addTable(rows, {
        x: 0.55,
        y: 1.3,
        w: 12.2,
        colW: [3, 3.1, 3.1, 3],
        border: { type: "solid", pt: 0.5, color: LINE },
        fontFace: FONT,
        fontSize: 12,
        color: INK,
        align: "left",
        valign: "middle",
      })
    })
  }

  if (payload.channels.length === 0) {
    add(LAYOUT.section, (page) => {
      heading(page, "Delivery by channel.")
      page.addText(
        `No digital delivery channels reported for this period. ${previousCompareLine(payload)}`,
        {
          x: 0.55,
          y: 1.3,
          w: 12.2,
          h: 2,
          fontFace: FONT,
          fontSize: 16,
          color: INK,
          margin: 0,
        },
      )
    })
  }

  const kpiLines = payload.kpis
    .filter((kpi) => !kpi.omitted)
    .map((kpi) => `${kpi.label}. Target ${kpi.targetDisplay}, delivered ${kpi.actualDisplay ?? "No delivery feed"}.`)
  const omittedNote = payload.kpis.some((kpi) => kpi.omitted)
    ? "Some KPI targets were omitted pending KPI data review."
    : ""

  add(LAYOUT.bigNumber, (page) => {
    heading(page, "KPI summary.")
    page.addText(kpiLines[0] ?? "No campaign KPI targets with clear units for this period.", {
      x: 0.55,
      y: 1.4,
      w: 12.2,
      h: 1.1,
      fontFace: FONT,
      fontSize: 26,
      color: INK,
      margin: 0,
    })
    page.addText([kpiLines[1], kpiLines[2], kpiLines[3], omittedNote].filter(Boolean).join("\n"), {
      x: 0.55,
      y: 2.7,
      w: 12.2,
      h: 3.2,
      fontFace: FONT,
      fontSize: 16,
      color: INK,
      margin: 0,
    })
  })

  add(LAYOUT.section, (page) => {
    if (payload.commentary && payload.commentary.items.length > 0) {
      drawCommentary(page, payload.commentary)
      return
    }
    heading(page, "Commentary.")
    page.addText(NOT_GENERATED, {
      x: 0.55,
      y: 1.3,
      w: 12.2,
      h: 0.6,
      fontFace: FONT,
      fontSize: 18,
      color: INK,
      margin: 0,
    })
  })

  add(onDark, (page) => {
    heading(page, "Thank you.", WHITE)
  })

  const zip = await pres.getJSZip()
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })
}

export { campaignReportFilename } from "@/lib/reports/campaignReport/filename"
