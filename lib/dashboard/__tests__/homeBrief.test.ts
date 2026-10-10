import { describe, expect, it } from "vitest"

import {
  countCampaignStartsWithinDays,
  formatHomeStartDay,
  homeAttentionLede,
  homeSpendInsight,
  plannedBarsFromClientMonths,
} from "@/lib/dashboard/homeBrief"

describe("home attention lede", () => {
  it("says everything is pacing to plan when the count is 0", () => {
    expect(homeAttentionLede(0)).toBe("Everything is pacing to plan.")
  })

  it("names the count when campaigns need a look", () => {
    expect(homeAttentionLede(3)).toBe(
      "3 campaigns need a look today. Everything else is pacing to plan.",
    )
    expect(homeAttentionLede(1)).toBe(
      "1 campaign needs a look today. Everything else is pacing to plan.",
    )
  })
})

describe("home start window", () => {
  it("counts starts from today through 14 days and formats the day", () => {
    const plans = [
      { mp_campaigndates_start: "2026-10-10" },
      { mp_campaigndates_start: "2026-10-12" },
      { mp_campaigndates_start: "2026-10-24" },
      { mp_campaigndates_start: "2026-10-25" },
    ]
    expect(countCampaignStartsWithinDays(plans, 14, "2026-10-10")).toBe(3)
    expect(formatHomeStartDay("2026-10-12")).toBe("12 Oct")
  })
})

describe("home spend insight", () => {
  it("states last month's planned total and does not invent delivered", () => {
    const bars = plannedBarsFromClientMonths(
      [{ month: "Sep", data: [{ amount: 420000 }, { amount: 11000 }] }],
      "2026-10-10",
    )
    expect(bars.find((bar) => bar.month === "Oct")?.inProgress).toBe(true)
    expect(homeSpendInsight(bars, "2026-10-10")).toBe(
      "September planned $431.0K. Delivered by month is not loaded on Home.",
    )
  })
})
