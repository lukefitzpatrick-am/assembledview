import fs from "fs"

const SRC = "components/dashboard/delivery/social/SocialDeliveryContainer.tsx"
const OUT = "lib/delivery/social/socialChannelCompute.ts"
const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/)
/** Inclusive 1-based line range [a, b]. */
const slice = (a, b) => lines.slice(a - 1, b).join("\n")

const header = `/**
 * Pure social delivery metric helpers extracted from SocialDeliveryContainer.
 */
import type { Burst, ActualsDaily } from "@/lib/pacing/mockMetaPacing"
import { mapDeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric"
import type { PacingResult } from "@/lib/pacing/calcPacing"
import { getDeliverableKey } from "@/lib/pacing/calcPacing"
import { MetaPacingRow, normalisePlatform, summariseDelivery } from "@/lib/pacing/social/metaPacing"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import { getMelbourneTodayISO, getPacingWindow } from "@/lib/pacing/pacingWindow"
import type { KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import {
  buildCumulativeTargetCurve,
  buildCumulativeActualSeries,
  evaluateOnTrack,
  type TargetCurveLineItem,
  type TargetCurvePoint,
  type OnTrackStatus,
} from "@/lib/kpi/deliveryTargetCurve"
import { clipDateRangeToCampaign, filterDailySeriesByRange, parseDateOnly, type DateRange } from "@/lib/dashboard/dateFilter"
`

const exportedSocialLineItem = slice(78, 90).replace("type SocialLineItem", "export type SocialLineItem")

const exportedMetricsType =
  "export type SocialLineMetrics = " +
  slice(110, 126)
    .replace(/^type LineItemMetrics = \{/m, "{\n  ")
    .replace(/\n\}$/, "\n}")

const utilsA = slice(131, 152)
const mapCombined = slice(164, 179).replace("function mapCombinedRowToMeta", "export function mapCombinedRowToMeta")
const classifyPlat = slice(181, 196)
const dateUtils = slice(198, 392)
const burstMoney = slice(392, 826)
const summarizeActualsFn = slice(1131, 1164)

const extractLineItemIdFn = `function extractLineItemId(item: SocialLineItem): string | null {
  const id = item.line_item_id ?? (item as any).lineItemId ?? (item as any).LINE_ITEM_ID
  return cleanId(id)
}
`

let memoInner = slice(1706, 1945)
memoInner = memoInner.replace(/\n      if \(DEBUG_PACING[\s\S]*?\n      \}\n/, "\n")

const computeFn = `export function computeSocialLineMetricsForPlatform(input: {
  activeItems: SocialLineItem[]
  socialRows: MetaPacingRow[]
  campaignStart: string
  campaignEnd: string
  mbaNumber: string
  kpiTargets: KPITargetsMap | undefined
  filterRange: DateRange
  pacingWindow: ReturnType<typeof getPacingWindow>
}): SocialLineMetrics[] {
  const { activeItems, socialRows, campaignStart, campaignEnd, mbaNumber, kpiTargets, filterRange, pacingWindow } =
    input
  const resolvedCampaignStart = campaignStart
  const resolvedCampaignEnd = campaignEnd
${memoInner.replace(/^  /, "  ")}
}
`

const aggregateFns = `
export function buildSocialAggregatePacing(
  lineItemMetrics: SocialLineMetrics[],
  asAtISO: string | undefined,
  campaignStartISO: string,
  campaignEndISO: string,
  filterRange?: DateRange,
): SocialLineMetrics["pacing"] {
  return buildAggregatedMetrics(lineItemMetrics, asAtISO, campaignStartISO, campaignEndISO, filterRange)
}

export function buildSocialAggregateTargetCurve(
  lineItemMetrics: SocialLineMetrics[],
  kpiTargets: KPITargetsMap | undefined,
  pacingWindow: ReturnType<typeof getPacingWindow>,
  filterRange: DateRange,
  campaignStart: string,
  campaignEnd: string,
): TargetCurvePoint[] {
  if (!kpiTargets || kpiTargets.size === 0) return []
  if (!lineItemMetrics.length) return []
  if (!pacingWindow.campaignStartISO || !pacingWindow.campaignEndISO) return []

  const tclis: TargetCurveLineItem[] = []
  for (const metric of lineItemMetrics) {
    if (!metric.targetMetric) continue
    const tcli = buildSocialTargetCurveLineItem(metric.lineItem, metric.bursts)
    if (tcli) tclis.push(tcli)
  }
  if (!tclis.length) return []

  const metrics = new Set(lineItemMetrics.map((m) => m.targetMetric).filter(Boolean))
  if (metrics.size !== 1) return []
  const sharedMetric = Array.from(metrics)[0] as "clicks" | "views"

  let curve = buildCumulativeTargetCurve({
    campaignStartISO: pacingWindow.campaignStartISO,
    campaignEndISO: pacingWindow.campaignEndISO,
    lineItems: tclis,
    kpiTargets,
    metric: sharedMetric,
    tolerance: 0.15,
  })
  const clipped = clipDateRangeToCampaign(filterRange, campaignStart, campaignEnd)
  if (clipped?.start && clipped?.end && curve.length) {
    const rs = clipped.start
    const re = clipped.end
    curve = curve.filter((p) => {
      const d = parseDateOnly(p.date)
      if (!d) return true
      return d >= rs && d <= re
    })
  }
  return curve
}

export function buildSocialAggregateCumulativeActual(
  aggregateTargetCurve: TargetCurvePoint[],
  aggregatePacing: SocialLineMetrics["pacing"],
): Array<{ date: string; actual: number }> {
  if (!aggregateTargetCurve.length) return []
  const dailyByDate = new Map<string, number>()
  for (const row of aggregatePacing.series) {
    const prev = dailyByDate.get(String(row.date)) ?? 0
    dailyByDate.set(String(row.date), prev + Math.max(0, Number(row.actualDeliverable ?? 0) || 0))
  }
  return buildCumulativeActualSeries(
    aggregateTargetCurve.map((p) => p.date),
    dailyByDate,
  )
}

export function socialAggregateOnTrackStatus(
  aggregateTargetCurve: TargetCurvePoint[],
  aggregateCumulativeActual: Array<{ date: string; actual: number }>,
  aggregatePacing: SocialLineMetrics["pacing"],
): OnTrackStatus {
  if (!aggregateTargetCurve.length) return "no-data"
  const cumActualByDate = new Map(aggregateCumulativeActual.map((r) => [r.date, r.actual]))
  const asAt = aggregatePacing.asAtDate ?? getMelbourneTodayISO()
  return evaluateOnTrack(aggregateTargetCurve, cumActualByDate, asAt)
}
`

const body = [
  header,
  exportedSocialLineItem,
  exportedMetricsType,
  utilsA,
  mapCombined,
  classifyPlat,
  dateUtils,
  burstMoney,
  summarizeActualsFn,
  extractLineItemIdFn,
  computeFn.replace(/LineItemMetrics/g, "SocialLineMetrics"),
  aggregateFns,
].join("\n\n")

fs.mkdirSync("lib/delivery/social", { recursive: true })
fs.writeFileSync(OUT, body)
console.log("wrote", OUT)
