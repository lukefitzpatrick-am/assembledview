/**
 * Hub spend attribution: schedule line → catalogue publisher.
 *
 * Empty/whitespace header1 is absent (not a ?? fall-through). Ingest stamps
 * `line_items.publisher` with the short profile name; join via
 * `publisher_profiles.publisher_id` (0036) so SCA/SEN are not compared to
 * catalogue display names.
 */
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"

export type PublisherMatchTarget = {
  id: number
  publisher_name: string
  publisherid: string
}

function nonEmpty(value: unknown): string {
  return String(value ?? "").trim()
}

function lineCatalogueFk(li: any): number | null {
  const raw = li?.publisher_id ?? li?.publisherId
  if (raw == null || raw === "") return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function lineItemMatchesPublisher(
  li: any,
  publisher: PublisherMatchTarget,
): boolean {
  const catalogueId = Number(publisher.id)
  const lineFk = lineCatalogueFk(li)
  if (Number.isFinite(catalogueId) && lineFk != null && lineFk === catalogueId) {
    return true
  }

  const header1 = nonEmpty(li?.header1)
  const linePublisher = nonEmpty(li?.publisher)
  const linePublisherid = nonEmpty(li?.publisherid)
  const identity = header1 || linePublisher || linePublisherid

  if (Number.isFinite(catalogueId)) {
    for (const stamp of [linePublisher, identity]) {
      if (!stamp) continue
      const joined = resolveCatalogueIdForProfileName(stamp)
      if (joined != null && joined === catalogueId) return true
    }
  }

  if (!identity) return false
  const n = identity.toLowerCase()
  if (n === publisher.publisher_name.trim().toLowerCase()) return true
  const businessId = nonEmpty(publisher.publisherid)
  if (businessId && n === businessId.toLowerCase()) return true
  if (linePublisherid && businessId && linePublisherid.toLowerCase() === businessId.toLowerCase()) {
    return true
  }
  return false
}
