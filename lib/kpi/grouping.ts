import type { LineItem } from "@/lib/generateMediaPlan"

export interface GroupedLineItemForKPI {
  lineItemId: string
  platform: string
  bidStrategy: string
  buyType: string
  creative: string
  targeting: string
  network: string
  station: string
  title: string
  site: string
  placement: string
  oohFormat: string
  oohType: string
  market: string
  spend: number
  deliverables: number
}

export function groupLineItemsForKPI(items: LineItem[]): GroupedLineItemForKPI[] {
  const map = new Map<string, GroupedLineItemForKPI>()

  for (const item of items) {
    const id: string =
      (item as any).line_item_id ??
      (item as any).lineItemId ??
      `${(item as any).platform ?? ""}_${(item as any).bidStrategy ?? (item as any).bid_strategy ?? ""}_${(item as any).creative ?? ""}_${(item as any).line_item ?? ""}`

    const spend =
      parseFloat(
        String((item as any).grossMedia ?? (item as any).totalMedia ?? "0").replace(
          /[^0-9.-]/g,
          "",
        ),
      ) || 0
    const deliverables =
      parseFloat(
        String(
          (item as any).deliverables ?? (item as any).calculatedValue ?? "0",
        ).replace(/[^0-9.-]/g, ""),
      ) || 0

    if (map.has(id)) {
      const existing = map.get(id)!
      existing.spend += spend
      existing.deliverables += deliverables
    } else {
      map.set(id, {
        lineItemId: id,
        platform: String((item as any).platform ?? (item as any).site ?? ""),
        bidStrategy: String((item as any).bidStrategy ?? (item as any).bid_strategy ?? ""),
        buyType: String((item as any).buyType ?? (item as any).buy_type ?? ""),
        creative: String((item as any).creative ?? ""),
        targeting: String(
          (item as any).targeting ??
            (item as any).creativeTargeting ??
            (item as any).creative_targeting ??
            "",
        ),
        network: String((item as any).network ?? ""),
        station: String((item as any).station ?? ""),
        title: String((item as any).title ?? ""),
        site: String((item as any).site ?? ""),
        placement: String((item as any).placement ?? ""),
        oohFormat: String((item as any).oohFormat ?? ""),
        oohType: String((item as any).oohType ?? ""),
        market: String((item as any).market ?? ""),
        spend,
        deliverables,
      })
    }
  }

  return Array.from(map.values())
}
