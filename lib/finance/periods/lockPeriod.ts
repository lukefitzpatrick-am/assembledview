import type { ClientSnapshot, FinanceRunItem } from "@/lib/finance/periods/types"

export type LockFreezeResult = {
  frozen: FinanceRunItem[]
  heldToRoll: FinanceRunItem[]
}

/**
 * Lock: freeze non-held items with client_snapshot_json; held items roll forward.
 * Excluded stay excluded; stale blocked from lock (caller should resolve first).
 */
export function freezeItemsForLock(args: {
  items: FinanceRunItem[]
  clientSnapshotsByClientId: Map<number, ClientSnapshot>
}): LockFreezeResult {
  const frozen: FinanceRunItem[] = []
  const heldToRoll: FinanceRunItem[] = []

  for (const item of args.items) {
    if (item.status === "held") {
      heldToRoll.push(item)
      continue
    }
    if (item.status === "excluded") {
      frozen.push(item)
      continue
    }
    const snap =
      item.clientId != null
        ? args.clientSnapshotsByClientId.get(item.clientId) ?? null
        : null
    frozen.push({
      ...item,
      clientSnapshotJson: snap,
      status: item.status === "pending" || item.status === "stale" ? "approved" : item.status,
    })
  }

  return { frozen, heldToRoll }
}

/** Build roll-forward candidates for next period's run from held items. */
export function buildHeldRollCandidates(
  held: FinanceRunItem[]
): Array<{
  source: FinanceRunItem["source"]
  naturalKey: string
  mbaNumber: string | null
  clientId: number | null
  versionId: number | null
  sowId: number | null
  lineItemsJson: unknown
  amountCents: number
  invoiceReference: string
  heldReason: string
  rolledFromItemId: number
}> {
  return held.map((h) => ({
    source: h.source,
    naturalKey: h.naturalKey,
    mbaNumber: h.mbaNumber,
    clientId: h.clientId,
    versionId: h.versionId,
    sowId: h.sowId,
    lineItemsJson: h.lineItemsJson,
    amountCents: h.amountCents,
    invoiceReference: h.invoiceReference,
    heldReason: h.holdReason || "Rolled from prior period hold",
    rolledFromItemId: h.id,
  }))
}
