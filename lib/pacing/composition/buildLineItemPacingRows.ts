import { computePacing, getAsOfDate } from "@/lib/pacing/maths"
import type { PlannedLineItem } from "@/lib/pacing/plan/normalisePlan"
import { getBurstBounds } from "@/lib/pacing/plan/normalisePlan"
import type { DailyRow } from "@/lib/snowflake/portfolio-pacing-service"
import type { LineItemPacingRow } from "@/lib/xano/pacing-types"

export type BuildLineItemPacingRowsInput = {
  plannedLineItems: PlannedLineItem[]
  dailyRows: DailyRow[]
  /** Map plan `clientSlug` → Xano `get_clients.id` for `clients_id` on rows. */
  clientIdByPlanSlug: ReadonlyMap<string, number>
  asOfDate?: string
  /** Invoked once per Snowflake line id that has delivery but no matching planned line item. */
  onOrphanDelivery?: (lineItemId: string) => void
}

export type DeliveryRollup = {
  spendToDate: number
  spendYesterday: number
  impressionsToDate: number
  clicksToDate: number
  conversionsToDate: number
  revenueToDate: number
}

function channelGroupToMediaType(channelGroup: PlannedLineItem["channelGroup"]): string {
  switch (channelGroup) {
    case "social":
      return "social"
    case "search":
      return "search"
    case "prog_display":
      return "display"
    case "prog_video":
      return "bvod"
    default:
      return "display"
  }
}

/** Exported for unit tests (spendYesterday = spend on latest delivery date). */
export function rollupDailyByLineItem(dailyRows: DailyRow[]): Map<string, DeliveryRollup> {
  type Agg = {
    spend: number
    impressions: number
    clicks: number
    conversions: number
    results: number
    revenue: number
    /** date -> spend that day */
    spendByDate: Map<string, number>
  }

  const byLine = new Map<string, Agg>()
  for (const row of dailyRows) {
    const id = String(row.lineItemId ?? "").trim().toLowerCase()
    if (!id) continue
    let agg =
      byLine.get(id) ??
      ({
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        results: 0,
        revenue: 0,
        spendByDate: new Map<string, number>(),
      } satisfies Agg)
    agg.spend += row.amountSpent
    agg.impressions += row.impressions
    agg.clicks += row.clicks
    agg.conversions += row.conversions
    agg.results += row.results
    agg.revenue += row.revenue
    const d = String(row.date ?? "").slice(0, 10)
    if (d) {
      agg.spendByDate.set(d, (agg.spendByDate.get(d) ?? 0) + row.amountSpent)
    }
    byLine.set(id, agg)
  }

  const out = new Map<string, DeliveryRollup>()
  for (const [lineItemId, agg] of byLine) {
    let maxDate = ""
    for (const d of agg.spendByDate.keys()) {
      if (d > maxDate) maxDate = d
    }
    const spendYesterday = maxDate ? (agg.spendByDate.get(maxDate) ?? 0) : 0
    out.set(lineItemId, {
      spendToDate: agg.spend,
      spendYesterday,
      impressionsToDate: agg.impressions,
      clicksToDate: agg.clicks,
      conversionsToDate: agg.conversions + agg.results,
      revenueToDate: agg.revenue,
    })
  }
  return out
}

function inferDeliveryHealth(
  spendYesterday: number,
  pacingStatus: string
): LineItemPacingRow["delivery_health"] {
  if (spendYesterday > 0) return "spending"
  if (pacingStatus === "no_delivery" || pacingStatus === "not_started") return "no_delivery"
  return "no_recent_delivery"
}

function pacingStatusForRow(status: string): string {
  if (status === "unknown") return "not_started"
  return status
}

/**
 * Groups daily Snowflake rows by line item, joins to planned line items, runs {@link computePacing}
 * per pair, and returns rows compatible with `/api/pacing/line-items` consumers.
 */
export function buildLineItemPacingRows(input: BuildLineItemPacingRowsInput): LineItemPacingRow[] {
  const deliveryByLine = rollupDailyByLineItem(input.dailyRows)
  const plannedIds = new Set(input.plannedLineItems.map((li) => li.lineItemId))

  for (const id of deliveryByLine.keys()) {
    if (!plannedIds.has(id)) {
      input.onOrphanDelivery?.(id)
    }
  }

  const rows: LineItemPacingRow[] = []

  for (const li of input.plannedLineItems) {
    const id = li.lineItemId
    const del = deliveryByLine.get(id)
    const spendToDate = del?.spendToDate ?? 0
    const spendYesterday = del?.spendYesterday ?? 0
    const impressionsToDate = del?.impressionsToDate ?? 0
    const clicksToDate = del?.clicksToDate ?? 0
    const conversionsToDate = del?.conversionsToDate ?? 0
    const revenueToDate = del?.revenueToDate ?? 0

    const bounds = getBurstBounds(li.bursts)
    const asOf = input.asOfDate ?? getAsOfDate()
    const startDate = bounds.startDate ?? asOf
    const endDate = bounds.endDate ?? asOf

    const pacing = computePacing({
      lineItemBudget: li.totalBudgetNumber,
      startDate,
      endDate,
      spendToDate,
      spendYesterday,
      impressionsToDate,
      clicksToDate,
      conversionsToDate,
      revenueToDate,
      asOfDate: input.asOfDate,
    })

    const expectedSpend = pacing.expectedSpend
    const pacingRatio =
      expectedSpend > 0 && Number.isFinite(expectedSpend) ? spendToDate / expectedSpend : null

    const pacingStatus = pacingStatusForRow(pacing.status)
    const clientsId = input.clientIdByPlanSlug.get(li.clientSlug) ?? 0

    const labelParts = [li.platform, li.buyType].filter((s) => s && s !== "—")
    const avLineItemLabel = labelParts.length ? labelParts.join(" · ") : null

    rows.push({
      clients_id: clientsId,
      media_plan_id: null,
      av_line_item_id: id,
      av_line_item_label: avLineItemLabel,
      mba_number: li.mbaNumber,
      campaign_name: li.campaignName || null,
      media_type: channelGroupToMediaType(li.channelGroup),
      platform: li.platform || null,
      pacing_status: pacingStatus,
      delivery_health: inferDeliveryHealth(spendYesterday, pacingStatus),
      budget_amount: li.totalBudgetNumber,
      spend_amount: spendToDate,
      pacing_ratio: pacingRatio,
      expected_spend: expectedSpend,
      start_date: bounds.startDate,
      end_date: bounds.endDate,
    })
  }

  return rows
}
