/**
 * Today (calendar date) in Australia/Melbourne as ISO yyyy-MM-dd.
 */
export function getMelbourneTodayISO(): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(now)
  const year = parts.find((p) => p.type === "year")?.value ?? ""
  const month = parts.find((p) => p.type === "month")?.value ?? ""
  const day = parts.find((p) => p.type === "day")?.value ?? ""
  return `${year}-${month}-${day}`
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
