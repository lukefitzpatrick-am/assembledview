import {
  feePctForScheduleMedia,
  positiveVersionId,
  versionIdFromLine,
  type FeePctsByVersionId,
} from "@/lib/delivery/directDigitalFeeLookup"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { toCents } from "@/lib/money/cents"
import { parseMoney } from "@/lib/money/parse"
import { extractPacingLineItemIdFromItem } from "@/lib/pacing/delivery/lineItemIds"
import { isAssumedSpendLine } from "@/lib/spend/assumeSpendRule"
import { scheduleKeyForLineItemId } from "@/lib/spend/channelExpectedToDate"
import {
  isAssumedValueAddBuyType,
  type AssumedExpectedBurst,
  type AssumedExpectedLine,
} from "@/lib/spend/assumedSpend"

const CHANNEL_META: Record<string, { sourceTable: string; scheduleKey: string; mediaLabel: string }> = {
  television: { sourceTable: "media_plan_television", scheduleKey: "television", mediaLabel: "Television" },
  radio: { sourceTable: "media_plan_radio", scheduleKey: "radio", mediaLabel: "Radio" },
  newspaper: { sourceTable: "media_plan_newspaper", scheduleKey: "newspaper", mediaLabel: "Newspaper" },
  magazines: { sourceTable: "media_plan_magazines", scheduleKey: "magazines", mediaLabel: "Magazines" },
  ooh: { sourceTable: "media_plan_ooh", scheduleKey: "ooh", mediaLabel: "OOH" },
  cinema: { sourceTable: "media_plan_cinema", scheduleKey: "cinema", mediaLabel: "Cinema" },
  digi_display: { sourceTable: "media_plan_digi_display", scheduleKey: "digital-display", mediaLabel: "Digital Display" },
  digi_video: { sourceTable: "media_plan_digi_video", scheduleKey: "digital-video", mediaLabel: "Digital Video" },
  digi_audio: { sourceTable: "media_plan_digi_audio", scheduleKey: "digital-audio", mediaLabel: "Digital Audio" },
  digi_bvod: { sourceTable: "media_plan_digi_bvod", scheduleKey: "bvod", mediaLabel: "BVOD" },
  prog_display: { sourceTable: "media_plan_prog_display", scheduleKey: "programmatic-display", mediaLabel: "Programmatic Display" },
  prog_video: { sourceTable: "media_plan_prog_video", scheduleKey: "programmatic-video", mediaLabel: "Programmatic Video" },
  prog_audio: { sourceTable: "media_plan_prog_audio", scheduleKey: "programmatic-audio", mediaLabel: "Programmatic Audio" },
  prog_bvod: { sourceTable: "media_plan_prog_bvod", scheduleKey: "programmatic-bvod", mediaLabel: "Programmatic BVOD" },
  prog_ooh: { sourceTable: "media_plan_prog_ooh", scheduleKey: "programmatic-ooh", mediaLabel: "Programmatic OOH" },
}

const BY_SOURCE = new Map(Object.values(CHANNEL_META).map((meta) => [meta.sourceTable, meta]))
const BY_SCHEDULE = new Map(Object.values(CHANNEL_META).map((meta) => [meta.scheduleKey, meta]))

export type AssumedLineFields = {
  id: string
  buyType: string | null
  sourceTable: string
  noAdserving: boolean
  publisher: string | null
  platform: string | null
  budgetIncludesFees: boolean
  clientPaysForMedia: boolean
  feePct: number
  bursts: readonly AssumedExpectedBurst[]
}

export function channelMetaForKey(key: string | null | undefined): {
  sourceTable: string
  scheduleKey: string
  mediaLabel: string
} | null {
  if (!key) return null
  const trimmed = key.trim()
  return CHANNEL_META[trimmed] ?? BY_SOURCE.get(trimmed) ?? BY_SCHEDULE.get(trimmed) ?? null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function flag(value: unknown): boolean {
  return value === true || value === "true" || value === 1
}

function parseBursts(raw: unknown, feePct: number, budgetIncludesFees: boolean, clientPaysForMedia: boolean, buyType: string | null): AssumedExpectedBurst[] {
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
  const bursts: AssumedExpectedBurst[] = []
  for (const row of list) {
    const burst = asRecord(row)
    const startDate = formatBurstDateLocal(String(burst.startDate ?? burst.start_date ?? ""))
    const endDate = formatBurstDateLocal(String(burst.endDate ?? burst.end_date ?? ""))
    if (!startDate || !endDate) continue
    const rawBudget = parseMoney(burst.budget ?? burst.mediaAmount ?? burst.media_amount) ?? 0
    bursts.push({
      rawBudget,
      budgetIncludesFees,
      clientPaysForMedia,
      feePct,
      buyType: asString(burst.buy_type) ?? asString(burst.buyType) ?? buyType ?? undefined,
      startDate,
      endDate,
    })
  }
  return bursts
}

export function assumedExpectedLineFromFields(
  fields: AssumedLineFields,
  scheduleKey: string,
  deliveryPresence = false,
): AssumedExpectedLine | null {
  if (isAssumedValueAddBuyType(fields.buyType)) return null
  let planned = 0
  for (const burst of fields.bursts) {
    const amounts = computeBurstAmounts({
      rawBudget: burst.rawBudget,
      budgetIncludesFees: burst.budgetIncludesFees,
      clientPaysForMedia: burst.clientPaysForMedia,
      feePct: burst.feePct,
      buyType: burst.buyType ?? fields.buyType ?? undefined,
    })
    if (amounts.deliveryMediaAmount > 0) planned += amounts.deliveryMediaAmount
  }
  const deliveryMediaCents = toCents(planned)
  if (
    !isAssumedSpendLine(
      {
        buyType: fields.buyType,
        sourceTable: fields.sourceTable,
        noAdserving: fields.noAdserving,
        publisher: fields.publisher,
        platform: fields.platform,
        deliveryMediaCents,
      },
      deliveryPresence,
    )
  ) {
    return null
  }
  return {
    id: fields.id,
    scheduleKey,
    plannedMedia: planned,
    buyType: fields.buyType,
    bursts: fields.bursts,
  }
}

export function assumedExpectedLineFromItem(args: {
  item: unknown
  sourceTable: string
  scheduleKey: string
  mediaLabel: string
  feePcts?: FeePctsByVersionId
  fallbackVersionId?: number | null
  deliveryPresence?: boolean
}): AssumedExpectedLine | null {
  const rec = asRecord(args.item)
  const id = extractPacingLineItemIdFromItem(rec)
  if (!id) return null
  const buyType = asString(rec.buy_type) ?? asString(rec.buyType)
  const versionId = versionIdFromLine(rec) ?? positiveVersionId(args.fallbackVersionId)
  const feePct = feePctForScheduleMedia(args.feePcts, versionId, args.mediaLabel)
  const budgetIncludesFees = flag(rec.budget_includes_fees) || flag(rec.budgetIncludesFees)
  const clientPaysForMedia = flag(rec.client_pays_for_media) || flag(rec.clientPaysForMedia)
  return assumedExpectedLineFromFields(
    {
      id,
      buyType,
      sourceTable: args.sourceTable,
      noAdserving: flag(rec.no_adserving) || flag(rec.noAdserving),
      publisher: asString(rec.publisher),
      platform: asString(rec.platform),
      budgetIncludesFees,
      clientPaysForMedia,
      feePct,
      bursts: parseBursts(rec.bursts_json ?? rec.bursts, feePct, budgetIncludesFees, clientPaysForMedia, buyType),
    },
    args.scheduleKey,
    args.deliveryPresence === true,
  )
}

function lineHasDelivery(id: string, deliveryLineIds?: ReadonlySet<string>): boolean {
  if (!deliveryLineIds || deliveryLineIds.size === 0) return false
  return deliveryLineIds.has(id.trim().toLowerCase())
}

const DIGITAL_BUCKETS: Array<{ field: string; scheduleKey: string }> = [
  { field: "digitalDisplayLineItems", scheduleKey: "digital-display" },
  { field: "digitalVideoLineItems", scheduleKey: "digital-video" },
  { field: "digitalAudioLineItems", scheduleKey: "digital-audio" },
  { field: "bvodLineItems", scheduleKey: "bvod" },
  { field: "progDisplayLineItems", scheduleKey: "programmatic-display" },
  { field: "progVideoLineItems", scheduleKey: "programmatic-video" },
  { field: "progOohLineItems", scheduleKey: "programmatic-ooh" },
]

export function assumedExpectedLinesFromLineItemMap(
  map: Record<string, unknown[] | undefined> | null | undefined,
  feePcts?: FeePctsByVersionId,
  fallbackVersionId?: number | null,
  deliveryLineIds?: ReadonlySet<string>,
): AssumedExpectedLine[] {
  const lines: AssumedExpectedLine[] = []
  const seen = new Set<string>()
  for (const [key, items] of Object.entries(map ?? {})) {
    const meta = channelMetaForKey(key)
    if (!meta || !Array.isArray(items)) continue
    for (const item of items) {
      const line = assumedExpectedLineFromItem({
        item,
        sourceTable: meta.sourceTable,
        scheduleKey: meta.scheduleKey,
        mediaLabel: meta.mediaLabel,
        feePcts,
        fallbackVersionId,
        deliveryPresence: lineHasDelivery(
          extractPacingLineItemIdFromItem(item) ?? "",
          deliveryLineIds,
        ),
      })
      if (!line) continue
      const id = line.id.trim().toLowerCase()
      if (seen.has(id)) continue
      seen.add(id)
      lines.push(line)
    }
  }
  return lines
}

export function assumedExpectedLinesForDelivery(args: {
  atlLineItems?: unknown[]
  digitalDisplayLineItems?: unknown[]
  digitalVideoLineItems?: unknown[]
  digitalAudioLineItems?: unknown[]
  bvodLineItems?: unknown[]
  progDisplayLineItems?: unknown[]
  progVideoLineItems?: unknown[]
  progOohLineItems?: unknown[]
  feePctsByVersionId?: FeePctsByVersionId
  estimateVersionId?: number | null
  deliveryLineIds?: ReadonlySet<string>
}): AssumedExpectedLine[] {
  const lines: AssumedExpectedLine[] = []
  const seen = new Set<string>()
  const push = (line: AssumedExpectedLine | null) => {
    if (!line) return
    const id = line.id.trim().toLowerCase()
    if (seen.has(id)) return
    seen.add(id)
    lines.push(line)
  }
  for (const item of args.atlLineItems ?? []) {
    const id = extractPacingLineItemIdFromItem(item)
    const fromId = id ? scheduleKeyFromLineId(id) : null
    if (!fromId) continue
    push(
      assumedExpectedLineFromItem({
        item,
        sourceTable: fromId.sourceTable,
        scheduleKey: fromId.scheduleKey,
        mediaLabel: fromId.mediaLabel,
        feePcts: args.feePctsByVersionId,
        fallbackVersionId: args.estimateVersionId,
        deliveryPresence: lineHasDelivery(id ?? "", args.deliveryLineIds),
      }),
    )
  }
  const buckets = args as Record<string, unknown>
  for (const bucket of DIGITAL_BUCKETS) {
    const meta = BY_SCHEDULE.get(bucket.scheduleKey)
    if (!meta) continue
    const items = buckets[bucket.field]
    if (!Array.isArray(items)) continue
    for (const item of items) {
      push(
        assumedExpectedLineFromItem({
          item,
          sourceTable: meta.sourceTable,
          scheduleKey: meta.scheduleKey,
          mediaLabel: meta.mediaLabel,
          feePcts: args.feePctsByVersionId,
          fallbackVersionId: args.estimateVersionId,
          deliveryPresence: lineHasDelivery(
            extractPacingLineItemIdFromItem(item) ?? "",
            args.deliveryLineIds,
          ),
        }),
      )
    }
  }
  return lines
}

function scheduleKeyFromLineId(lineItemId: string): {
  sourceTable: string
  scheduleKey: string
  mediaLabel: string
} | null {
  const key = scheduleKeyForLineItemId(lineItemId)
  return key ? (BY_SCHEDULE.get(key) ?? null) : null
}
