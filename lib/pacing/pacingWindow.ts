import { getMelbourneTodayISO as melbourneTodayISO } from "@/lib/dates/melbourne"

/**
 * Today (calendar date) in Australia/Melbourne as ISO yyyy-MM-dd. B43: one
 * helper family, `lib/dates/melbourne.ts` (same output, pinned by
 * `dateHelpers.b43.test.ts`).
 */
export function getMelbourneTodayISO(): string {
  return melbourneTodayISO(new Date())
}

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
