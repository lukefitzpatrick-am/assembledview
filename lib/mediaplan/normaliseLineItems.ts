import { resolveChannel } from "./channelMap"
import { NormalisedBurst, normaliseBurst, parseBurstArray } from "./deriveBursts"

export type NormalisedLineItem = {
  id: string
  name: string
  channel: string
  publisher?: string
  buyType?: string
  budget: number
  unitCost?: number
  deliverableTotal?: number
  deliverableLabel?: string
  bursts: NormalisedBurst[]
}

function toNumber(value: any): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "")
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function inferDeliverableLabel(item: any) {
  if (item?.deliverable_label) return String(item.deliverable_label)
  if (item?.deliverableLabel) return String(item.deliverableLabel)
  if (item?.impressions) return "Impressions"
  if (item?.views) return "Views"
  if (item?.spots) return "Spots"
  if (item?.planned_units || item?.plannedUnits) return "Units"
  if (item?.deliverables) return "Deliverables"
  return undefined
}

function ensureBurstArray(item: any, campaignStart?: string, campaignEnd?: string) {
  const rawBursts =
    item?.bursts ??
    item?.burst_schedule ??
    item?.burstSchedule ??
    item?.flights ??
    item?.flight_schedule ??
    item?.flightSchedule ??
    item?.burstScheduleJson

  const fallbackStart = item?.start_date ?? item?.startDate ?? item?.start ?? campaignStart ?? null
  const fallbackEnd = item?.end_date ?? item?.endDate ?? item?.end ?? campaignEnd ?? null

  const parsed = parseBurstArray(rawBursts)
  if (!parsed.length && (fallbackStart || fallbackEnd)) {
    return [{ start: fallbackStart, end: fallbackEnd }]
  }
  return parsed
}

export function normaliseLineItems(
  lineItemsByContainer: Record<string, any[]>,
  campaignStart?: string,
  campaignEnd?: string
): NormalisedLineItem[] {
  const output: NormalisedLineItem[] = []

  Object.entries(lineItemsByContainer || {}).forEach(([containerKey, items]) => {
    if (!Array.isArray(items)) return
    const channel = resolveChannel(containerKey)

    items.forEach((item, idx) => {
      const id = String(item?.line_item_id ?? item?.id ?? item?.lineItemId ?? `${containerKey}-${idx}`)
      const name =
        item?.line_item_name ??
        item?.name ??
        item?.lineItemName ??
        item?.placement ??
        item?.publisher ??
        `Line item ${idx + 1}`

      const unitCost =
        toNumber(item?.unit_cost ?? item?.unitCost ?? item?.cpm ?? item?.cpv ?? item?.cpc ?? item?.unit_cost_amount) ??
        undefined

      const budget =
        toNumber(
          item?.media_investment ??
            item?.budget ??
            item?.total_budget ??
            item?.totalMedia ??
            item?.grossMedia ??
            item?.investment
        ) ?? 0

      const deliverableTotalCandidate = toNumber(
        item?.deliverables ?? item?.impressions ?? item?.views ?? item?.spots ?? item?.planned_units ?? item?.plannedUnits
      )
      const deliverableLabel = inferDeliverableLabel(item)

      const rawBursts = ensureBurstArray(item, campaignStart, campaignEnd)

      const bursts: NormalisedBurst[] = rawBursts
        .map((raw, burstIdx) =>
          normaliseBurst(
            raw,
            id,
            burstIdx,
            item?.start_date ?? item?.startDate ?? campaignStart,
            item?.end_date ?? item?.endDate ?? campaignEnd
          )
        )
        .filter(Boolean) as NormalisedBurst[]

      if (!bursts.length) {
        const fallbackBurst = normaliseBurst(
          { start: item?.start_date ?? item?.startDate ?? campaignStart, end: item?.end_date ?? item?.endDate ?? campaignEnd },
          id,
          0,
          item?.start_date ?? item?.startDate ?? campaignStart,
          item?.end_date ?? item?.endDate ?? campaignEnd
        )
        if (fallbackBurst) bursts.push(fallbackBurst)
      }

      if (!bursts.length) return

      const deliverableSumFromBursts = bursts.reduce((sum, burst) => sum + (burst.deliverables ?? 0), 0)
      const deliverableTotal = deliverableTotalCandidate ?? (deliverableSumFromBursts > 0 ? deliverableSumFromBursts : undefined)

      output.push({
        id,
        name,
        channel,
        publisher: item?.publisher ?? item?.market,
        buyType: item?.buy_type ?? item?.buyType,
        budget,
        unitCost,
        deliverableTotal,
        deliverableLabel,
        bursts,
      })
    })
  })

  return output
}
