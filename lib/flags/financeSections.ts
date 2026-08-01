/**
 * Finance sections IA — always enabled (FN7).
 *
 * Kill-switch removed: classic hub deleted; flag-off was a dead end.
 * Rollback: git revert of the FN7 commit.
 *
 * Export retained so residual callers do not break.
 */
export function isFinanceSectionsEnabled(): boolean {
  return true
}
