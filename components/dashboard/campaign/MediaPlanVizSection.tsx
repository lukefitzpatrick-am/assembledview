import { MediaPlanViz, MediaPlanVizGroup, MediaPlanVizRow } from "@/components/dashboard/pacing/MediaPlanViz"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sortChannels } from "@/lib/mediaplan/channelMap"
import { parseBurstArray } from "@/lib/mediaplan/deriveBursts"

export type MediaPlanVizSectionProps = {
  lineItems: Record<string, any[]>
  campaignStart?: string
  campaignEnd?: string
  clientSlug?: string
  mbaNumber?: string
}

const MEDIA_ORDER = [
  "television",
  "bvod",
  "digitalVideo",
  "digitalDisplay",
  "digitalAudio",
  "progVideo",
  "progDisplay",
  "progBvod",
  "progAudio",
  "progOoh",
  "socialMedia",
  "search",
  "radio",
  "ooh",
  "cinema",
  "newspaper",
  "magazines",
  "integration",
  "influencers",
  "production",
  "consulting",
]

function parseDateSafe(value?: string | Date | null) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatCompactNumber(value?: number) {
  if (value === null || value === undefined) return undefined
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function formatCurrency(value?: number) {
  if (value === undefined || value === null) return undefined
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value)
}

function parseNumeric(value: any): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "")
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function parseBursts(item: any) {
  const raw =
    item?.bursts_json ??
    item?.bursts ??
    item?.burst_schedule ??
    item?.flight_schedule ??
    item?.burstSchedule ??
    item?.flightSchedule ??
    item?.flights

  const parsed = parseBurstArray(raw)
  if (parsed.length) return parsed

  // Fallback: single burst from start/end when provided
  const start = item?.start_date || item?.startDate
  const end = item?.end_date || item?.endDate || start
  if (start || end) {
    return [
      {
        start_date: start,
        end_date: end,
        budget:
          parseNumeric(item?.budget) ||
          parseNumeric(item?.buyAmount) ||
          parseNumeric(item?.totalMedia) ||
          parseNumeric(item?.grossMedia),
      },
    ]
  }

  return []
}

function deriveTitle(mediaType: string, item: any, fallbackIndex: number) {
  const rawName =
    item?.line_item_name ||
    item?.name ||
    item?.lineItemName ||
    item?.campaign_name ||
    item?.ad_set_name

  const platform = item?.platform || item?.site || item?.publisher || item?.network || item?.channel
  const placement = item?.placement || item?.placement_name
  const audience = item?.targeting || item?.audience || item?.segment
  const creative = item?.creative || item?.ad_name
  const channel = item?.channel || item?.market || item?.region

  const parts = [platform, placement, audience, creative, channel].filter(Boolean)
  const composed = parts.length ? parts.join(" • ") : null

  const isAutoName = rawName && /auto\s*allocation/i.test(rawName)

  if (rawName && !isAutoName) return rawName
  if (composed) return composed

  return `Line item ${fallbackIndex + 1}`
}

function buildSubtitle(item: any) {
  const parts: string[] = []

  const platform = item?.platform || item?.site || item?.publisher || item?.network || item?.channel
  const placement = item?.placement || item?.placement_name
  const targeting = item?.targeting || item?.audience || item?.segment
  const geo = item?.market || item?.dma || item?.region
  const creative = item?.creative || item?.ad_name
  const buyType = item?.buy_type || item?.buyType || item?.channel

  const rate =
    parseNumeric(item?.unit_cost) ||
    parseNumeric(item?.unitCost) ||
    parseNumeric(item?.cpm) ||
    parseNumeric(item?.cpc) ||
    parseNumeric(item?.cpv) ||
    parseNumeric(item?.rate)

  const deliverableValue =
    parseNumeric(item?.deliverables) ||
    parseNumeric(item?.impressions) ||
    parseNumeric(item?.clicks) ||
    parseNumeric(item?.spots) ||
    parseNumeric(item?.tarps) ||
    parseNumeric(item?.timps) ||
    parseNumeric(item?.views) ||
    parseNumeric(item?.units)

  const deliverableLabel =
    item?.deliverable_label ||
    item?.deliverableLabel ||
    (item?.impressions ? "Impressions" : undefined) ||
    (item?.views ? "Views" : undefined) ||
    (item?.spots ? "Spots" : undefined) ||
    (item?.tarps ? "TARPs" : undefined) ||
    (item?.timps ? "TIMPs" : undefined) ||
    (item?.units ? "Units" : undefined)

  if (platform) parts.push(platform)
  if (placement) parts.push(placement)
  if (targeting) parts.push(targeting)
  if (geo) parts.push(geo)
  if (creative) parts.push(creative)
  if (buyType) parts.push(buyType)

  if (deliverableValue) {
    const deliverableText = `${formatCompactNumber(deliverableValue)}${deliverableLabel ? ` ${deliverableLabel}` : ""}`
    const rateText = rate ? ` @ ${formatCurrency(rate)}` : ""
    parts.push(`${deliverableText}${rateText}`)
  }

  return parts.join(" • ")
}

function formatMediaTypeLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ")
}

function buildGroups(lineItems: Record<string, any[]>, campaignStart?: string, campaignEnd?: string): MediaPlanVizGroup[] {
  const byMediaType = new Map<string, MediaPlanVizRow[]>()

  Object.entries(lineItems || {}).forEach(([mediaType, items]) => {
    if (!Array.isArray(items) || !items.length) return

    items.forEach((item, idx) => {
      const bursts = parseBursts(item)

      if (!bursts.length) return

      const datedBursts = bursts
        .map((burst) => {
          const start = parseDateSafe(burst?.start_date ?? burst?.startDate ?? item?.start_date ?? campaignStart)
          const end = parseDateSafe(burst?.end_date ?? burst?.endDate ?? item?.end_date ?? campaignEnd ?? burst?.start_date)
          if (!start || !end) return null
          const safeStart = start <= end ? start : end
          const safeEnd = end >= start ? end : start
          const spend =
            parseNumeric(burst?.budget) ||
            parseNumeric(burst?.media_investment) ||
            parseNumeric(burst?.amount) ||
            parseNumeric(burst?.spend) ||
            parseNumeric(burst?.investment) ||
            parseNumeric(burst?.buyAmount)
          const deliverables =
            parseNumeric(burst?.deliverables) ||
            parseNumeric(burst?.deliverable) ||
            parseNumeric(burst?.deliverablesAmount) ||
            parseNumeric(burst?.impressions) ||
            parseNumeric(burst?.spots)
          return {
            start: safeStart,
            end: safeEnd,
            spend,
            deliverables,
            label: deliverables ? formatCompactNumber(deliverables) : undefined,
          }
        })
        .filter(Boolean) as {
        start: Date
        end: Date
        spend?: number
        deliverables?: number
        label?: string
      }[]

      if (!datedBursts.length) return

      const rowStart = datedBursts.reduce((min, b) => (b.start < min ? b.start : min), datedBursts[0].start)
      const rowEnd = datedBursts.reduce((max, b) => (b.end > max ? b.end : max), datedBursts[0].end)

      const budgetFromBursts = datedBursts.reduce((sum, b) => sum + (b.spend || 0), 0)
      const budget =
        budgetFromBursts ||
        parseNumeric(item?.budget) ||
        parseNumeric(item?.buyAmount) ||
        parseNumeric(item?.cost) ||
        parseNumeric(item?.totalMedia) ||
        parseNumeric(item?.grossMedia)

      const row: MediaPlanVizRow = {
        id: String(item?.line_item_id ?? item?.id ?? `${mediaType}-${idx}`),
        title: deriveTitle(mediaType, item, idx),
        budget,
        start: rowStart.toISOString(),
        end: rowEnd.toISOString(),
        bursts: datedBursts.map((burst, burstIdx) => ({
          id: `${mediaType}-${idx}-burst-${burstIdx}`,
          start: burst.start.toISOString(),
          end: burst.end.toISOString(),
          label: burst.label,
          deliverables: burst.deliverables,
          spend: burst.spend,
        })),
      }

      const rows = byMediaType.get(mediaType) ?? []
      rows.push(row)
      byMediaType.set(mediaType, rows)
    })
  })

  const groups: MediaPlanVizGroup[] = Array.from(byMediaType.entries()).map(([mediaType, rows]) => ({
    channel: formatMediaTypeLabel(mediaType),
    rows: rows.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime() || a.title.localeCompare(b.title)),
  }))

  const orderMap = new Map(MEDIA_ORDER.map((key, idx) => [key.toLowerCase(), idx]))
  return sortChannels(groups).sort((a, b) => {
    const aKey = a.channel.toLowerCase().replace(/\s+/g, "")
    const bKey = b.channel.toLowerCase().replace(/\s+/g, "")
    const aIdx = orderMap.get(aKey) ?? Number.MAX_SAFE_INTEGER
    const bIdx = orderMap.get(bKey) ?? Number.MAX_SAFE_INTEGER
    if (aIdx === bIdx) return a.channel.localeCompare(b.channel)
    return aIdx - bIdx
  })
}

export default function MediaPlanVizSection({
  lineItems,
  campaignStart,
  campaignEnd,
  clientSlug,
  mbaNumber,
}: MediaPlanVizSectionProps) {
  const groups = buildGroups(lineItems, campaignStart, campaignEnd)

  if (!groups.length) {
    return (
      <Card className="rounded-3xl border-muted/70 bg-background/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Media plan visualisation</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">No media plan data available.</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <MediaPlanViz
        groups={groups}
        campaignStart={campaignStart}
        campaignEnd={campaignEnd}
        clientSlug={clientSlug}
        mbaNumber={mbaNumber}
      />
    </div>
  )
}
