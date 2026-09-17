export const CAMPAIGN_READ_POLL_INTERVAL_MS = 3_000
export const CAMPAIGN_READ_POLL_MAX_MS = 3 * 60 * 1000
export const CAMPAIGN_READ_STILL_WRITING = "Still writing, refresh to check"

export const CAMPAIGN_READ_POLL_FETCH_INIT = {
  credentials: "include",
  cache: "no-store",
} as const

export function campaignReadPollShouldStop(
  startedAtMs: number,
  nowMs: number,
  maxMs = CAMPAIGN_READ_POLL_MAX_MS,
): boolean {
  return nowMs - startedAtMs >= maxMs
}
