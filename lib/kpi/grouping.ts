import type { LineItem } from "@/lib/generateMediaPlan"
import { buildLineItemIdentity } from "@/lib/mediaplan/lineItemIds"
import { idCodeForKpiMediaType } from "./fanOut"

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

export type GroupLineItemsForKPIOptions = {
  mbaNumber?: string
  mediaType?: string
}

function syntheticGroupId(item: LineItem): string {
  return `${(item as any).platform ?? ""}_${(item as any).bidStrategy ?? (item as any).bid_strategy ?? ""}_${(item as any).creative ?? ""}_${(item as any).line_item ?? ""}`
}

export function groupLineItemsForKPI(
  items: LineItem[],
  opts?: GroupLineItemsForKPIOptions,
): GroupedLineItemForKPI[] {
  const map = new Map<string, GroupedLineItemForKPI>()
  const mba = opts?.mbaNumber?.trim() ?? ""
  const mediaType = opts?.mediaType ?? ""
  const code = mediaType ? idCodeForKpiMediaType(mediaType) : null
  const isProduction = mediaType.toLowerCase().trim() === "production"

  items.forEach((item, index) => {
    let id = String((item as any).line_item_id ?? (item as any).lineItemId ?? "").trim()
    if (!id && code && mba) {
      id = buildLineItemIdentity(item, mba, code, index).line_item_id
    } else if (!id && isProduction && mba) {
      id = `${mba}PROD${index + 1}`
    }
    if (!id) {
      id = syntheticGroupId(item)
    }

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
  })

  return Array.from(map.values())
}
