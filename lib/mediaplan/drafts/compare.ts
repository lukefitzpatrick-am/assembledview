export type DraftTipCompare = {
  added: string[]
  removed: string[]
  kept: string[]
  budgetDeltaCents: number
  linesChanged: number
}

/** Line-level diff vs published tip — no merge engine. */
export function compareDraftToTip(args: {
  tipLineIds: string[]
  draftLineIds: string[]
  tipBudgetCents: number
  draftBudgetCents: number
}): DraftTipCompare {
  const tip = new Set(args.tipLineIds.map(String))
  const draft = new Set(args.draftLineIds.map(String))
  const added = [...draft].filter((id) => !tip.has(id)).sort()
  const removed = [...tip].filter((id) => !draft.has(id)).sort()
  const kept = [...draft].filter((id) => tip.has(id)).sort()
  return {
    added,
    removed,
    kept,
    budgetDeltaCents: Math.round(args.draftBudgetCents) - Math.round(args.tipBudgetCents),
    linesChanged: added.length + removed.length,
  }
}
