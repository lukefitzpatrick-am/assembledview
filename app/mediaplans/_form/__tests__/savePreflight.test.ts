/**
 * B52: the plan form's save boundary, as behaviour. Replaces the B20 ghost
 * guard source pins (billingAliasGhostGuardWiring.b20) and the create save
 * ladder pins (B7 review 1).
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import { END_BEFORE_START_MESSAGE } from "@/lib/mediaplan/dateOrder"
import { MBA_NUMBER_LOADING_MESSAGE } from "@/lib/mediaplan/createHeldMaster"
import { featureDefinition } from "@/lib/features/registry"

import {
  billingAliasGhostPairsWhenOn,
  keepCurrentBillingRows,
  planSavePreflight,
  type CreateSaveChecks,
  type EditSaveChecks,
} from "../savePreflight"

const MBA = "hema001"

/** One month holding the old `ML` row and the current row for television line 1. */
function ghostMonths(): BillingMonth[] {
  return [
    {
      monthYear: "January 2026",
      mediaTotal: "$200.00",
      feeTotal: "$0.00",
      totalAmount: "$200.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: { television: "$200.00" },
      lineItems: {
        television: [
          { id: `${MBA}TV1`, monthlyAmounts: { "January 2026": 100 } },
          { id: `${MBA}ML1`, monthlyAmounts: { "January 2026": 100 } },
        ],
      },
    } as unknown as BillingMonth,
  ]
}

const editOk: EditSaveChecks = {
  mode: "edit",
  clientsBlocked: false,
  clientsError: null,
  datesOutOfOrder: false,
  duplicateLines: false,
  billingAliasGhostPairs: [],
  billingMonthOrder: [],
  linesStillLoading: false,
  channelLoadFailed: false,
  channelLoadFailedReason: null,
  billingOverridesLoadState: "loaded",
  pendingBillingOverrideCount: 0,
}

const createOk: CreateSaveChecks = {
  mode: "create",
  clientsBlocked: false,
  clientsError: null,
  datesOutOfOrder: false,
  saveInFlight: false,
  mbaNumberPending: false,
  mbaNumberProblem: null,
}

test("switch billing_ghost_row_guard: planning, admin, default off, browser visible", () => {
  const def = featureDefinition("billing_ghost_row_guard")
  assert.ok(def)
  assert.equal(def!.defaultOn, false)
  assert.equal(def!.clientVisible, true)
  assert.equal(def!.toggleRole, "admin")
  assert.match(def!.description, /Saved data is never changed or deleted/)
  assert.match(def!.description, /Off: no check, as before/)
})

test("ghost pairs: found on the working schedule only when the switch is on", () => {
  const months = ghostMonths()
  const on = billingAliasGhostPairsWhenOn(true, months, MBA, null)
  assert.equal(on.length, 1)
  assert.equal(on[0]!.mediaKey, "television")
  assert.deepEqual(billingAliasGhostPairsWhenOn(false, months, MBA, null), [])
})

test("edit: a ghost pair refuses the save with the destructive toast naming the doubled money", () => {
  const months = ghostMonths()
  const stop = planSavePreflight({
    ...editOk,
    billingAliasGhostPairs: billingAliasGhostPairsWhenOn(true, months, MBA, null),
    billingMonthOrder: months.map((m) => m.monthYear),
  })
  assert.equal(stop?.code, "billing-alias-ghost")
  assert.equal(stop?.toast?.title, "Cannot save: duplicate billing rows")
  assert.equal(stop?.toast?.variant, "destructive")
  assert.match(stop!.toast!.description!, /\$100\.00 is counted twice/)
  assert.match(stop!.toast!.description!, /Keep the current rows/)
  // Off: no pair, so nothing is refused.
  assert.equal(planSavePreflight({ ...editOk, billingAliasGhostPairs: billingAliasGhostPairsWhenOn(false, months, MBA, null) }), null)
})

test("edit: refusals run in the page's order", () => {
  const all: EditSaveChecks = {
    ...editOk,
    clientsBlocked: true,
    clientsError: "Clients failed",
    datesOutOfOrder: true,
    duplicateLines: true,
    billingAliasGhostPairs: billingAliasGhostPairsWhenOn(true, ghostMonths(), MBA, null),
    linesStillLoading: true,
    channelLoadFailed: true,
    channelLoadFailedReason: "Radio failed",
    billingOverridesLoadState: "failed",
    pendingBillingOverrideCount: 2,
  }
  const order: string[] = []
  let checks: EditSaveChecks = all
  const clear: Record<string, Partial<EditSaveChecks>> = {
    "clients-unavailable": { clientsBlocked: false },
    "dates-out-of-order": { datesOutOfOrder: false },
    "duplicate-lines": { duplicateLines: false },
    "billing-alias-ghost": { billingAliasGhostPairs: [] },
    "lines-loading": { linesStillLoading: false },
    "channel-load-failed": { channelLoadFailed: false },
    "billing-overrides-not-loaded": { pendingBillingOverrideCount: 0 },
  }
  for (let stop = planSavePreflight(checks); stop; stop = planSavePreflight(checks)) {
    order.push(stop.code)
    checks = { ...checks, ...clear[stop.code] }
  }
  assert.deepEqual(order, Object.keys(clear))
})

test("edit: each refusal's toast", () => {
  assert.deepEqual(planSavePreflight({ ...editOk, clientsBlocked: true, clientsError: null })?.toast, {
    title: "Save disabled",
    description: "Client list unavailable — try again",
    variant: "destructive",
  })
  assert.equal(planSavePreflight({ ...editOk, clientsBlocked: true, clientsError: "x" })?.toast?.description, "x")
  assert.deepEqual(planSavePreflight({ ...editOk, datesOutOfOrder: true })?.toast, {
    title: "Publish disabled",
    description: END_BEFORE_START_MESSAGE,
    variant: "destructive",
  })
  assert.equal(planSavePreflight({ ...editOk, linesStillLoading: true })?.toast?.title, "Line items still loading — please wait")
  assert.equal(
    planSavePreflight({ ...editOk, channelLoadFailed: true, channelLoadFailedReason: null })?.toast?.description,
    "A channel failed to load — Retry before saving",
  )
  // MB-25: pending Applied rows need a loaded overrides read; loaded or no rows passes.
  assert.equal(planSavePreflight({ ...editOk, billingOverridesLoadState: "unknown", pendingBillingOverrideCount: 1 })?.code, "billing-overrides-not-loaded")
  assert.equal(planSavePreflight({ ...editOk, billingOverridesLoadState: "failed", pendingBillingOverrideCount: 0 }), null)
  assert.equal(planSavePreflight({ ...editOk, billingOverridesLoadState: "loaded", pendingBillingOverrideCount: 3 }), null)
})

test("create: clients, dates, a running save (silent), the MBA number loading, then the number's client problem", () => {
  const problem = { message: "krusty004 doesn't belong to this client (identifier golf)", refetch: true }
  let checks: CreateSaveChecks = {
    ...createOk,
    clientsBlocked: true,
    datesOutOfOrder: true,
    saveInFlight: true,
    mbaNumberPending: true,
    mbaNumberProblem: problem,
  }
  const order: string[] = []
  const clear: Record<string, Partial<CreateSaveChecks>> = {
    "clients-unavailable": { clientsBlocked: false },
    "dates-out-of-order": { datesOutOfOrder: false },
    "save-in-flight": { saveInFlight: false },
    "mba-number-loading": { mbaNumberPending: false },
    "mba-number-problem": { mbaNumberProblem: null },
  }
  for (let stop = planSavePreflight(checks); stop; stop = planSavePreflight(checks)) {
    order.push(stop.code)
    checks = { ...checks, ...clear[stop.code] }
  }
  assert.deepEqual(order, Object.keys(clear))
  assert.equal(planSavePreflight({ ...createOk, saveInFlight: true })?.toast, null)
  assert.deepEqual(planSavePreflight({ ...createOk, mbaNumberPending: true })?.toast, {
    title: "Not saved yet",
    description: MBA_NUMBER_LOADING_MESSAGE,
  })
  const stop = planSavePreflight({ ...createOk, mbaNumberProblem: problem })
  assert.deepEqual(stop?.toast, { title: "Not saved", description: problem.message, variant: "destructive" })
  assert.equal(stop?.refetchMbaNumber, true)
  assert.equal(planSavePreflight({ ...createOk, mbaNumberProblem: { message: "m", refetch: false } })?.refetchMbaNumber, false)
})

test("create runs none of the edit-only checks", () => {
  assert.equal(planSavePreflight(createOk), null)
  assert.equal(planSavePreflight(editOk), null)
})

test("keep the current rows: drops the old row and its money, never mutates the months passed in", () => {
  const months = ghostMonths()
  const before = JSON.stringify(months)
  const kept = keepCurrentBillingRows(months, MBA, null)
  assert.equal(JSON.stringify(months), before)
  const rows = (kept[0]!.lineItems as Record<string, Array<{ id: string }>>).television
  assert.deepEqual(rows.map((r) => r.id), [`${MBA}TV1`])
  assert.equal(kept[0]!.mediaCosts.television, "$100.00")
  assert.deepEqual(billingAliasGhostPairsWhenOn(true, kept, MBA, null), [])
  // No pair: the same months come back.
  assert.equal(keepCurrentBillingRows(kept, MBA, null), kept)
})
