import type { FinanceCampaignData } from "@/lib/finance/utils"

export type MediaTypeTotal = { mediaType: string; amount: number }
export type ServiceFeeTotal = { service: string; amount: number }

export function combineFinanceCampaignLists(
  bookedApproved: FinanceCampaignData[],
  other: FinanceCampaignData[]
): FinanceCampaignData[] {
  return [...(bookedApproved ?? []), ...(other ?? [])]
}

export function aggregateMediaLineItemsByType(campaigns: FinanceCampaignData[]): MediaTypeTotal[] {
  const map = new Map<string, number>()
  for (const c of campaigns) {
    for (const li of c.lineItems ?? []) {
      const key = (li.mediaType || "Other").trim() || "Other"
      map.set(key, (map.get(key) ?? 0) + li.amount)
    }
  }
  return Array.from(map.entries())
    .map(([mediaType, amount]) => ({ mediaType, amount: Math.round(amount * 100) / 100 }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
}

export function aggregateServiceRowsByService(campaigns: FinanceCampaignData[]): ServiceFeeTotal[] {
  const map = new Map<string, number>()
  for (const c of campaigns) {
    for (const s of c.serviceRows ?? []) {
      const key = (s.service || "Fee").trim() || "Fee"
      map.set(key, (map.get(key) ?? 0) + s.amount)
    }
  }
  return Array.from(map.entries())
    .map(([service, amount]) => ({ service, amount: Math.round(amount * 100) / 100 }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
}

/** Sum of per-campaign totals (scopes / media workbooks use one total per MBA block). */
export function sumCampaignTotals(campaigns: FinanceCampaignData[]): number {
  let t = 0
  for (const c of campaigns) {
    t += typeof c.total === "number" && !Number.isNaN(c.total) ? c.total : 0
  }
  return Math.round(t * 100) / 100
}
