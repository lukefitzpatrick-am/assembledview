import type { CampaignPacingRow } from "@/lib/pacing/portfolio/types"

/** Snapshot expected within this many dollars of the fresh schedule figure is kept. */
export const CAMPAIGN_EXPECTED_MATCH_DOLLARS = 1

/**
 * Prefer the portfolio snapshot when its expected matches the delivery-schedule
 * figure. A larger gap uses the fresh row and logs both numbers.
 * No loaded schedule keeps the snapshot so a missed read cannot zero expected.
 */
export function chooseCampaignDetailRow(args: {
  mbaNumber: string
  snapshotRow: CampaignPacingRow | null
  freshRow: CampaignPacingRow | null
  scheduleLoaded: boolean
}): CampaignPacingRow | null {
  const { snapshotRow, freshRow, scheduleLoaded } = args
  if (!scheduleLoaded) return snapshotRow ?? freshRow
  if (!freshRow) return snapshotRow
  if (!snapshotRow) return freshRow
  const delta = Math.abs(snapshotRow.expectedToDate - freshRow.expectedToDate)
  if (delta <= CAMPAIGN_EXPECTED_MATCH_DOLLARS) return snapshotRow
  console.warn(
    `[pacing-detail] campaign expected differs from snapshot for ${args.mbaNumber}: snapshot ${snapshotRow.expectedToDate} fresh ${freshRow.expectedToDate}`,
  )
  return freshRow
}

export function scheduleLoadedForMba(
  schedulesByMba: ReadonlyMap<string, unknown>,
  mbaKey: string,
): boolean {
  if (schedulesByMba.has(mbaKey)) return true
  const prefix = `${mbaKey}:`
  for (const key of schedulesByMba.keys()) {
    if (key.startsWith(prefix)) return true
  }
  return false
}
