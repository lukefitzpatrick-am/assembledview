import assert from "node:assert/strict"
import test from "node:test"

import { fyToRange, monthKeyInFyRange } from "../fyToRange.js"
import { queryScheduleMonthsTool } from "../queryScheduleMonths.js"
import { endAvaClient } from "@/db/avaClient"
import type { AvaToolContext } from "../types.js"

test("fyToRange(2026) is AU FY ending year Jul 2025–Jun 2026", () => {
  const r = fyToRange(2026)
  assert.equal(r.startMonth, "2025-07")
  assert.equal(r.endMonthExclusive, "2026-07")
  assert.equal(r.startDate, "2025-07-01")
  assert.equal(r.endDateExclusive, "2026-07-01")
  assert.equal(r.range, "2025-07..2026-06")
})

test("fyToRange boundaries: inclusive start, exclusive end", () => {
  const r = fyToRange(2026)
  // Months in range: >= 2025-07 and < 2026-07
  assert.ok(r.startMonth >= "2025-07")
  assert.ok("2025-07" >= r.startMonth && "2025-07" < r.endMonthExclusive)
  assert.ok("2026-06" >= r.startMonth && "2026-06" < r.endMonthExclusive)
  assert.equal("2026-07" < r.endMonthExclusive, false)
  assert.equal("2025-06" >= r.startMonth, false)
  // Date form: >= 1 Jul 2025 AND < 1 Jul 2026
  assert.ok(r.startDate <= "2025-07-01" && "2025-07-01" < r.endDateExclusive)
  assert.ok("2026-06-01" >= r.startDate && "2026-06-01" < r.endDateExclusive)
  assert.equal("2026-07-01" < r.endDateExclusive, false)
})

test("fyToRange(2025) is prior AU FY Jul 2024–Jun 2025", () => {
  const r = fyToRange(2025)
  assert.equal(r.range, "2024-07..2025-06")
  assert.equal(r.startDate, "2024-07-01")
  assert.equal(r.endDateExclusive, "2025-07-01")
})

/** Mock golden: BOSS001 schedule months sit entirely in FY2026 (ending year). */
test("BOSS001 mock: fy=2026 sums 244988.23; fy=2025 excludes all months", () => {
  // Verified live: published BOSS001 is entirely 2025-09..2026-06 = FY2026, $244,988.23
  const bossMonths: { month: string; amount_aud: number }[] = [
    { month: "2025-09", amount_aud: 50000 },
    { month: "2025-12", amount_aud: 50000 },
    { month: "2026-03", amount_aud: 50000 },
    { month: "2026-06", amount_aud: 94988.23 },
  ]

  const fy2026 = fyToRange(2026)
  const in2026 = bossMonths.filter((m) => monthKeyInFyRange(m.month, fy2026))
  const sum2026 =
    Math.round(in2026.reduce((s, m) => s + m.amount_aud, 0) * 100) / 100
  assert.equal(fy2026.range, "2025-07..2026-06")
  assert.equal(sum2026, 244988.23)
  assert.equal(in2026.length, bossMonths.length)

  const fy2025 = fyToRange(2025)
  const in2025 = bossMonths.filter((m) => monthKeyInFyRange(m.month, fy2025))
  assert.equal(in2025.length, 0)
  assert.equal(fy2025.range, "2024-07..2025-06")
})

function adminContext(overrides: Partial<AvaToolContext> = {}): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: undefined,
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: "admin-1",
    userEmail: "admin@example.com",
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    capturedLineItemsLoad: null,
    currentLineItems: null,
    ...overrides,
  }
}

/**
 * Golden: BOSS001 published schedule is entirely FY2026 (ending year).
 * Live-tagged — skips when AVA_DATABASE_URL is unset.
 */
test("BOSS001 fy=2026 totals 244988.23; fy=2025 = 0 rows (live)", async (t) => {
  if (!process.env.AVA_DATABASE_URL?.trim()) {
    t.skip("AVA_DATABASE_URL unset — live golden skipped")
    return
  }

  try {
    const ctx = adminContext()
    const fy2026 = await queryScheduleMonthsTool.execute(
      { mba: "BOSS001", fy: 2026, basis: "billing" },
      ctx,
    )
    assert.equal(fy2026.isError, false, fy2026.content)
    const body2026 = JSON.parse(fy2026.content) as {
      total_planned_aud: number
      total_line_rows: number
      fy: number
      range: string
      per_month: { month: string; amount_aud: number }[]
    }
    assert.equal(body2026.fy, 2026)
    assert.equal(body2026.range, "2025-07..2026-06")
    assert.equal(body2026.total_planned_aud, 244988.23)
    assert.ok(body2026.total_line_rows > 0)

    const fy2025 = await queryScheduleMonthsTool.execute(
      { mba: "BOSS001", fy: 2025, basis: "billing" },
      ctx,
    )
    assert.equal(fy2025.isError, false, fy2025.content)
    const body2025 = JSON.parse(fy2025.content) as {
      total_planned_aud: number
      total_line_rows: number
      range: string
    }
    assert.equal(body2025.range, "2024-07..2025-06")
    assert.equal(body2025.total_line_rows, 0)
    assert.equal(body2025.total_planned_aud, 0)
  } finally {
    await endAvaClient()
  }
})
