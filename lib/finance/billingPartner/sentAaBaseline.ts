/**
 * AA billing-media dollars on each sent pack that includes this MBA.
 * Draft packs are omitted. Reads wait for marker 0100_billing_partner_packs.
 */
import "server-only"

import { and, eq, inArray } from "drizzle-orm"

import { getDb } from "@/db"
import {
  billingPartnerPackItems,
  billingPartnerPacks,
  migrationMarkers,
  scheduleMonths,
} from "@/db/schema"
import type { SentAaPack } from "@/lib/finance/billingPartner/publishWarnings"

const PACK_MARKER = "0100_billing_partner_packs"

export async function loadSentAaBaseline(mbaNumber: string): Promise<SentAaPack[]> {
  const db = getDb()
  const [marker] = await db
    .select({ key: migrationMarkers.key })
    .from(migrationMarkers)
    .where(eq(migrationMarkers.key, PACK_MARKER))
    .limit(1)
  if (!marker) return []

  const packs = await db
    .select({
      billingMonth: billingPartnerPacks.billingMonth,
      sentAt: billingPartnerPacks.sentAt,
      versionId: billingPartnerPackItems.versionId,
      versionNumber: billingPartnerPackItems.versionNumber,
    })
    .from(billingPartnerPackItems)
    .innerJoin(
      billingPartnerPacks,
      eq(billingPartnerPackItems.packId, billingPartnerPacks.id),
    )
    .where(
      and(
        eq(billingPartnerPackItems.mbaNumber, mbaNumber),
        eq(billingPartnerPacks.status, "sent"),
      ),
    )
  if (packs.length === 0) return []

  const versions = new Map<number, number>()
  for (const pack of packs) versions.set(pack.versionId, pack.versionNumber)

  const lineIdsByVersion = new Map<number, Set<string>>()
  await Promise.all(
    [...versions.entries()].map(async ([versionId, versionNumber]) => {
      lineIdsByVersion.set(versionId, await aaBillingLineIds(mbaNumber, versionNumber))
    }),
  )

  const cells = await db
    .select({
      versionId: scheduleMonths.versionId,
      lineItemId: scheduleMonths.lineItemId,
      component: scheduleMonths.component,
      basis: scheduleMonths.basis,
      month: scheduleMonths.month,
      amountCents: scheduleMonths.amountCents,
    })
    .from(scheduleMonths)
    .where(inArray(scheduleMonths.versionId, [...versions.keys()]))

  const dollarsByVersion = new Map<number, Map<string, number>>()
  for (const cell of cells) {
    if (cell.basis !== "billing" || cell.component !== "media") continue
    const lineIds = lineIdsByVersion.get(cell.versionId)
    if (!lineIds?.has(cell.lineItemId)) continue
    const month = cell.month.slice(0, 7)
    const byMonth = dollarsByVersion.get(cell.versionId) ?? new Map<string, number>()
    byMonth.set(month, (byMonth.get(month) ?? 0) + Number(cell.amountCents))
    dollarsByVersion.set(cell.versionId, byMonth)
  }

  return packs.map((pack) => {
    const cents = dollarsByVersion.get(pack.versionId) ?? new Map<string, number>()
    const aaAmountsByMonth: Record<string, number> = {}
    for (const month of [...cents.keys()].sort()) {
      aaAmountsByMonth[month] = (cents.get(month) ?? 0) / 100
    }
    return {
      billingMonth: pack.billingMonth,
      versionId: pack.versionId,
      sentAt: pack.sentAt,
      aaAmountsByMonth,
    }
  })
}

async function aaBillingLineIds(mbaNumber: string, versionNumber: number): Promise<Set<string>> {
  const { buildMediaItemsFromPersisted } = await import(
    "@/lib/docs/buildMediaItemsFromPersisted"
  )
  const {
    advertisingAssociatesFilteredPlanHasLineItems,
    filterMediaItemsForAdvertisingAssociates,
    planHasAdvertisingAssociatesLineItem,
    shouldIncludeMediaPlanLineItem,
  } = await import("@/lib/mediaplan/advertisingAssociatesExcel")

  const built = await buildMediaItemsFromPersisted({ mbaNumber, versionNumber })
  if (
    !planHasAdvertisingAssociatesLineItem(
      built.mediaItems,
      built.publishers,
      shouldIncludeMediaPlanLineItem,
    )
  ) {
    return new Set()
  }
  const filtered = filterMediaItemsForAdvertisingAssociates(built.mediaItems, built.publishers)
  if (!advertisingAssociatesFilteredPlanHasLineItems(filtered)) return new Set()
  const ids = new Set<string>()
  for (const items of Object.values(filtered)) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      const id = item.line_item_id ?? item.lineItemId
      if (id != null && String(id).trim()) ids.add(String(id).trim())
    }
  }
  return ids
}
