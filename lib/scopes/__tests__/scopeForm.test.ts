import assert from "node:assert/strict"
import test from "node:test"
import {
  coerceMoney,
  describeScopeFormErrors,
  normaliseScopeCostRows,
  resolveScopeIdForSave,
  scopeValidationToastDescription,
} from "../scopeForm.js"

test("coerceMoney: numeric strings become numbers", () => {
  assert.equal(coerceMoney("4500"), 4500)
  assert.equal(coerceMoney("4,500.50"), 4500.5)
  assert.equal(coerceMoney("$1,234"), 1234)
  assert.equal(coerceMoney(4000), 4000)
})

test("coerceMoney: empty, junk and non-finite become 0", () => {
  assert.equal(coerceMoney(""), 0)
  assert.equal(coerceMoney("abc"), 0)
  assert.equal(coerceMoney(null), 0)
  assert.equal(coerceMoney(undefined), 0)
  assert.equal(coerceMoney(Number.NaN), 0)
})

test("normaliseScopeCostRows: string costs typed before blur are coerced, other fields kept", () => {
  const out = normaliseScopeCostRows({
    cost: [
      { expense_category: "SEO", description: "Monthly", cost: "4500" },
      { expense_category: "", description: "", cost: 0 },
    ],
    billing_schedule: [
      { month: "2026-10", cost: "4,500" },
      { month: "2026-11", cost: 4000 },
    ],
  })
  assert.deepEqual(out.cost.map((r) => r.cost), [4500, 0])
  assert.equal(out.cost[0].expense_category, "SEO")
  assert.deepEqual(out.billing_schedule, [
    { month: "2026-10", cost: 4500 },
    { month: "2026-11", cost: 4000 },
  ])
})

test("describeScopeFormErrors: names top-level and row fields", () => {
  const errors = {
    contact_email: { message: "Invalid email address" },
    cost: [undefined, { cost: { message: "Cost must be a number" } }],
    billing_schedule: {
      root: { message: "At least one billing schedule item is required" },
      2: { month: { message: "Month is required" }, cost: { message: "Cost must be a number" } },
    },
  }
  assert.deepEqual(describeScopeFormErrors(errors), [
    "Contact email",
    "Cost line 2 amount",
    "Billing schedule: At least one billing schedule item is required",
    "Billing row 3 month",
    "Billing row 3 amount",
  ])
})

test("scopeValidationToastDescription: lists the failing fields", () => {
  assert.equal(
    scopeValidationToastDescription({ project_name: { message: "Project name is required" } }),
    "Fix: Project name."
  )
  assert.equal(scopeValidationToastDescription({}), "Check the highlighted fields.")
})

test("resolveScopeIdForSave: stored id never changes when the version goes up", () => {
  for (const scopeVersion of [5, 6, 7, 42]) {
    assert.equal(
      resolveScopeIdForSave({
        storedScopeId: "gogolf_sow005",
        clientMbaIdentifier: "gogolf",
        scopeVersion,
      }),
      "gogolf_sow005"
    )
  }
})

test("resolveScopeIdForSave: stored id kept even when the client prefix differs in case", () => {
  assert.equal(
    resolveScopeIdForSave({ storedScopeId: "GOGOLF_sow004", clientMbaIdentifier: "gogolf", scopeVersion: 6 }),
    "GOGOLF_sow004"
  )
})

test("resolveScopeIdForSave: legacy row with no id gets one generated", () => {
  assert.equal(
    resolveScopeIdForSave({ storedScopeId: "", clientMbaIdentifier: "hartm", scopeVersion: 2 }),
    "hartm_sow002"
  )
  assert.equal(resolveScopeIdForSave({ storedScopeId: null, clientMbaIdentifier: "" }), "")
})
