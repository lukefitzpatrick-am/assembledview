import type { CampaignRead } from "./types"

/** Shown beside "Read as at" when the visible read is older than a week. */
export const CAMPAIGN_READ_OUT_OF_DATE_CUE =
  "Out of date. Regenerate for current figures."

const OUT_OF_DATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

function rowInstant(row: CampaignRead): number {
  const at = Date.parse(row.generatedAt)
  return Number.isFinite(at) ? at : 0
}

/** Newer generated_at wins. The same instant uses the higher id, matching the list order. */
function isNewer(a: CampaignRead, b: CampaignRead): boolean {
  const ta = rowInstant(a)
  const tb = rowInstant(b)
  if (ta !== tb) return ta > tb
  return a.id > b.id
}

/**
 * The failure to show for one MBA version.
 * A failed row older than the newest draft or published read is ignored.
 * A failure is shown only when that failed row is the newest row.
 */
export function campaignReadFailureToShow(rows: readonly CampaignRead[]): CampaignRead | null {
  let newest: CampaignRead | null = null
  for (const row of rows) {
    if (!newest || isNewer(row, newest)) newest = row
  }
  if (!newest || newest.status !== "failed") return null
  return newest
}

/** True when the read-as-at instant is more than 7 days before `now`. */
export function campaignReadIsOutOfDate(
  asAtISO: string | null | undefined,
  now: Date,
): boolean {
  if (!asAtISO) return false
  const at = Date.parse(asAtISO)
  if (!Number.isFinite(at)) return false
  return now.getTime() - at > OUT_OF_DATE_AFTER_MS
}
