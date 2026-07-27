/**
 * Pure helpers for Finance Forecast load request sequencing / abort handling.
 */

export type ForecastLoadResultDisposition = "apply" | "ignore_superseded"

/**
 * Whether a loadForecast response should update UI state.
 * Superseded (stale seq) or aborted in-flight requests must not wipe errors/payloads
 * from a newer request — but they must never look like a user-facing success no-op either.
 */
export function forecastLoadResultDisposition(args: {
  requestSeq: number
  currentSeq: number
  aborted: boolean
}): ForecastLoadResultDisposition {
  if (args.aborted) return "ignore_superseded"
  if (args.requestSeq !== args.currentSeq) return "ignore_superseded"
  return "apply"
}

/** True when an auto-reload effect should refetch (after at least one successful manual/auto load). */
export function shouldAutoReloadForecast(hasSuccessfulLoad: boolean): boolean {
  return hasSuccessfulLoad
}
