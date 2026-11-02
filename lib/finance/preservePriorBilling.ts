/**
 * C3 — stale dateBasis detection: override rows whose stored `dateBasis` no
 * longer matches the line's current burst dates (the edit page asks keep or
 * reset). The additive-preserve diff helpers that sat here had no caller
 * after B5 and went in B8.
 */

import {
  computeBillingOverrideDateBasis,
  type BurstDateLike,
} from "@/lib/finance/billingOverrideDateBasis"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  toBillingOverrideLineItemId,
  billingOverrideLineIdsMatch,
} from "@/lib/finance/manualBillingOverridesUi"

export type BillingActivityLine = {
  /** Canonical line_item_id (no `billing-…::` prefix). */
  lineItemId: string
  /** Human label for alerts (publisher / platform + targeting). */
  label: string
  bursts: BurstDateLike[]
}

export type StaleDateBasisOverride = {
  lineItemId: string
  component: "media" | "fee"
  reason?: string
  storedDateBasis: string
  currentDateBasis: string
  label: string
}

function rowLineId(row: BillingOverrideRow): string {
  return toBillingOverrideLineItemId(String(row.line_item_id ?? row.lineItemId ?? "").trim())
}

function rowComponent(row: BillingOverrideRow): "media" | "fee" {
  return String(row.component ?? "media").trim().toLowerCase() === "fee" ? "fee" : "media"
}

function rowDateBasis(row: BillingOverrideRow): string {
  return String(row.date_basis ?? row.dateBasis ?? "").trim()
}

/**
 * Override rows whose stored dateBasis no longer matches the line's current burst dates.
 */
export async function findStaleDateBasisOverrides(args: {
  overrideRows: BillingOverrideRow[]
  incoming: BillingActivityLine[]
}): Promise<StaleDateBasisOverride[]> {
  // MB-11: Map keyed on canonical id so decorated incoming still resolves.
  const byId = new Map(
    args.incoming.map((l) => [
      toBillingOverrideLineItemId(String(l.lineItemId ?? "").trim()),
      l,
    ])
  )
  const out: StaleDateBasisOverride[] = []

  for (const row of args.overrideRows) {
    const lineItemId = rowLineId(row)
    if (!lineItemId) continue
    const stored = rowDateBasis(row)
    if (!stored) continue

    const matched =
      byId.get(toBillingOverrideLineItemId(lineItemId)) ??
      args.incoming.find((l) => billingOverrideLineIdsMatch(l.lineItemId, lineItemId))
    if (!matched) continue

    const current = await computeBillingOverrideDateBasis(matched.bursts)
    if (current === stored) continue

    out.push({
      lineItemId,
      component: rowComponent(row),
      reason: String(row.reason ?? "").trim() || undefined,
      storedDateBasis: stored,
      currentDateBasis: current,
      label: matched.label || lineItemId,
    })
  }

  return out.sort((a, b) =>
    `${a.lineItemId}:${a.component}`.localeCompare(`${b.lineItemId}:${b.component}`)
  )
}
