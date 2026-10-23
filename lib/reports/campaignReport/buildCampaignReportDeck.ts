/**
 * Campaign performance report on the 05b v5 deck.
 * pptx-automizer copies a slide for each role. The slide number is the part
 * number in `ppt/slides/slideN.xml`, which is what automizer opens. It is not
 * the presentation-order index.
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
import { Automizer, modify } from "pptx-automizer"
import { fetchBrandCoverPhoto } from "@/lib/ava/brand/catalog"
import { BRAND } from "@/lib/brand"
import { channelColorFor, getChartTheme } from "@/lib/chart-theme"
import type {
  CampaignReportChannelRow,
  CampaignReportPayload,
  ReportCommentary,
} from "@/lib/reports/campaignReport/assembleCampaignReportData"
import {
  formatReportCtr,
  formatReportDate,
  formatReportInt,
  formatReportMoney,
  formatReportPace,
  formatReportRate,
  REPORT_FIGURE_DASH,
} from "@/lib/reports/campaignReport/formatters"
import type { CampaignReportPeriodMetrics } from "@/lib/reports/campaignReport/periodMetrics"
import type { ConversionFigures } from "@/lib/delivery/conversions/channelConversions"
import { formatRoas } from "@/lib/delivery/conversions/rules"
import {
  campaignSpendShareSentence,
  rateExclusionFootnote,
} from "@/lib/reports/campaignReport/reportFigures"

const TEMPLATE_FILE = "am-template-deck-16x9.pptx"
const COVER_MEDIA_FILE = "am-cover.jpg"
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
const HEADING_FONT = "Plus Jakarta Sans ExtraBold"
const INK = pptColour(BRAND.colour.ink)
const WHITE = pptColour(BRAND.colour.white)
const CAPTION_ON_DARK = pptColour(BRAND.colour.mutedOnBlack)
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

function withFullStop(text: string): string {
  const trimmed = text.trim()
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`
}

/** 36pt on one line. 32pt when that face would wrap the heading box. */
function headingPointSize(text: string, widthIn: number): number {
  const widthAt36 = text.length * (36 / 72) * 0.56
  return widthAt36 > widthIn ? 32 : 36
}

function coverTitle(client: string, campaign: string): string {
  const left = client.trim()
  const right = campaign.trim()
  const combined = right.toLowerCase().startsWith(left.toLowerCase())
    ? right
    : [left, right].filter(Boolean).join(" ")
  const base = combined.replace(/\.+$/, "")
  if (/campaign report$/i.test(base)) return `${base}.`
  return `${base} campaign report.`
}

function channelNotYetLive(channel: CampaignReportChannelRow): boolean {
  return !(channel.spend > 0) && !(channel.impressions > 0)
}

function notYetLiveLine(channels: CampaignReportChannelRow[]): string {
  const quiet = channels.filter(channelNotYetLive)
  if (quiet.length === 0) return ""
  return `Not yet live. ${quiet.map((channel) => channel.label).join(", ")}.`
}

type Anchor = { x: number; y: number; w: number; h: number }

type LayoutRole = {
  number: number
  dark: boolean
  title: Anchor | null
  subtitle: Anchor | null
}

function emuToInches(value: number): number {
  return Math.round((value / 914400) * 1000) / 1000
}

function anchorFromXml(chunk: string): Anchor | null {
  const off = chunk.match(/<a:off[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/)
  const ext = chunk.match(/<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
  if (!off || !ext) return null
  return {
    x: emuToInches(Number(off[1])),
    y: emuToInches(Number(off[2])),
    w: emuToInches(Number(ext[1])),
    h: emuToInches(Number(ext[2])),
  }
}

function isDarkHex(hex: string): boolean {
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  if (![r, g, b].every((part) => Number.isFinite(part))) return false
  return (r + g + b) / 3 < 90
}

function layoutIsDark(name: string, background: string | null): boolean {
  if (name.toLowerCase().includes("black")) return true
  return background != null && isDarkHex(background)
}

function placeholderAnchors(xml: string): { title: Anchor | null; subtitle: Anchor | null } {
  let title: Anchor | null = null
  const bodies: Anchor[] = []
  for (const chunk of xml.split(/<p:sp[\s>]/).slice(1)) {
    const ph = chunk.match(/<p:ph\b([^>]*)\/?>/)
    if (!ph) continue
    const type = ph[1]?.match(/\btype="([^"]*)"/)?.[1] ?? "body"
    const box = anchorFromXml(chunk)
    if (!box) continue
    if (type === "title" && !title) title = box
    if (type === "body" || type === "subTitle") bodies.push(box)
  }
  const subtitle = bodies.reduce<Anchor | null>((lowest, box) => {
    if (!lowest || box.y > lowest.y) return box
    return lowest
  }, null)
  return { title, subtitle }
}

function previousFigure(
  metrics: CampaignReportPeriodMetrics | null,
  value: string,
): string {
  if (!metrics) return "Not available"
  return value
}

function spendShareSentence(channel: CampaignReportChannelRow, totalSpend: number): string {
  if (!(totalSpend > 0)) return `${channel.label} delivered no spend in this period.`
  const share = Math.round((channel.spend / totalSpend) * 100)
  return campaignSpendShareSentence(channel.label, share)
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
  if (payload.period.previous == null) return ""
  const prev = payload.totals.previousSpend
  if (prev == null) return "Previous period delivery is not available for this window."
  return `Previous period delivered ${formatReportMoney(prev)} spend and ${formatReportInt(payload.totals.previousImpressions ?? 0)} impressions.`
}

/** Planned cell on the CPV row: the channel's plan CPV, labelled as the target. */
export function planCpvTargetLabel(value: number): string {
  return `${formatReportRate(value)} (plan rate target)`
}

function plannedCountLabel(value: number | null | undefined): string {
  if (value == null || !(value > 0)) return "No plan"
  return formatReportInt(value)
}

function isBlankTargetDisplay(target: string): boolean {
  const value = target.trim()
  return value === "" || value === "—" || value === "0" || value === "0.0%" || value === "0.00%" || value === "$0" || value === "$0.00"
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

async function slidesByLayoutName(filePath: string): Promise<Map<string, LayoutRole>> {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
  const layoutByFile = new Map<string, { name: string; dark: boolean }>()
  const names = Object.keys(zip.files)
  for (const name of names) {
    if (!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)) continue
    const xml = await zip.file(name)!.async("string")
    const layoutName = xml.match(/<p:cSld[^>]*name="([^"]*)"/)?.[1]
    if (!layoutName) continue
    const background =
      xml.match(/<p:bg>[\s\S]*?<\/p:bg>/)?.[0]?.match(/srgbClr val="([A-Fa-f0-9]{6})"/i)?.[1] ?? null
    layoutByFile.set(path.posix.basename(name), {
      name: layoutName,
      dark: layoutIsDark(layoutName, background?.toUpperCase() ?? null),
    })
  }

  const pres = await zip.file("ppt/presentation.xml")!.async("string")
  const rels = await zip.file("ppt/_rels/presentation.xml.rels")!.async("string")
  const targetById = new Map<string, string>()
  for (const match of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    targetById.set(match[1]!, match[2]!)
  }

  const found = new Map<string, LayoutRole>()
  for (const match of pres.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)) {
    const target = targetById.get(match[1]!) ?? ""
    const slidePath = path.posix.normalize(path.posix.join("ppt", target))
    const base = path.posix.basename(slidePath)
    const number = Number(base.replace(/^slide/, "").replace(/\.xml$/, ""))
    if (!Number.isInteger(number)) continue
    const relPath = path.posix.join(path.posix.dirname(slidePath), "_rels", `${base}.rels`)
    const slideRels = await zip.file(relPath)?.async("string")
    const layoutFile = slideRels?.match(/slideLayouts\/(slideLayout\d+\.xml)/)?.[1]
    const layout = layoutFile ? layoutByFile.get(layoutFile) : undefined
    if (!layout || found.has(layout.name)) continue
    const slideXml = await zip.file(slidePath)?.async("string")
    const anchors = slideXml ? placeholderAnchors(slideXml) : { title: null, subtitle: null }
    found.set(layout.name, { number, dark: layout.dark, ...anchors })
  }
  return found
}

function requireRole(map: Map<string, LayoutRole>, name: string): LayoutRole {
  const role = map.get(name)
  if (!role) throw new Error(`v5 layout not found: ${name}`)
  return role
}

type PaintableSlide = {
  prepare: (
    callback: (doc: { getElementsByTagName: (name: string) => ArrayLike<XmlNode> }) => void,
  ) => void
  generate: (callback: (page: DrawSlide) => void) => void
}

type XmlEl = XmlNode & {
  getAttribute: (name: string) => string | null
  setAttribute: (name: string, value: string) => void
  getElementsByTagName: (name: string) => ArrayLike<XmlEl>
  removeChild: (child: XmlEl) => void
}

function recolourTemplateInk(doc: { getElementsByTagName: (name: string) => ArrayLike<XmlEl> }): void {
  const colours = doc.getElementsByTagName("a:srgbClr")
  for (let i = 0; i < colours.length; i += 1) {
    const node = colours[i]
    const value = node?.getAttribute("val")?.toUpperCase()
    if (value === INK) node?.setAttribute("val", WHITE)
    if (value === MUTED) node?.setAttribute("val", CAPTION_ON_DARK)
  }
}

function removeEmptyLimePills(doc: { getElementsByTagName: (name: string) => ArrayLike<XmlEl> }): void {
  const shapes = Array.from(doc.getElementsByTagName("p:sp"))
  for (const shape of shapes) {
    const colours = shape.getElementsByTagName("a:srgbClr")
    let lime = false
    for (let i = 0; i < colours.length; i += 1) {
      if (colours[i]?.getAttribute("val")?.toUpperCase() === LIME) lime = true
    }
    if (!lime) continue
    const texts = shape.getElementsByTagName("a:t")
    let hasText = false
    for (let i = 0; i < texts.length; i += 1) {
      if ((texts[i]?.textContent ?? "").trim()) hasText = true
    }
    if (!hasText) (shape.parentNode as XmlEl | null)?.removeChild(shape)
  }
}

function paint(
  slide: PaintableSlide,
  draw: (page: DrawSlide) => void,
  tidy?: (doc: { getElementsByTagName: (name: string) => ArrayLike<XmlEl> }) => void,
): void {
  // prepare runs before generated shapes are imported. modify runs after and
  // would wipe the text those shapes just wrote.
  slide.prepare((doc: { getElementsByTagName: (name: string) => ArrayLike<XmlNode> }) => {
    clearSampleText(doc)
    tidy?.(doc as { getElementsByTagName: (name: string) => ArrayLike<XmlEl> })
  })
  slide.generate((page: DrawSlide) => {
    draw(page)
  })
}

function onDarkGround(page: DrawSlide): DrawSlide {
  return {
    addShape: (kind, opts) => page.addShape(kind, opts),
    addTable: (rows, opts) => page.addTable(rows, opts),
    addText: (text, opts) => {
      const color = String(opts.color ?? INK).toUpperCase()
      const next = color === INK ? WHITE : color === MUTED ? CAPTION_ON_DARK : color
      page.addText(text, { ...opts, color: next })
    },
  }
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

const NOT_TRACKED = "Not tracked"

/**
 * Conversion figures for the deck (CF5): the client's headline, then Revenue
 * and ROAS when the client shows revenue. Empty when the switch is off.
 */
export function deckConversionFigures(
  payload: Pick<CampaignReportPayload, "conversions">,
  figures: ConversionFigures | null | undefined,
): { label: string; value: string }[] {
  const settings = payload.conversions
  if (!settings || !figures) return []
  const out = [
    { label: settings.label, value: figures.count == null ? NOT_TRACKED : formatReportInt(figures.count) },
  ]
  if (settings.showRevenue) {
    const valueOn = figures.tracked && figures.valueTracked
    out.push({
      label: "Revenue",
      value: valueOn && figures.revenue != null ? formatReportMoney(figures.revenue) : NOT_TRACKED,
    })
    out.push({ label: "ROAS", value: valueOn ? formatRoas(figures.roas) : NOT_TRACKED })
  }
  return out
}

function drawKeyMetrics(page: DrawSlide, payload: CampaignReportPayload): void {
  const metrics = payload.totals.metrics
  const tiles: { label: string; value: string; colour: string }[] = [
    { label: "CPM", value: formatReportRate(metrics.cpm), colour: INK },
    { label: "CPC", value: formatReportRate(metrics.cpc), colour: INK },
    { label: "CTR", value: formatReportCtr(metrics.ctr), colour: INK },
    {
      label: "Spend pace",
      value: formatReportPace(metrics.spendPacePct),
      colour: FOREST,
    },
  ]
  if (metrics.cpv != null) {
    tiles.push({ label: "CPV", value: formatReportRate(metrics.cpv), colour: INK })
  }
  if (metrics.videoViews3s != null) {
    tiles.push({
      label: "3-second views",
      value: formatReportInt(metrics.videoViews3s),
      colour: INK,
    })
  }

  page.addText("Key metrics.", {
    x: 0.55,
    y: 3.55,
    w: 12.2,
    h: 0.36,
    fontFace: FONT,
    fontSize: 16,
    color: INK,
    margin: 0,
  })

  const gap = 0.16
  const width = (12.2 - gap * (tiles.length - 1)) / tiles.length
  tiles.forEach((tile, index) => {
    const x = 0.55 + index * (width + gap)
    page.addText(tile.label, {
      x,
      y: 4.02,
      w: width,
      h: 0.28,
      fontFace: FONT,
      fontSize: 12,
      color: MUTED,
      margin: 0,
    })
    page.addText(tile.value, {
      x,
      y: 4.32,
      w: width,
      h: 0.46,
      fontFace: FONT,
      fontSize: 20,
      color: tile.colour,
      margin: 0,
    })
  })

  // Conversions sit on their own row so the rate tiles keep their width.
  const conversionTiles = deckConversionFigures(payload, payload.totals.conversions)
  if (conversionTiles.length > 0) {
    const cWidth = (12.2 - gap * 3) / 4
    conversionTiles.forEach((tile, index) => {
      const x = 0.55 + index * (cWidth + gap)
      page.addText(tile.label, {
        x,
        y: 5.35,
        w: cWidth,
        h: 0.28,
        fontFace: FONT,
        fontSize: 12,
        color: MUTED,
        margin: 0,
      })
      page.addText(tile.value, {
        x,
        y: 5.65,
        w: cWidth,
        h: 0.46,
        fontFace: FONT,
        fontSize: 20,
        color: FOREST,
        margin: 0,
      })
    })
  }

  const footnote = rateExclusionFootnote(payload.totals.rateExcludedSpend ?? 0)
  if (footnote) {
    page.addText(
      footnote,
      {
        x: 0.55,
        y: 4.9,
        w: 12.2,
        h: 0.32,
        fontFace: FONT,
        fontSize: 11,
        color: MUTED,
        margin: 0,
      },
    )
  }
}

function heading(page: DrawSlide, text: string, colour = INK, box?: Anchor): void {
  const place = box ?? { x: 0.55, y: 0.36, w: 12.2, h: 1.05 }
  const sentence = withFullStop(text)
  page.addText(sentence, {
    ...place,
    fontFace: HEADING_FONT,
    fontSize: headingPointSize(sentence, place.w),
    color: colour,
    margin: 0,
    valign: "top",
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

export type BuildCampaignReportDeckOptions = {
  fetch?: typeof fetch
}

export async function buildCampaignReportDeck(
  payload: CampaignReportPayload,
  options?: BuildCampaignReportDeckOptions,
): Promise<Buffer> {
  const coverPhotoId = payload.coverPhotoId?.trim() ?? ""
  let coverBytes: Buffer | null = null
  if (coverPhotoId) {
    const fetched = await fetchBrandCoverPhoto(coverPhotoId, options?.fetch)
    if (fetched.ok) coverBytes = fetched.bytes
    else {
      console.error("[campaign-report] cover photo skipped", {
        coverPhotoId,
        reason: fetched.reason,
      })
    }
  }
  try {
    return await assembleCampaignReportDeck(payload, coverBytes)
  } catch (err) {
    if (!coverBytes) throw err
    console.error("[campaign-report] cover photo skipped", {
      coverPhotoId,
      reason: err instanceof Error ? err.message : String(err),
    })
    return assembleCampaignReportDeck(payload, null)
  }
}

async function assembleCampaignReportDeck(
  payload: CampaignReportPayload,
  coverBytes: Buffer | null,
): Promise<Buffer> {
  const filePath = templatePath()
  if (!fs.existsSync(filePath)) throw new Error(`v5 deck template missing at ${filePath}`)

  const layouts = await slidesByLayoutName(filePath)
  const client = safe(payload.clientName, "Client")
  const campaign = safe(payload.campaignName, payload.mbaNumber)
  const cover = requireRole(layouts, LAYOUT.cover)
  const closing = requireRole(layouts, LAYOUT.closing)
  const coverTitleBox = cover.title
  const coverDetailBox = cover.subtitle
  const closingTitleBox = closing.title
  if (!coverTitleBox || !coverDetailBox) throw new Error("v5 cover title placeholders missing")
  if (!closingTitleBox) throw new Error("v5 thank-you title placeholder missing")

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
  if (coverBytes) pres.loadMediaBuffer(COVER_MEDIA_FILE, coverBytes)

  const add = (layoutName: string, draw: (page: DrawSlide) => void) => {
    const role = requireRole(layouts, layoutName)
    pres.addSlide("v5", role.number, (slide) => {
      paint(
        slide,
        (page) => draw(role.dark ? onDarkGround(page) : page),
        (doc) => {
          if (role.dark) recolourTemplateInk(doc)
          if (layoutName === LAYOUT.table) removeEmptyLimePills(doc)
        },
      )
    })
  }

  pres.addSlide("v5", cover.number, (slide) => {
    paint(slide, (page) => {
      const ground = cover.dark ? onDarkGround(page) : page
      heading(ground, coverTitle(client, campaign), cover.dark ? WHITE : INK, coverTitleBox)
      ground.addText(
        [
          `MBA ${payload.mbaNumber}.`,
          `${payload.period.label}.`,
          `As of ${formatReportDate(payload.asOf)}.`,
        ].join("\n"),
        {
          ...coverDetailBox,
          fontFace: FONT,
          fontSize: 14,
          color: cover.dark ? WHITE : INK,
          margin: 0,
          valign: "top",
        },
      )
    }, (doc) => {
      if (cover.dark) recolourTemplateInk(doc)
    })
    if (coverBytes) {
      slide.modifyElement("Image 0", modify.setRelationTarget(COVER_MEDIA_FILE))
    }
  })

  add(LAYOUT.section, (page) => {
    heading(page, "Period summary.")
    page.addText(
      [
        `Period. ${payload.period.label}.`,
        `Window. ${formatReportDate(payload.period.current.startISO)} to ${formatReportDate(payload.period.current.endISO)}.`,
        `Spend vs plan. ${spendVsPlanLine(payload)}`,
        [
          `Delivery. Impressions ${formatReportInt(payload.totals.impressions)}. Clicks ${formatReportInt(payload.totals.clicks)}. Time elapsed ${pctLabel(payload.totals.timeElapsedPct)}.`,
          previousCompareLine(payload),
        ]
          .filter(Boolean)
          .join(" "),
        notYetLiveLine(payload.channels),
      ]
        .filter(Boolean)
        .join("\n\n"),
      {
        x: 0.55,
        y: 1.15,
        w: 12.2,
        h: 2.25,
        fontFace: FONT,
        fontSize: 16,
        color: INK,
        margin: 0,
      },
    )
    drawKeyMetrics(page, payload)
  })

  // Metric, Selected, Previous and Planned already span 12.2in. Extra columns
  // for CPM, CPC, CTR, spend pace and 3-second views do not fit, so those
  // figures are additional rows on the same table.
  console.info(
    "campaign-report deck: no room for key-metric columns on the per-channel table; CPM, CPC, CTR, spend pace and 3-second views are rows.",
  )

  for (const channel of payload.channels) {
    if (channelNotYetLive(channel)) continue
    const showPrevious = payload.period.previous != null
    const hasPrev = showPrevious && channel.previousSpend != null
    const bars: Bar[] = [
      { label: channel.spendEstimated ? "Estimated" : "Delivered", value: channel.spend, colour: HIGHLIGHT },
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
      const row = (metric: string, selected: string, previous: string, planned: string) => {
        const cells = [cell(metric), cell(selected)]
        if (showPrevious) cells.push(cell(previous))
        cells.push(cell(planned))
        return cells
      }
      const showViews =
        channel.metrics.videoViews3s != null ||
        channel.previousMetrics?.videoViews3s != null ||
        (channel.plannedViews != null && channel.plannedViews > 0)
      const showCpv =
        channel.metrics.cpv != null ||
        channel.previousMetrics?.cpv != null ||
        channel.planCpvTarget != null
      const rows = [
        (showPrevious
          ? ["Metric", "Selected", "Previous", "Planned"]
          : ["Metric", "Selected", "Planned"]
        ).map((label) => cell(label, true)),
        row(
          channel.spendEstimated ? "Estimated spend" : "Spend",
          formatReportMoney(channel.spend),
          channel.previousSpend == null ? "Not available" : formatReportMoney(channel.previousSpend),
          formatReportMoney(channel.plannedBudget),
        ),
        row(
          "Impressions",
          formatReportInt(channel.impressions),
          channel.previousImpressions == null
            ? "Not available"
            : formatReportInt(channel.previousImpressions),
          plannedCountLabel(channel.plannedImpressions),
        ),
        row("Clicks", formatReportInt(channel.clicks), "Not available", plannedCountLabel(channel.plannedClicks)),
        // With the client's switch on, chosen conversions replace platform results (CF5).
        ...(channel.conversions && payload.conversions
          ? deckConversionFigures(payload, channel.conversions).map((figure) =>
              row(figure.label, figure.value, "Not available", REPORT_FIGURE_DASH),
            )
          : [row("Results", formatReportInt(channel.results), "Not available", "Not available")]),
        row(
          "CPM",
          formatReportRate(channel.metrics.cpm),
          previousFigure(channel.previousMetrics, formatReportRate(channel.previousMetrics?.cpm ?? null)),
          REPORT_FIGURE_DASH,
        ),
        row(
          "CPC",
          formatReportRate(channel.metrics.cpc),
          previousFigure(channel.previousMetrics, formatReportRate(channel.previousMetrics?.cpc ?? null)),
          REPORT_FIGURE_DASH,
        ),
        row(
          "CTR",
          formatReportCtr(channel.metrics.ctr),
          previousFigure(channel.previousMetrics, formatReportCtr(channel.previousMetrics?.ctr ?? null)),
          REPORT_FIGURE_DASH,
        ),
        row(
          "Spend pace",
          formatReportPace(channel.metrics.spendPacePct),
          previousFigure(
            channel.previousMetrics,
            formatReportPace(channel.previousMetrics?.spendPacePct ?? null),
          ),
          REPORT_FIGURE_DASH,
        ),
        ...(showCpv
          ? [
              row(
                "CPV",
                formatReportRate(channel.metrics.cpv ?? null),
                previousFigure(
                  channel.previousMetrics,
                  formatReportRate(channel.previousMetrics?.cpv ?? null),
                ),
                // The channel's own plan CPV is the CPV target (KPI law).
                channel.planCpvTarget != null
                  ? planCpvTargetLabel(channel.planCpvTarget)
                  : REPORT_FIGURE_DASH,
              ),
            ]
          : []),
        ...(showViews
          ? [
              row(
                "3-second views",
                channel.metrics.videoViews3s == null
                  ? REPORT_FIGURE_DASH
                  : formatReportInt(channel.metrics.videoViews3s),
                previousFigure(
                  channel.previousMetrics,
                  channel.previousMetrics?.videoViews3s == null
                    ? REPORT_FIGURE_DASH
                    : formatReportInt(channel.previousMetrics.videoViews3s),
                ),
                plannedCountLabel(channel.plannedViews),
              ),
            ]
          : []),
      ]
      page.addTable(rows, {
        x: 0.55,
        y: 1.3,
        w: 12.2,
        colW: showPrevious ? [3, 3.1, 3.1, 3] : [4, 4.1, 4.1],
        rowH: 0.32,
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
        [
          "No digital delivery channels reported for this period.",
          previousCompareLine(payload),
        ]
          .filter(Boolean)
          .join(" "),
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
    .filter((kpi) => !kpi.omitted && !isBlankTargetDisplay(kpi.targetDisplay))
    .map((kpi) => `${kpi.label}. Target ${kpi.targetDisplay}, delivered ${kpi.actualDisplay ?? "No data yet"}.`)
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

  add(LAYOUT.closing, (page) => {
    heading(page, "Thank you.", WHITE, closingTitleBox)
  })

  const zip = await pres.getJSZip()
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })
}

export { campaignReportFilename } from "@/lib/reports/campaignReport/filename"
