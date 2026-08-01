/**
 * Pure run merge — idempotent by (source, natural_key).
 * Re-running updates amount/line_items for non-review-locked statuses;
 * never duplicates; preserves review decisions (approved/adjusted/held/excluded).
 */

import type { FinanceRunItem, FinanceRunItemStatus, RunCandidate } from "@/lib/finance/periods/types"

const PRESERVE_STATUSES: ReadonlySet<FinanceRunItemStatus> = new Set([
  "approved",
  "adjusted",
  "held",
  "excluded",
])

export type MergeRunResult = {
  items: FinanceRunItem[]
  inserted: number
  updated: number
  unchanged: number
}

let nextId = 1

export function resetRunItemIdCounter(n = 1): void {
  nextId = n
}

function allocateId(): number {
  const id = nextId
  nextId += 1
  return id
}

/**
 * Merge candidates into existing items for one period.
 * Held candidates create status=held with hold_reason.
 */
export function mergeRunCandidates(args: {
  periodId: number
  existing: FinanceRunItem[]
  candidates: RunCandidate[]
}): MergeRunResult {
  const byKey = new Map<string, FinanceRunItem>()
  for (const item of args.existing) {
    byKey.set(`${item.source}::${item.naturalKey}`, item)
  }

  let inserted = 0
  let updated = 0
  let unchanged = 0

  for (const c of args.candidates) {
    const key = `${c.source}::${c.naturalKey}`
    const prev = byKey.get(key)
    const held = Boolean(c.heldReason)

    if (!prev) {
      const status: FinanceRunItemStatus = held ? "held" : "pending"
      byKey.set(key, {
        id: allocateId(),
        periodId: args.periodId,
        source: c.source,
        naturalKey: c.naturalKey,
        mbaNumber: c.mbaNumber,
        clientId: c.clientId,
        versionId: c.versionId,
        sowId: c.sowId,
        lineItemsJson: c.lineItemsJson,
        amountCents: c.amountCents,
        invoiceReference: c.invoiceReference,
        status,
        adjustmentCents: null,
        adjustmentReason: null,
        holdReason: held ? String(c.heldReason) : null,
        excludeReason: null,
        clientSnapshotJson: null,
        linkedVarianceFromItemId: null,
        rolledFromItemId: null,
      })
      inserted += 1
      continue
    }

    if (PRESERVE_STATUSES.has(prev.status)) {
      // Keep review decisions; still refresh invoice ref / amounts only if pending-family
      unchanged += 1
      continue
    }

    const nextStatus: FinanceRunItemStatus = held
      ? "held"
      : prev.status === "stale"
        ? "pending"
        : prev.status

    const next: FinanceRunItem = {
      ...prev,
      mbaNumber: c.mbaNumber,
      clientId: c.clientId,
      versionId: c.versionId,
      sowId: c.sowId,
      lineItemsJson: c.lineItemsJson,
      amountCents: c.amountCents,
      invoiceReference: c.invoiceReference,
      status: nextStatus,
      holdReason: held ? String(c.heldReason) : prev.holdReason,
    }

    const same =
      prev.amountCents === next.amountCents &&
      prev.invoiceReference === next.invoiceReference &&
      prev.status === next.status &&
      JSON.stringify(prev.lineItemsJson) === JSON.stringify(next.lineItemsJson)

    if (same) {
      unchanged += 1
    } else {
      updated += 1
      byKey.set(key, next)
    }
  }

  return {
    items: [...byKey.values()].sort((a, b) => a.naturalKey.localeCompare(b.naturalKey)),
    inserted,
    updated,
    unchanged,
  }
}
