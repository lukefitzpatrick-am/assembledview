/**
 * Mark-billed echo: Postgres stores cents and reconstitutes dollars (cents/100).
 * Compare at cents so a 3dp total does not 502 after a successful write.
 */

export function billedSnapshotAmountEchoOk(
  echoedBilledAmount: unknown,
  billedAmount: number
): boolean {
  const echoAmount = Number(echoedBilledAmount)
  if (!Number.isFinite(echoAmount) || !Number.isFinite(billedAmount)) return false
  return Math.round(echoAmount * 100) === Math.round(billedAmount * 100)
}
