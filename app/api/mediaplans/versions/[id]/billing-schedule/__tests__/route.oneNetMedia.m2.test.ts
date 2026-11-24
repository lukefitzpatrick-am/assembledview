/**
 * M2 (C-417): the billing-schedule PATCH regenerate reads `one_net_media`
 * through `readDeliveryFlags` and hands it to the server recompute, so the
 * recompute's planned deliverables match the editor's.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

let oneNetMedia = true
const recomputeMock = mock.fn((_args: { opts?: { oneNetMedia?: boolean } }) => ({
  ok: true,
  billingSchedule: [],
  deliverySchedule: [],
  inputs_hash: "h",
  rebill_needed: false,
  generatedFromServer: true,
}))
const versionRow = {
  id: 19002,
  mbaNumber: "m2edge001",
  campaignStartDate: "2026-03-01",
  campaignEndDate: "2026-03-31",
  legacySchedules: { billingSchedule: [] },
}
const chain = { select: () => chain, from: () => chain, where: () => chain, limit: async () => [versionRow] }

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireFinanceAdmin: async () => ({ session: { user: { email: "finance@assembledmedia.com.au" } }, roles: ["finance_admin"] }) },
  })
  await mock.module("@/db", { namedExports: { getDb: () => chain, schema: { mediaPlanVersions: { id: "id" } } } })
  await mock.module("@/lib/features/server", { namedExports: { isFeatureOn: async () => false } })
  await mock.module("@/lib/delivery/deliveryFlags.server", {
    namedExports: {
      readDeliveryFlags: async () => ({ packageNoUnitTarget: false, fixedCostReportNet: false, fixedCostFromDate: false, oneNetMedia }),
    },
  })
  await mock.module("@/lib/finance/recomputeBillingScheduleOnSave", {
    namedExports: { recomputeAndValidateBillingScheduleOnSave: recomputeMock },
  })
  await mock.module("@/lib/data/writeBillingSchedule", {
    namedExports: {
      patchBillingScheduleOnPostgres: async (input: { versionId: number; billingSchedule: unknown }) => ({
        ok: true,
        versionId: input.versionId,
        mbaNumber: "m2edge001",
        legacySchedules: { billingSchedule: input.billingSchedule, deliverySchedule: null },
      }),
      BillingScheduleWriteError: class extends Error {},
    },
  })
  await mock.module("@/lib/data/readFinance", { namedExports: { readBillingOverridesForVersion: async () => [] } })
  await mock.module("@/lib/auth/getCurrentUser", { namedExports: { getCurrentUser: async () => null } })
  await mock.module("@/lib/finance/relevantPlanVersions", { namedExports: { clearRelevantPlanVersionsCache: () => {} } })
  await mock.module("@/lib/finance/writeFinanceAuditEdits", {
    namedExports: { writeScheduleDiffEdits: async () => ({ attempted: 0, succeeded: 0 }) },
  })
}

const { PATCH } = await import("../route")

const regenerate = () =>
  PATCH(
    new NextRequest("http://localhost/api/mediaplans/versions/19002/billing-schedule", {
      method: "PATCH",
      body: JSON.stringify({ lineItems: [{ lineItemId: "search-1" }], feeLoading: { feesearch: 7 } }),
    }),
    { params: Promise.resolve({ id: "19002" }) },
  )

test("the regenerate hands the switch read to the recompute, on and off", { skip }, async () => {
  for (const value of [true, false]) {
    oneNetMedia = value
    const calls = recomputeMock.mock.callCount()
    const res = await regenerate()
    assert.equal(res.status, 200, String(value))
    assert.equal(recomputeMock.mock.callCount(), calls + 1)
    assert.equal(recomputeMock.mock.calls.at(-1)!.arguments[0].opts?.oneNetMedia, value)
  }
})
