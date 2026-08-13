import { describe, expect, it } from "vitest"

import { fmt } from "@/lib/chart-theme"
import { spendInsightsCaption } from "../spendInsightsCaptions"

describe("spendInsightsCaption", () => {
  it("states planned delivery-schedule-month media, excludes fees, and compact total", () => {
    const total = 43_000
    const compact = fmt.currencyCompact(total)
    expect(spendInsightsCaption({ by: "campaign", total })).toBe(
      `planned media by campaign · delivery schedule months · excludes fees · Total: ${compact}`,
    )
    expect(spendInsightsCaption({ by: "type", total })).toBe(
      `planned media by type · delivery schedule months · excludes fees · Total: ${compact}`,
    )
  })

  it("includes the selected range on the monthly stack caption", () => {
    const total = 999
    const compact = fmt.currencyCompact(total)
    expect(
      spendInsightsCaption({ by: "month", total, rangeLabel: "2026–27" }),
    ).toBe(
      `planned media by month · delivery schedule months · excludes fees · 2026–27 · Total: ${compact}`,
    )
  })

  it("does not copy the campaign-page MEDIA_MIX_DONUT_BASIS_CAPTION wording", () => {
    const caption = spendInsightsCaption({ by: "type", total: 100 })
    expect(caption.includes("delivery schedule · planned media")).toBe(false)
  })
})
