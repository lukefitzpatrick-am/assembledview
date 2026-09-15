import assert from "node:assert/strict"
import test from "node:test"

import { plansSaveBodySchema } from "@/lib/mediaplan/plansSaveBodySchema"
import {
  applyMbaScopeLineApprovals,
  buildPersistedMbaScope,
  resolveMbaScopeInput,
  selectedMonthYearsForFinancials,
} from "@/lib/mediaplan/mbaScopeForSave"

const MIN_BODY = {
  masterId: 1,
  mbaNumber: "scope001",
  versionNumber: 1,
  mode: "publish" as const,
  lineItems: [
    {
      lineItemId: "SCOPE001SEA001",
      channel: "search" as const,
      mediaType: "search",
      rate: 1,
      enteredAmount: 100,
    },
  ],
  feeLoading: {},
}

test("plansSaveBodySchema accepts mbaScope and keeps selectedMonthYears", () => {
  const withScope = plansSaveBodySchema.safeParse({
    ...MIN_BODY,
    mbaScope: { lineItemIds: ["SCOPE001SEA001"], monthYears: ["May 2026"] },
  })
  assert.equal(withScope.success, true)
  if (!withScope.success) return
  assert.deepEqual(withScope.data.mbaScope, {
    lineItemIds: ["SCOPE001SEA001"],
    monthYears: ["May 2026"],
  })

  const legacy = plansSaveBodySchema.safeParse({
    ...MIN_BODY,
    selectedMonthYears: ["May 2026"],
  })
  assert.equal(legacy.success, true)
  if (!legacy.success) return
  assert.deepEqual(legacy.data.selectedMonthYears, ["May 2026"])
  assert.equal(legacy.data.mbaScope, undefined)
})

test("resolveMbaScopeInput: mbaScope wins over selectedMonthYears", () => {
  const resolved = resolveMbaScopeInput({
    mbaScope: { lineItemIds: ["A"], monthYears: ["June 2026"] },
    selectedMonthYears: ["May 2026"],
  })
  assert.equal(resolved.source, "mbaScope")
  if (resolved.source !== "mbaScope") return
  assert.deepEqual(resolved.scope, {
    lineItemIds: ["A"],
    monthYears: ["June 2026"],
  })
})

test("resolveMbaScopeInput: selectedMonthYears is legacy months only", () => {
  const resolved = resolveMbaScopeInput({
    selectedMonthYears: ["May 2026"],
  })
  assert.equal(resolved.source, "legacyMonths")
  if (resolved.source !== "legacyMonths") return
  assert.deepEqual(resolved.monthYears, ["May 2026"])
  assert.equal(selectedMonthYearsForFinancials(resolved)![0], "May 2026")
})

test("applyMbaScopeLineApprovals: null = all in; [] = none", () => {
  const lines = [
    { lineItemId: "A", approval: "excluded" as const },
    { lineItemId: "B", approval: "approved" as const },
  ]
  const allIn = applyMbaScopeLineApprovals(lines, null)
  assert.equal(allIn.every((l) => l.approval === "approved"), true)

  const none = applyMbaScopeLineApprovals(lines, [])
  assert.equal(none.every((l) => l.approval === "excluded"), true)

  const subset = applyMbaScopeLineApprovals(lines, ["B"])
  assert.equal(subset.find((l) => l.lineItemId === "A")?.approval, "excluded")
  assert.equal(subset.find((l) => l.lineItemId === "B")?.approval, "approved")
})

test("buildPersistedMbaScope.partial is true when lines or months are a subset", () => {
  const countable = ["A", "B"]
  const months = ["May 2026", "June 2026"]
  const linePartial = buildPersistedMbaScope(
    { lineItemIds: ["A"], monthYears: null },
    countable,
    months
  )
  assert.equal(linePartial.partial, true)

  const monthPartial = buildPersistedMbaScope(
    { lineItemIds: null, monthYears: ["May 2026"] },
    countable,
    months
  )
  assert.equal(monthPartial.partial, true)

  const full = buildPersistedMbaScope(
    { lineItemIds: null, monthYears: null },
    countable,
    months
  )
  assert.equal(full.partial, false)
})
