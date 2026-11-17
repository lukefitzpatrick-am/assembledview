import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

/**
 * Full campaign window for pacing charts and fetches, plus "as at" for today line and expected-to-date.
 * asAtISO = min(Melbourne today, campaignEnd) as calendar yyyy-MM-dd strings.
 */
export function getPacingWindow(campaignStart: string, campaignEnd: string) {
  const melbourneToday = getMelbourneTodayISO()
  const asAtISO = campaignEnd < melbourneToday ? campaignEnd : melbourneToday
  return {
    campaignStartISO: campaignStart,
    campaignEndISO: campaignEnd,
    asAtISO,
  }
}
