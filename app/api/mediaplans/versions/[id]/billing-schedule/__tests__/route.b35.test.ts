/**
 * B35 (MB-37): PATCH /api/mediaplans/versions/[id]/billing-schedule refuses a
 * sent schedule with an old-id row and its current-id row carrying money in
 * the same month, when `billing_ghost_row_finance_guard` is on. Nothing is
 * written. Off, or a failed switch read: saved as before.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { buildBillingScheduleJSON } from "@/lib/billing/buildBillingSchedule"
import type { BillingMonth } from "@/lib/billing/types"
import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

type Gate = { session: { user: { email: string } }; roles: string[] } | { response: NextResponse }
const financeAdmin: Gate = { session: { user: { email: "finance@assembledmedia.com.au" } }, roles: ["finance_admin"] }
const requireFinanceAdminMock = mock.fn(async (): Promise<Gate> => financeAdmin)
let switchOn: boolean | "throw" = true
const isFeatureOnMock = mock.fn(async (key: string) => {
  assert.equal(key, "billing_ghost_row_finance_guard")
  if (switchOn === "throw") throw new Error("feature_switches unavailable")
  return switchOn
})
const patchMock = mock.fn(async (input: { versionId: number; billingSchedule: unknown }) => ({
  ok: true,
  versionId: input.versionId,
  mbaNumber: "malay004",
  legacySchedules: { billingSchedule: input.billingSchedule, deliverySchedule: null },
}))
class BillingScheduleWriteError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

const versionRow = {
  id: 19001,
  mbaNumber: "malay004",
  campaignStartDate: "2026-06-01",
  campaignEndDate: "2026-06-30",
  legacySchedules: { billingSchedule: [] },
}
const chain = {
  select: () => chain,
  from: () => chain,
  where: () => chain,
  limit: async () => [versionRow],
}

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", { namedExports: { requireFinanceAdmin: requireFinanceAdminMock } })
  await mock.module("@/db", {
    namedExports: { getDb: () => chain, schema: { mediaPlanVersions: { id: "id" } } },
  })
  await mock.module("@/lib/features/server", { namedExports: { isFeatureOn: isFeatureOnMock } })
  await mock.module("@/lib/data/writeBillingSchedule", {
    namedExports: { patchBillingScheduleOnPostgres: patchMock, BillingScheduleWriteError },
  })
  await mock.module("@/lib/data/readFinance", { namedExports: { readBillingOverridesForVersion: async () => [] } })
  await mock.module("@/lib/auth/getCurrentUser", { namedExports: { getCurrentUser: async () => null } })
  await mock.module("@/lib/finance/relevantPlanVersions", { namedExports: { clearRelevantPlanVersionsCache: () => {} } })
  await mock.module("@/lib/finance/writeFinanceAuditEdits", {
    namedExports: { writeScheduleDiffEdits: async () => ({ attempted: 0, succeeded: 0 }) },
  })
}

const { PATCH } = await import("../route")

const JUNE = "June 2026"
function sched(rows: Array<[string, number]>): unknown {
  const months: BillingMonth[] = [
    {
      monthYear: JUNE,
      mediaTotal: "$0.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: "$0.00",
      mediaCosts: {} as BillingMonth["mediaCosts"],
      lineItems: {
        ooh: rows.map(([id, amount]) => ({ id, header1: "Pub", header2: "Site", monthlyAmounts: { [JUNE]: amount }, totalAmount: amount })),
      } as BillingMonth["lineItems"],
    },
  ]
  return buildBillingScheduleJSON(months)
}
const doubled = sched([["billing-ooh::malay004ML1", 37000], ["billing-ooh::malay004OH1", 37000]])
const clean = sched([["billing-ooh::malay004OH1", 37000]])

const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/mediaplans/versions/19001/billing-schedule", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "19001" }),
  })

test("switch on: a doubled schedule is 409 BILLING_ALIAS_GHOST_ROWS and nothing is written", { skip }, async () => {
  switchOn = true
  const writes = patchMock.mock.callCount()
  const res = await patch({ billingSchedule: doubled })
  assert.equal(res.status, 409)
  const body = (await res.json()) as { code: string; error: string; lines: unknown[]; doubledTotal: number }
  assert.equal(body.code, "BILLING_ALIAS_GHOST_ROWS")
  assert.equal(body.doubledTotal, 37000)
  assert.equal(body.lines.length, 1)
  assert.match(body.error, /malay004ML1 is a duplicate of malay004OH1 \(June 2026 \$37,000\.00 and \$37,000\.00\)/)
  assert.equal(patchMock.mock.callCount(), writes, "no write")
})

test("switch on: a clean schedule saves", { skip }, async () => {
  switchOn = true
  const writes = patchMock.mock.callCount()
  const res = await patch({ billingSchedule: clean })
  assert.equal(res.status, 200)
  assert.equal(patchMock.mock.callCount(), writes + 1)
})

test("switch off, or a failed switch read: the doubled schedule saves as before", { skip }, async () => {
  for (const state of [false, "throw"] as const) {
    switchOn = state
    const writes = patchMock.mock.callCount()
    const res = await patch({ billingSchedule: doubled })
    assert.equal(res.status, 200, String(state))
    assert.equal(patchMock.mock.callCount(), writes + 1, String(state))
  }
  switchOn = true
})

test("the role gate runs first and the switch is not read for a refused caller", { skip }, async () => {
  const reads = isFeatureOnMock.mock.callCount()
  requireFinanceAdminMock.mock.mockImplementationOnce(async () => ({ response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }))
  assert.equal((await patch({ billingSchedule: doubled })).status, 403)
  assert.equal(isFeatureOnMock.mock.callCount(), reads)
})
