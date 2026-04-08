import type { BillingRecord } from "@/lib/types/financeBilling"
import type { PublisherCampaignRow, PublisherGroup } from "@/lib/types/financePublisherGroup"

/**
 * Payables = legacy “publishers” view: amounts from `media_plan_versions.deliverySchedule`
 * for the month, rolled up **per line item** (skip `client_pays_media`), grouped
 * publisher → client → campaign (`BillingRecord`).
 */

/** Sum agency-owed lines only (excludes client-pays). */
export function sumPayableLineItems(record: BillingRecord): number {
  return (
    Math.round(
      (record.line_items || [])
        .filter((li) => !li.client_pays_media)
        .reduce((s, li) => s + Number(li.amount || 0), 0) * 100
    ) / 100
  )
}

/** Sum {@link sumPayableLineItems} across payable records matching `predicate`. */
export function sumPayableRecordsAgencyExpected(
  records: BillingRecord[],
  predicate: (r: BillingRecord) => boolean
): number {
  let s = 0
  for (const r of records) {
    if (!predicate(r)) continue
    s += sumPayableLineItems(r)
  }
  return Math.round(s * 100) / 100
}

/**
 * Publisher label for grouped grids: first line with amount &gt; 0 and not client-pays,
 * else first line (matches how `/api/finance/publishers` attributed each line).
 */
export function publisherLabelForFinanceGrouping(record: BillingRecord): string {
  for (const li of record.line_items || []) {
    if (li.client_pays_media) continue
    const a = Number(li.amount || 0)
    if (a > 0) {
      const n = (li.publisher_name || "").trim()
      if (n) return n
    }
  }
  return (record.line_items?.[0]?.publisher_name || "").trim() || "—"
}

export function recordMatchesPublisherNameFilter(record: BillingRecord, wantNames: Set<string>): boolean {
  return (record.line_items || []).some((li) => {
    const n = (li.publisher_name || "").trim()
    return n && wantNames.has(n)
  })
}

/**
 * Same shape as legacy `GET /api/finance/publishers`: iterate line items, skip client-pays,
 * accumulate by publisher → client → billing record (campaign).
 */
export function aggregatePayablesToPublisherGroups(records: BillingRecord[]): PublisherGroup[] {
  type ClientBucket = Map<string, Map<number, PublisherCampaignRow>>

  const pubMap = new Map<string, { publisherName: string; subtotal: number; clients: ClientBucket }>()

  for (const r of records) {
    for (const li of r.line_items || []) {
      if (li.client_pays_media) continue
      const amt = Number(li.amount || 0)
      if (amt <= 0) continue

      const pubName = (li.publisher_name || "").trim() || "—"
      const clientName = r.client_name?.trim() || "—"

      let pg = pubMap.get(pubName)
      if (!pg) {
        pg = { publisherName: pubName, subtotal: 0, clients: new Map() }
        pubMap.set(pubName, pg)
      }
      pg.subtotal += amt

      let clientMap = pg.clients.get(clientName)
      if (!clientMap) {
        clientMap = new Map()
        pg.clients.set(clientName, clientMap)
      }

      const existing = clientMap.get(r.id)
      if (existing) {
        existing.totalMedia = Math.round((existing.totalMedia + amt) * 100) / 100
      } else {
        clientMap.set(r.id, {
          billingRecordId: r.id,
          clientName: r.client_name,
          mbaNumber: r.mba_number || "",
          campaignName: r.campaign_name || "",
          totalMedia: Math.round(amt * 100) / 100,
          status: r.status,
          billingType: r.billing_type,
        })
      }
    }
  }

  return [...pubMap.values()]
    .map((pub) => ({
      publisherName: pub.publisherName,
      subtotal: Math.round(pub.subtotal * 100) / 100,
      clients: [...pub.clients.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .map(([clientName, camps]) => ({
          clientName,
          campaigns: [...camps.values()].sort((a, b) =>
            a.campaignName.localeCompare(b.campaignName, undefined, { sensitivity: "base" })
          ),
        })),
    }))
    .sort((a, b) => a.publisherName.localeCompare(b.publisherName, undefined, { sensitivity: "base" }))
}
