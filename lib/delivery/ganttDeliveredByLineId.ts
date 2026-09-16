import type { ChannelKey, ChannelSectionData } from "@/components/dashboard/delivery/channels/types"
import { cleanPacingLineItemId } from "@/lib/pacing/delivery/lineItemIds"

const ZERO_SPEND_FAMILIES = new Set<ChannelKey>([
  "digital-display",
  "digital-video",
  "digital-audio",
  "bvod",
])

function parseCountish(value: string | undefined): number {
  if (!value) return 0
  if (value.includes("—") || value.trim() === "-") return 0
  const n = Number(value.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function parseDeliveredFromDetail(detail: string | undefined): number | null {
  if (!detail) return null
  if (/No delivery data yet/i.test(detail)) return null
  const match = detail.match(/Delivered\s+(.+?)\s*·/i)
  if (!match?.[1]) return null
  return parseCountish(match[1])
}

function isSpendCardTitle(title: string | undefined): boolean {
  return Boolean(title && /spend/i.test(title))
}

function isDeliverableCardTitle(title: string | undefined): boolean {
  if (!title) return false
  return /\bviews?\b/i.test(title) || /impressions/i.test(title)
}

function pickDeliverableCard(
  key: ChannelKey,
  cards: Array<{ title?: string; detail?: string; value?: string }>,
) {
  if (cards.some((card) => isSpendCardTitle(card.title))) {
    return cards.find((card) => isDeliverableCardTitle(card.title)) ?? cards[1]
  }
  return ZERO_SPEND_FAMILIES.has(key) ? cards[0] : cards[1]
}

/** Accordion per-line deliverable actuals, keyed by cleaned `line_item_id`. */
export function deliveredByLineIdFromChannelSections(
  sections: readonly ChannelSectionData[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const section of sections) {
    if (section.key === "plan-only") continue
    for (const row of section.lineItems) {
      const id = cleanPacingLineItemId(row.id)
      if (!id) continue
      const card = pickDeliverableCard(section.key, row.block.progressCards)
      const delivered = parseDeliveredFromDetail(card?.detail)
      if (delivered == null) continue
      map.set(id, delivered)
    }
  }
  return map
}

export function deliveredByLineIdIdentity(map: ReadonlyMap<string, number>): string {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => `${id}:${value}`)
    .join("|")
}
