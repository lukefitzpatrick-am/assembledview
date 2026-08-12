import assert from "node:assert/strict"
import test from "node:test"

import { AVA_ROW_CAP, AVA_SEARCH_CAP, withRowCap } from "@/db/avaClient"
import { AVA_TOOL_NAMES } from "../summaries.js"
import {
  AVA_DB_NOT_CONFIGURED,
  burstBudgetDollars,
  centsToDollars,
  parseZodOrError,
  requireAvaDbOrSoftFail,
  summariseAttrs,
  summariseBursts,
} from "../postgresShared.js"
import { queryCampaignLinesInput, queryCampaignLinesTool } from "../queryCampaignLines.js"
import { queryScheduleMonthsInput } from "../queryScheduleMonths.js"
import { searchLineItemsInput } from "../searchLineItems.js"
import { queryFinanceSummaryInput } from "../queryFinanceSummary.js"
import { queryXeroStatusInput, queryXeroStatusTool } from "../queryXeroStatus.js"
import type { AvaToolContext } from "../types.js"

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

test("AVA_TOOL_NAMES includes insights + postgres tools in order", () => {
  // Named slice — bare length alone would miss a mid-list swap.
  assert.deepEqual(AVA_TOOL_NAMES.slice(-7), [
    "get_client_insights",
    "get_campaign_insights",
    "query_campaign_lines",
    "query_schedule_months",
    "search_line_items",
    "query_finance_summary",
    "query_xero_status",
  ])
})

test("centsToDollars converts at 2dp", () => {
  assert.equal(centsToDollars(12345), 123.45)
  assert.equal(centsToDollars(1), 0.01)
  assert.equal(centsToDollars(0), 0)
  assert.equal(centsToDollars(null), 0)
  assert.equal(centsToDollars(undefined), 0)
})

test("withRowCap truncates and reports total", () => {
  const rows = Array.from({ length: 10 }, (_, i) => i)
  const capped = withRowCap(rows, 3)
  assert.equal(capped.truncated, true)
  assert.equal(capped.total, 10)
  assert.deepEqual(capped.rows, [0, 1, 2])

  const full = withRowCap(rows, 50)
  assert.equal(full.truncated, false)
  assert.equal(full.total, 10)
  assert.equal(AVA_ROW_CAP, 500)
  assert.equal(AVA_SEARCH_CAP, 200)
})

test("burstBudgetDollars + summariseBursts (no raw jsonb leak)", () => {
  const bursts = [
    { budget: "$1,000.50", startDate: "2025-07-01", endDate: "2025-07-31" },
    { budget: 500, startDate: "2025-08-01", endDate: "2025-08-15" },
  ]
  assert.equal(burstBudgetDollars(bursts), 1500.5)
  const summary = summariseBursts(bursts)
  assert.equal(summary.burstCount, 2)
  assert.equal(summary.budgetAud, 1500.5)
  assert.equal(summary.startDate, "2025-07-01")
  assert.equal(summary.endDate, "2025-08-15")

  const attrs = summariseAttrs({
    placement: "Homepage",
    creative: "Hero",
    secretBlob: { nested: true },
    network: "Seven",
  })
  assert.deepEqual(attrs, {
    placement: "Homepage",
    creative: "Hero",
    network: "Seven",
  })
  assert.equal("secretBlob" in attrs, false)
})

test("zod input validation for postgres tools", () => {
  assert.equal(queryCampaignLinesInput.safeParse({ mba: "MBA1", version: 2 }).success, true)
  assert.equal(queryCampaignLinesInput.safeParse({ version: -1 }).success, false)
  assert.equal(queryCampaignLinesInput.safeParse({ mba: 12 }).success, false)

  assert.equal(
    queryScheduleMonthsInput.safeParse({ mba: "X", basis: "billing", component: "media" })
      .success,
    true,
  )
  assert.equal(
    queryScheduleMonthsInput.safeParse({ mba: "X", basis: "cash" }).success,
    false,
  )

  assert.equal(searchLineItemsInput.safeParse({ channel: "prog_video" }).success, true)
  assert.equal(searchLineItemsInput.safeParse({ channel: "not_a_channel" }).success, false)
  assert.equal(searchLineItemsInput.safeParse({ minBudget: -5 }).success, false)

  assert.equal(queryFinanceSummaryInput.safeParse({ mba: "MBA1" }).success, true)
  assert.equal(queryFinanceSummaryInput.safeParse({ client: "Acme" }).success, true)
  assert.equal(queryFinanceSummaryInput.safeParse({ fy: 2025 }).success, false)

  assert.equal(queryXeroStatusInput.safeParse({ overdueOnly: true }).success, true)
  assert.equal(queryXeroStatusInput.safeParse({ overdueOnly: "yes" }).success, false)

  const bad = parseZodOrError(queryCampaignLinesInput, { version: "nope" })
  assert.equal(bad.ok, false)
})

test("unset AVA_DATABASE_URL soft-fails without throwing", async () => {
  const prev = process.env.AVA_DATABASE_URL
  delete process.env.AVA_DATABASE_URL
  try {
    const gate = requireAvaDbOrSoftFail()
    assert.equal(gate.ok, false)
    if (!gate.ok) {
      assert.match(gate.result.content, /not configured/)
      assert.equal(gate.result.isError, false)
    }

    const result = await queryCampaignLinesTool.execute({ mba: "MBA1" }, adminContext())
    assert.equal(result.isError, false)
    assert.equal(result.content, AVA_DB_NOT_CONFIGURED)

    const xero = await queryXeroStatusTool.execute({}, adminContext())
    assert.equal(xero.isError, false)
    assert.equal(xero.content, AVA_DB_NOT_CONFIGURED)
  } finally {
    if (prev === undefined) delete process.env.AVA_DATABASE_URL
    else process.env.AVA_DATABASE_URL = prev
  }
})
