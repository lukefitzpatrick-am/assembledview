/**
 * Insert accepted ingest panels + per-period flights in one transaction.
 * Flights cascade with the panel; no money columns.
 */

import type { IngestPanelRow } from "@/lib/mediaplans/ingest/stampProposalForSave"

function encodeSourceRowRef(row: IngestPanelRow): string {
  const base = row.sourceRowRef ?? ""
  if (!row.rawExtras || Object.keys(row.rawExtras).length === 0) return base
  const raw = JSON.stringify(row.rawExtras)
  return base ? `${base}\nRAW:${raw}` : `RAW:${raw}`
}

export async function insertIngestPanels(
  rows: IngestPanelRow[],
): Promise<number> {
  if (rows.length === 0) return 0
  const { db } = await import("@/db")
  const { lineItemPanels, lineItemPanelFlights } = await import(
    "@/db/schema/panels"
  )

  await db.transaction(async (tx) => {
    for (const r of rows) {
      const inserted = await tx
        .insert(lineItemPanels)
        .values({
          lineItemId: r.lineItemId,
          mbaNumber: r.mbaNumber.toLowerCase(),
          buyGranularity: r.buyGranularity,
          latitude: r.latitude,
          longitude: r.longitude,
          publisherFormatName: r.publisherFormatName,
          state: r.state,
          siteNumber: r.siteNumber,
          addressOrPackDetails: r.addressOrPackDetails,
          suburb: r.suburb,
          postcode: r.postcode,
          direction: r.direction,
          geography: r.geography,
          format: r.format,
          size: r.size,
          orientation: r.orientation,
          digitalSpec: r.digitalSpec,
          illumination: r.illumination,
          digitalOperatingHours: r.digitalOperatingHours,
          rotationSeconds: r.rotationSeconds,
          advertiserShare: r.advertiserShare,
          panelName: r.panelName,
          villageName: r.villageName,
          panelWeight: r.panelWeight,
          sourcePublisher: r.sourcePublisher,
          sourceRowRef: encodeSourceRowRef(r),
        })
        .returning({ id: lineItemPanels.id })

      const panelId = inserted[0]?.id
      if (panelId == null) {
        throw new Error("insertIngestPanels: panel insert returned no id")
      }

      const flights = r.flights ?? []
      if (flights.length === 0) continue

      await tx.insert(lineItemPanelFlights).values(
        flights.map((f) => ({
          panelId,
          periodStart: f.periodStart,
          periodEnd: f.periodEnd,
          isLive: f.isLive,
          isBonus: f.isBonus,
        })),
      )
    }
  })

  return rows.length
}
