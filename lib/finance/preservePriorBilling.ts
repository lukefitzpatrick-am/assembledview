/**
 * C3 — preserve-prior on additive change + stale dateBasis detection.
 *
 * Diff incoming activity vs persisted lines; new lines get fresh auto billing,
 * prior override rows are kept. Stale `dateBasis` vs current burst dates
 * surfaces a keep-or-reset decision for the UI.
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
import type { BillingMonth } from "@/lib/billing/types"

export type BillingActivityLine = {
  /** Canonical line_item_id (no `billing-…::` prefix). */
  lineItemId: string
  /** Human label for alerts (publisher / platform + targeting). */
  label: string
  bursts: BurstDateLike[]
}

export type BillingActivityDiff = {
  priorLineIds: string[]
  newActivity: BillingActivityLine[]
  removedLineIds: string[]
  /** True when prior activity remains and at least one new line was added. */
  isAdditivePreserve: boolean
}

export type StaleDateBasisOverride = {
  lineItemId: string
  component: "media" | "fee"
  reason?: string
  storedDateBasis: string
  currentDateBasis: string
  label: string
}

export type DateBasisDecision = "keep" | "reset"

function rowLineId(row: BillingOverrideRow): string {
  return toBillingOverrideLineItemId(String(row.line_item_id ?? row.lineItemId ?? "").trim())
}

function rowComponent(row: BillingOverrideRow): "media" | "fee" {
  return String(row.component ?? "media").trim().toLowerCase() === "fee" ? "fee" : "media"
}

function rowDateBasis(row: BillingOverrideRow): string {
  return String(row.date_basis ?? row.dateBasis ?? "").trim()
}

/** Collect canonical line ids present on a persisted billing schedule. */
export function collectPersistedBillingLineIds(months: BillingMonth[]): Set<string> {
  const ids = new Set<string>()
  for (const month of months) {
    if (!month.lineItems) continue
    for (const items of Object.values(month.lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        const id = toBillingOverrideLineItemId(String(line.id ?? "").trim())
        if (id) ids.add(id)
      }
    }
  }
  return ids
}

/**
 * Diff persisted schedule line ids vs incoming container activity.
 * Additive preserve = prior ids still present + at least one brand-new line.
 */
export function diffBillingActivity(args: {
  persistedLineIds: Iterable<string>
  incoming: BillingActivityLine[]
}): BillingActivityDiff {
  const priorSet = new Set(
    [...args.persistedLineIds].map((id) => toBillingOverrideLineItemId(String(id))).filter(Boolean)
  )
  const incomingIds = new Set(args.incoming.map((l) => l.lineItemId))

  const priorLineIds = [...priorSet].filter((id) => incomingIds.has(id)).sort()
  const newActivity = args.incoming
    .filter((l) => !priorSet.has(l.lineItemId))
    .slice()
    .sort((a, b) => a.lineItemId.localeCompare(b.lineItemId))
  const removedLineIds = [...priorSet].filter((id) => !incomingIds.has(id)).sort()

  return {
    priorLineIds,
    newActivity,
    removedLineIds,
    isAdditivePreserve: priorLineIds.length > 0 && newActivity.length > 0,
  }
}

/**
 * Alert copy when prior overrides stay and new lines are billed fresh.
 * Example: `Prior billing preserved; new billing added for Google Search, Meta Prospecting.`
 */
export function formatPreservePriorAlert(diff: BillingActivityDiff): string | null {
  if (!diff.isAdditivePreserve) return null
  const names = diff.newActivity.map((l) => l.label.trim() || l.lineItemId).filter(Boolean)
  const joined =
    names.length <= 1
      ? names[0] ?? "new lines"
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
  return `Prior billing preserved; new billing added for ${joined}.`
}

/**
 * Override rows whose stored dateBasis no longer matches the line's current burst dates.
 */
export async function findStaleDateBasisOverrides(args: {
  overrideRows: BillingOverrideRow[]
  incoming: BillingActivityLine[]
}): Promise<StaleDateBasisOverride[]> {
  const byId = new Map(args.incoming.map((l) => [l.lineItemId, l]))
  const out: StaleDateBasisOverride[] = []

  for (const row of args.overrideRows) {
    const lineItemId = rowLineId(row)
    if (!lineItemId) continue
    const stored = rowDateBasis(row)
    if (!stored) continue

    const line = byId.get(lineItemId)
    // Also accept prefixed match on incoming labels map
    const matched =
      line ??
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

/**
 * Merge policy (documentation / callers):
 * - Prior lines with overrides → keep override rows (table unchanged unless stale reset)
 * - New lines → no override → C1 recompute produces fresh auto months
 * - Resulting schedule = computeCampaignFinancials(all lines + remaining overrides)
 */
export function describePreservePriorMerge(diff: BillingActivityDiff): {
  preserveOverrideLineIds: string[]
  freshComputeLineIds: string[]
} {
  return {
    preserveOverrideLineIds: diff.priorLineIds,
    freshComputeLineIds: diff.newActivity.map((l) => l.lineItemId),
  }
}
