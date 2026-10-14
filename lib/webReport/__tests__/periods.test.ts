import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveReportWindows } from "../periods"

describe("report windows", () => {
  it("previous month is the month before the last complete month", () => {
    const windows = resolveReportWindows("last_month", "2026-10-14")
    assert.deepEqual(windows.current, { from: "2026-09-01", to: "2026-09-30" })
    assert.deepEqual(windows.previous, { from: "2026-08-01", to: "2026-08-31" })
    assert.equal(windows.phrase, "September 2026")
    assert.equal(windows.comparedWith, "August 2026")
  })

  it("January uses December of the previous year", () => {
    const windows = resolveReportWindows("last_month", "2026-01-03")
    assert.deepEqual(windows.current, { from: "2025-12-01", to: "2025-12-31" })
    assert.deepEqual(windows.previous, { from: "2025-11-01", to: "2025-11-30" })
  })

  it("previous 28 days sits immediately before the current 28", () => {
    const windows = resolveReportWindows("last_28_days", "2026-10-14")
    assert.deepEqual(windows.current, { from: "2026-09-17", to: "2026-10-14" })
    assert.deepEqual(windows.previous, { from: "2026-08-20", to: "2026-09-16" })
  })

  it("same month last year keeps the day, and clamps 29 February", () => {
    const october = resolveReportWindows("month_to_date_yoy", "2026-10-14")
    assert.deepEqual(october.current, { from: "2026-10-01", to: "2026-10-14" })
    assert.deepEqual(october.previous, { from: "2025-10-01", to: "2025-10-14" })
    const leap = resolveReportWindows("month_to_date_yoy", "2024-02-29")
    assert.deepEqual(leap.previous, { from: "2023-02-01", to: "2023-02-28" })
  })
})
