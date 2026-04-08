import type { LineItem, MediaItems } from "@/lib/generateMediaPlan"
import type { Publisher } from "@/lib/types/publisher"

/** Same filter as media plan Excel export (bonus lines or any monetary/deliverable signal). */
export function shouldIncludeMediaPlanLineItem(item: LineItem): boolean {
  const buyType = (item.buyType || "").toLowerCase()
  const budgetValue = parseFloat(String(item.deliverablesAmount ?? "").replace(/[^0-9.]/g, "")) || 0
  const deliverablesValue = parseFloat(String(item.deliverables ?? "").replace(/[^0-9.]/g, "")) || 0
  const grossValue = parseFloat(String(item.grossMedia ?? "").replace(/[^0-9.]/g, "")) || 0
  return buyType === "bonus" || budgetValue > 0 || deliverablesValue > 0 || grossValue > 0
}

export function isAdvertisingAssociatesPublisher(p: Publisher): boolean {
  const v = String(p.billingagency ?? "").trim().toLowerCase()
  return v === "advertising associates"
}

function publisherNameKeysFromLineItem(item: LineItem): string[] {
  const out: string[] = []
  for (const raw of [item.network, item.platform, item.site]) {
    const s = typeof raw === "string" ? raw.trim() : ""
    if (s) out.push(s)
  }
  return out
}

function buildPublisherNameMap(publishers: Publisher[]): Map<string, Publisher> {
  const map = new Map<string, Publisher>()
  for (const p of publishers) {
    const name = String(p.publisher_name ?? "").trim()
    if (name) map.set(name, p)
  }
  return map
}

function resolvePublisherByName(name: string, byName: Map<string, Publisher>): Publisher | undefined {
  if (byName.has(name)) return byName.get(name)
  const lower = name.toLowerCase()
  for (const [k, v] of byName) {
    if (k.toLowerCase() === lower) return v
  }
  return undefined
}

/**
 * True when any included line item's network/platform/site matches a Xano publisher
 * with billingagency "advertising associates".
 */
export function planHasAdvertisingAssociatesLineItem(
  mediaItems: MediaItems,
  publishers: Publisher[],
  shouldInclude: (item: LineItem) => boolean,
): boolean {
  const byName = buildPublisherNameMap(publishers)
  for (const items of Object.values(mediaItems)) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!shouldInclude(item)) continue
      for (const key of publisherNameKeysFromLineItem(item)) {
        const pub = resolvePublisherByName(key, byName)
        if (pub && isAdvertisingAssociatesPublisher(pub)) return true
      }
    }
  }
  return false
}
