import { channelMediaTypeColour } from "./channelMediaTypeColour"
import type { ChannelKey, ChannelSectionData } from "./types"
import type { ProgressCardProps } from "../shared/ProgressCard"
import { deliveryLineItemDisplayName } from "@/lib/delivery/lineItemDisplayName"
import {
  feePctForScheduleMedia,
  positiveVersionId,
  versionIdFromLine,
  type FeePctsByVersionId,
} from "@/lib/delivery/directDigitalFeeLookup"
import { formatMoney } from "@/lib/format/money"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { fromCents, toCents } from "@/lib/money/cents"
import { parseMoney } from "@/lib/money/parse"
import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
import { assumedDeliveryPacePct } from "@/lib/spend/assumedSpend"
import { assumeSpendForSnapshotLine } from "@/lib/spend/assumeSpendRule"
import { ASSUMED_SPEND_LABEL, assumedSpendForBurst } from "@/lib/spend/assumedSpend"

const ATL_FAMILIES = [
  { key: "television", sourceTable: "media_plan_television", mediaType: "Television" },
  { key: "radio", sourceTable: "media_plan_radio", mediaType: "Radio" },
  { key: "newspaper", sourceTable: "media_plan_newspaper", mediaType: "Newspaper" },
  { key: "magazines", sourceTable: "media_plan_magazines", mediaType: "Magazines" },
  { key: "ooh", sourceTable: "media_plan_ooh", mediaType: "OOH" },
  { key: "cinema", sourceTable: "media_plan_cinema", mediaType: "Cinema" },
] as const

const DIGITAL_SOURCE_BY_KEY: Record<string, { sourceTable: string; mediaType: string }> = {
  "digital-display": { sourceTable: "media_plan_digi_display", mediaType: "Digital Display" },
  "digital-video": { sourceTable: "media_plan_digi_video", mediaType: "Digital Video" },
  "digital-audio": { sourceTable: "media_plan_digi_audio", mediaType: "Digital Audio" },
  bvod: { sourceTable: "media_plan_digi_bvod", mediaType: "BVOD" },
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function parseBursts(raw: unknown): Record<string, unknown>[] {
  let list: unknown[] = []
  if (Array.isArray(raw)) list = raw
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) list = parsed
    } catch {
      list = []
    }
  }
  return list.map(asRecord)
}

function flag(value: unknown): boolean {
  return value === true || value === "true" || value === 1
}

function spendCard(assumed: number, media: number): ProgressCardProps {
  const progress = media > 0 ? Math.max(0, Math.min(1, assumed / media)) : 0
  const pct = media > 0 ? (assumed / media) * 100 : undefined
  const assumedText = formatMoney(assumed, { decimals: 0 })
  const mediaText = formatMoney(media, { decimals: 0 })
  return {
    title: ASSUMED_SPEND_LABEL,
    value: assumedText,
    detail: `${ASSUMED_SPEND_LABEL} ${assumedText} · Delivery media ${mediaText}`,
    progress,
    variance: pct == null ? 0 : (pct - 100) / 100,
    status: deliveryStatusFromPct(assumedDeliveryPacePct(assumed, assumed)),
  }
}

function mediaCard(media: number, progress: number): ProgressCardProps {
  const text = formatMoney(media, { decimals: 0 })
  return {
    title: "Delivery media",
    value: text,
    detail: `Delivery media ${text}`,
    progress,
    variance: 0,
    status: media > 0 ? "on-track" : "no-data",
  }
}

type AssumedLine = {
  id: string
  record: Record<string, unknown>
  assumed: number
  media: number
}

function lineFigures(item: Record<string, unknown>, asOfDate: string, feePct: number): {
  assumedCents: number
  media: number
} | null {
  const sourceTable = String(item.sourceTable ?? "")
  const bursts = parseBursts(item.bursts_json ?? item.bursts)
  const budgetIncludesFees = flag(item.budget_includes_fees ?? item.budgetIncludesFees)
  const clientPaysForMedia = flag(item.client_pays_for_media ?? item.clientPaysForMedia)
  const buyType = String(item.buy_type ?? item.buyType ?? "")
  let media = 0
  let assumedCents = 0
  for (const burst of bursts) {
    const rawBudget = parseMoney(burst.budget ?? burst.mediaAmount ?? burst.media_amount) ?? 0
    const startDate = String(burst.startDate ?? burst.start_date ?? "")
    const endDate = String(burst.endDate ?? burst.end_date ?? "")
    const amounts = computeBurstAmounts({
      rawBudget,
      budgetIncludesFees,
      clientPaysForMedia,
      feePct,
      buyType: String(burst.buy_type ?? burst.buyType ?? buyType),
    })
    if (!(amounts.deliveryMediaAmount > 0)) continue
    media += amounts.deliveryMediaAmount
    const days = assumedSpendForBurst({
      rawBudget,
      budgetIncludesFees,
      clientPaysForMedia,
      feePct,
      buyType: String(burst.buy_type ?? burst.buyType ?? buyType),
      startDate,
      endDate,
      asOfDate,
    })
    for (const day of days) assumedCents += day.cents
  }
  const deliveryMediaCents = toCents(media)
  const qualifies = assumeSpendForSnapshotLine({
    buyType,
    sourceTable,
    noAdserving: flag(item.no_adserving ?? item.noAdserving),
    publisher: item.publisher == null ? null : String(item.publisher),
    platform: item.platform == null ? null : String(item.platform),
    deliveryMediaCents,
  })
  if (!qualifies) return null
  return { assumedCents, media }
}

/**
 * One Assumed spend section. Progress is assumed-to-date ÷ delivery media.
 * No impressions, clicks, or CPM.
 */
export function buildAssumedSpendSection(input: {
  key: ChannelKey
  lineItems: unknown[]
  campaignStart: string
  campaignEnd: string
  lastSyncedAt: Date | null
  asOfDate: string
  feePctsByVersionId?: FeePctsByVersionId
  estimateVersionId?: number | null
  mediaType?: string
}): ChannelSectionData | null {
  const lines: AssumedLine[] = []
  for (const [index, raw] of input.lineItems.entries()) {
    const record = asRecord(raw)
    const versionId = versionIdFromLine(record) ?? positiveVersionId(input.estimateVersionId)
    const mediaType = String(record.mediaTypeLabel ?? input.mediaType ?? "")
    const feePct = mediaType
      ? feePctForScheduleMedia(input.feePctsByVersionId, versionId, mediaType)
      : 0
    const figures = lineFigures(record, input.asOfDate, feePct)
    if (!figures) continue
    const id =
      String(record.line_item_id ?? record.lineItemId ?? `assumed-${index}`)
        .trim()
        .toLowerCase() || `assumed-${index}`
    lines.push({
      id,
      record,
      assumed: fromCents(figures.assumedCents),
      media: figures.media,
    })
  }
  if (lines.length === 0) return null

  const assumedTotal = lines.reduce((sum, line) => sum + line.assumed, 0)
  const mediaTotal = lines.reduce((sum, line) => sum + line.media, 0)
  const spend = spendCard(assumedTotal, mediaTotal)
  const emptyChart = {
    daily: [] as Array<Record<string, string | number>>,
    series: [],
    asAtDate: input.asOfDate,
  }

  return {
    key: input.key,
    title: ASSUMED_SPEND_LABEL,
    dateRange: { startISO: input.campaignStart, endISO: input.campaignEnd },
    lastSyncedAt: input.lastSyncedAt,
    connections: [],
    mediaTypeColour: channelMediaTypeColour(input.key),
    aggregate: {
      summaryChips: [{ label: ASSUMED_SPEND_LABEL, value: formatMoney(assumedTotal, { decimals: 0 }) }],
      progressCards: [spend, mediaCard(mediaTotal, spend.progress)],
      kpiBand: { tiles: [] },
      chart: emptyChart,
    },
    lineItems: lines.map((line) => {
      const { label, full } = deliveryLineItemDisplayName(line.record)
      const card = spendCard(line.assumed, line.media)
      return {
        id: line.id,
        block: {
          name: label,
          fullName: full,
          platform: String(line.record.platform ?? line.record.publisher ?? "").trim() || undefined,
          progressCards: [card, mediaCard(line.media, card.progress)] as [
            ProgressCardProps,
            ProgressCardProps,
          ],
          kpiBand: { tiles: [] },
          chart: { kind: "daily-delivery" as const, ...emptyChart },
        },
      }
    }),
  }
}

/** Television, radio, newspaper, magazines, static OOH, and cinema, tagged with their source table. */
export function atlAssumedLineItems(lineItemsMap: Record<string, unknown> | null | undefined): unknown[] {
  if (!lineItemsMap) return []
  const out: unknown[] = []
  for (const family of ATL_FAMILIES) {
    const items = lineItemsMap[family.key]
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!item || typeof item !== "object") continue
      out.push({
        ...(item as Record<string, unknown>),
        sourceTable: family.sourceTable,
        mediaTypeLabel: family.mediaType,
      })
    }
  }
  return out
}

export function digitalAssumedSource(key: ChannelKey): { sourceTable: string; mediaType: string } | null {
  return DIGITAL_SOURCE_BY_KEY[key] ?? null
}
