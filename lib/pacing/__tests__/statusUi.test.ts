import { describe, expect, it } from "vitest"

import {
  kpiStatusPresentation,
  pacingStatus,
  pacingStatusFromBand,
  statusLegendItems,
} from "@/lib/pacing/status"

describe("pacingStatus", () => {
  it("splits slightly_over (ahead/attention) from over_pacing (problem)", () => {
    const ahead = pacingStatus("slightly_over")
    expect(ahead.status).toBe("ahead")
    expect(ahead.label).toBe("Ahead")
    expect(ahead.role).toBe("attention")

    const over = pacingStatus("over_pacing")
    expect(over.status).toBe("over-pacing")
    expect(over.label).toBe("Over-pacing")
    expect(over.role).toBe("problem")
  })

  it("maps no_delivery to Behind (same tile bucket)", () => {
    const r = pacingStatus("no_delivery")
    expect(r.status).toBe("behind")
    expect(r.label).toBe("Behind")
  })

  it("resolves band labels for Status cells", () => {
    expect(pacingStatusFromBand("over-pacing").label).toBe("Over-pacing")
    expect(pacingStatusFromBand("behind").label).toBe("Behind")
  })

  it("legend covers all six UI states", () => {
    const statuses = statusLegendItems().map((i) => i.status)
    expect(statuses).toEqual([
      "behind",
      "on-track",
      "ahead",
      "over-pacing",
      "no-data",
      "kpi-pending",
    ])
  })

  it("KPI No delivery is problem; KPIs on track is ok", () => {
    expect(kpiStatusPresentation("kpi-no-delivery").role).toBe("problem")
    expect(kpiStatusPresentation("kpi-on-track").role).toBe("ok")
  })
})
