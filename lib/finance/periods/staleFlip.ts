import type { FinanceRunItem } from "@/lib/finance/periods/types"

/**
 * On publish after a run: flip matching run items to stale (finance notified separately).
 * Match by mba + version or natural key.
 */
export function flipStaleOnPublish(args: {
  items: FinanceRunItem[]
  mbaNumber: string
  versionId?: number | null
}): { items: FinanceRunItem[]; flippedIds: number[] } {
  const mba = String(args.mbaNumber ?? "").trim().toUpperCase()
  const flippedIds: number[] = []
  const items = args.items.map((item) => {
    if (item.source !== "media") return item
    if (String(item.mbaNumber ?? "").trim().toUpperCase() !== mba) return item
    if (item.status === "excluded" || item.status === "held") return item
    if (args.versionId != null && item.versionId != null && item.versionId !== args.versionId) {
      // Still mark stale — published tip changed the billable shape for this MBA
    }
    if (item.status === "stale") return item
    flippedIds.push(item.id)
    return { ...item, status: "stale" as const }
  })
  return { items, flippedIds }
}

export type StaleResolution = "resnapshot" | "keep"

export function resolveStaleItem(
  item: FinanceRunItem,
  resolution: StaleResolution,
  resnapshot?: Partial<FinanceRunItem>
): FinanceRunItem {
  if (item.status !== "stale") return item
  if (resolution === "keep") {
    return { ...item, status: "approved" }
  }
  return {
    ...item,
    ...resnapshot,
    status: "pending",
  }
}
