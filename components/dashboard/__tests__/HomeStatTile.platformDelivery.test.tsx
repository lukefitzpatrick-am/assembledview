/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import {
  homePlatformDeliveryLabel,
  platformLiveFromPortfolioBody,
} from "@/lib/dashboard/homeBrief"

import { HomeStatTile } from "../HomeStatTile"

const starts = { dotClass: "bg-am-lime", text: "4 start in the next 14 days" }

function tile(body: Parameters<typeof platformLiveFromPortfolioBody>[0]) {
  const live = platformLiveFromPortfolioBody(body)
  return renderToStaticMarkup(
    <HomeStatTile
      label="Live campaigns"
      value="38"
      detail={starts}
      platformDelivery={live == null ? null : homePlatformDeliveryLabel(live)}
    />,
  )
}

describe("live campaigns platform delivery line", () => {
  it("shows counts.live beside the start window", () => {
    const html = tile({ counts: { live: 33 } })
    expect(html).toContain("38")
    expect(html).toContain("4 start in the next 14 days")
    expect(html).toContain("33 with platform delivery")
  })

  it("hides the line when counts.live is absent, zero, or the snapshot is stale", () => {
    for (const body of [
      { counts: { attention: 5 } },
      { counts: { live: 0 } },
      { stale: { asOf: "2026-10-10" }, counts: { live: 33 } },
      null,
    ]) {
      const html = tile(body)
      expect(html).toContain("4 start in the next 14 days")
      expect(html).not.toContain("with platform delivery")
      expect(html).not.toContain(">0<")
    }
  })
})
