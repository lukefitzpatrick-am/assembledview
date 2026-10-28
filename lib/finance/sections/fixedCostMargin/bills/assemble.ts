/**
 * Glue between the loaders and the matcher: publisher resolution, which plan
 * lines take bill cost, CF placement map rows, and the bill line view.
 * Pure. No I/O.
 */

import type { PublisherIdentityRow } from "@/lib/publisher/publisherUniqueness"
import { createPublisherNameResolver } from "@/lib/publisher/resolvePublisherName"

import type { CostBasis, FixedCostBillLineView } from "../compose"
import type { CfPlacementMap, MatchedBillLine, ResolvedPublisher } from "./match"
import { aliasPublisherFor, DIRECT_SUPPLIERS, directSupplierPublisher } from "./suppliers"

export type PublisherRow = PublisherIdentityRow & { publisher_name: string | null }

/**
 * Text (a plan line's publisher, or a media owner on a bill) to an AV
 * publisher: publisher name, publisher alias or publisherid first
 * (`resolvePublisherName`), then the media owner alias list.
 */
export function createBillPublisherResolver(
  publishers: readonly PublisherRow[]
): (text: string) => ResolvedPublisher | null {
  const resolve = createPublisherNameResolver(publishers)
  const toResolved = (p: PublisherRow | undefined): ResolvedPublisher | null =>
    p && p.publisher_name
      ? {
          name: p.publisher_name.trim(),
          billingAgency: String(p.billingagency ?? "").trim().toLowerCase(),
        }
      : null
  return (text: string) => {
    const t = text.trim()
    if (!t) return null
    const direct = toResolved(resolve(t))
    if (direct) return direct
    const alias = aliasPublisherFor(t)
    return alias ? toResolved(resolve(alias)) : null
  }
}

const DIRECT_PUBLISHER_NAMES = new Set(
  DIRECT_SUPPLIERS.map((d) => d.publisher?.trim().toLowerCase()).filter((n): n is string => !!n)
)

/**
 * Where a plan line's cost comes from. Channel Factory, every Advertising
 * Associates publisher and the direct publishers in `DIRECT_SUPPLIERS` take
 * Xero bills; everything else takes platform spend.
 */
export function costBasisForPublisher(p: ResolvedPublisher | null): CostBasis {
  if (!p) return "platform"
  const name = p.name.toLowerCase()
  if (name === "channel factory") return "xero_bill"
  if (p.billingAgency === "advertising associates") return "xero_bill"
  if (DIRECT_PUBLISHER_NAMES.has(name)) return "xero_bill"
  return "platform"
}

/** Direct supplier contact to its AV publisher, only when that publisher exists. */
export function createDirectPublisherFor(
  resolve: (text: string) => ResolvedPublisher | null
): (contactName: string) => ResolvedPublisher | null {
  return (contactName: string) => {
    const name = directSupplierPublisher(contactName)
    if (!name) return null
    const p = resolve(name)
    return p && p.name.toLowerCase() === name.toLowerCase() ? p : null
  }
}

/** CF daily file rows (placement, plan line id) to the placement map. Blank line ids are left out. */
export function buildCfPlacementMap(rows: ReadonlyArray<{ placementId: string; lineItemId: string }>): CfPlacementMap {
  const map = new Map<string, string[]>()
  for (const r of rows) {
    const pl = r.placementId.trim().toUpperCase()
    const lid = r.lineItemId.trim().toLowerCase()
    if (!pl) continue
    const list = map.get(pl) ?? []
    if (lid && !list.includes(lid)) list.push(lid)
    map.set(pl, list)
  }
  for (const list of map.values()) list.sort()
  return map
}

const SUPPLIER_LABEL: Record<string, string> = {
  channel_factory: "Channel Factory",
  advertising_associates: "Advertising Associates",
  direct_publisher: "Direct publisher",
}

export function billLineView(l: MatchedBillLine): FixedCostBillLineView {
  return {
    key: l.key,
    xeroInvoiceId: l.xeroInvoiceId,
    xeroLineItemId: l.xeroLineItemId,
    lineIndex: l.lineIndex,
    supplier: l.supplierName,
    supplierKind: SUPPLIER_LABEL[l.supplierKind] ?? l.supplierKind,
    invoiceNumber: l.invoiceNumber,
    status: l.status,
    statusClass: l.statusClass,
    issueDate: l.issueDate,
    billedMonth: l.billedMonth,
    deliveredMonth: l.deliveredMonth,
    description: l.description.length > 160 ? `${l.description.slice(0, 157)}...` : l.description,
    kind: l.kind,
    placementId: l.plId,
    ioId: l.opId,
    mediaOwnerText: l.mediaOwnerText,
    publisher: l.publisher,
    mbaNumber: l.mbaNumber,
    mbaSource: l.mbaSource,
    clientName: l.clientName,
    lineItemId: l.lineItemId,
    inReport: l.inReport,
    state: l.state,
    method: l.method,
    candidates: l.candidates,
    reason: l.reason,
    grossCents: l.grossCents,
    rebateCents: l.rebateCents,
    netCents: l.netCents,
    savedMatch: l.savedMatch ? { ...l.savedMatch } : null,
  }
}

/** YYYY-MM plus n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map((v) => Number.parseInt(v, 10))
  const idx = (y ?? 0) * 12 + ((m ?? 1) - 1) + n
  const yy = Math.floor(idx / 12)
  const mm = (idx % 12) + 1
  return `${yy}-${String(mm).padStart(2, "0")}`
}
