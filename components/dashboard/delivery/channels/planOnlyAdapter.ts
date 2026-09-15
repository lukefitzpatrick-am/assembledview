import { formatMoney } from "@/lib/format/money"
import { deliveryLineItemDisplayName } from "@/lib/delivery/lineItemDisplayName"
import type { SocialLineItem } from "@/lib/delivery/social/socialChannelCompute"
import type { ChannelSectionData } from "./types"
import { channelMediaTypeColour } from "./channelMediaTypeColour"
import type { ProgressCardProps } from "../shared/ProgressCard"

const NO_DELIVERY_YET = "No delivery data yet"

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function burstPlanned(burst: Record<string, unknown>): number {
  const n = Number(
    burst.budget_number ?? burst.media_investment ?? burst.buy_amount_number ?? burst.mediaAmount ?? 0,
  )
  return Number.isFinite(n) ? n : 0
}

function plannedBudget(item: Record<string, unknown>): number {
  const burstsRaw = item.bursts ?? item.bursts_json
  let bursts: unknown[] = []
  if (Array.isArray(burstsRaw)) {
    bursts = burstsRaw
  } else if (typeof burstsRaw === "string") {
    try {
      const parsed = JSON.parse(burstsRaw)
      if (Array.isArray(parsed)) bursts = parsed
    } catch {
      bursts = []
    }
  }
  const fromBursts = bursts.reduce<number>((sum, burst) => sum + burstPlanned(asRecord(burst)), 0)
  if (fromBursts > 0) return fromBursts
  const fallback = Number(item.total_budget ?? 0)
  return Number.isFinite(fallback) ? fallback : 0
}

function noDataCard(title: string, value: string): ProgressCardProps {
  return {
    title,
    value,
    detail: NO_DELIVERY_YET,
    progress: 0,
    variance: 0,
    status: "no-data",
  }
}

/**
 * Plan-only remainder: classified social (and unmapped programmatic) lines
 * that have no live delivery adapter yet. Shows planned budget; never invents
 * delivery rows.
 */
export function buildPlanOnlyRemainderSection(input: {
  lineItems: unknown[]
  campaignStart: string
  campaignEnd: string
  lastSyncedAt: Date | null
}): ChannelSectionData | null {
  const items = (input.lineItems ?? []).filter(Boolean) as SocialLineItem[]
  if (items.length === 0) return null

  const emptyChart = {
    daily: [] as Array<Record<string, string | number>>,
    series: [],
    asAtDate: null as string | null,
  }

  const lineItems = items.map((item, index) => {
    const rec = item as Record<string, unknown>
    const planned = plannedBudget(rec)
    const { label, full } = deliveryLineItemDisplayName(rec)
    const id = String(item.line_item_id ?? rec.lineItemId ?? `plan-only-${index}`)
      .trim()
      .toLowerCase() || `plan-only-${index}`
    return {
      id,
      block: {
        name: label,
        fullName: full,
        platform: String(item.platform ?? rec.publisher ?? "").trim() || undefined,
        progressCards: [
          noDataCard("Planned budget", formatMoney(planned)),
          noDataCard("Delivery", "—"),
        ] as [ProgressCardProps, ProgressCardProps],
        kpiBand: { tiles: [] },
        chart: { kind: "daily-delivery" as const, ...emptyChart },
      },
    }
  })

  const plannedTotal = items.reduce((sum, item) => sum + plannedBudget(item as Record<string, unknown>), 0)

  return {
    key: "plan-only",
    title: "Awaiting delivery",
    dateRange: { startISO: input.campaignStart, endISO: input.campaignEnd },
    lastSyncedAt: input.lastSyncedAt,
    connections: [],
    mediaTypeColour: channelMediaTypeColour("plan-only"),
    aggregate: {
      summaryChips: [{ label: "Planned budget", value: formatMoney(plannedTotal) }],
      progressCards: [
        noDataCard("Planned budget", formatMoney(plannedTotal)),
        noDataCard("Delivery", "—"),
      ],
      kpiBand: { tiles: [] },
      chart: emptyChart,
    },
    lineItems,
  }
}
