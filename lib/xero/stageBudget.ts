/**
 * Wall-clock budget for one Xero cron stage.
 * The stage returns incomplete when the budget is spent so Vercel does not
 * kill the function before the xero_sync_log row is updated.
 */

export type StageBudget = {
  limitMs: number
  startedAtMs: number
  now: () => number
}

export type StageBudgetTick =
  | { status: "running"; elapsed_ms: number }
  | { status: "incomplete"; elapsed_ms: number }

export function startStageBudget(
  limitMs: number,
  now: () => number = Date.now,
): StageBudget {
  return { limitMs, startedAtMs: now(), now }
}

/** Incomplete once elapsed time reaches the limit, including exactly on it. */
export function tickStageBudget(budget: StageBudget): StageBudgetTick {
  const elapsed_ms = budget.now() - budget.startedAtMs
  if (elapsed_ms >= budget.limitMs) {
    return { status: "incomplete", elapsed_ms }
  }
  return { status: "running", elapsed_ms }
}

export function stageBudgetRemainingMs(budget: StageBudget): number {
  return budget.limitMs - (budget.now() - budget.startedAtMs)
}
