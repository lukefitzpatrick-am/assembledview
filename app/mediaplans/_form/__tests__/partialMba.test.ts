/**
 * B52: partial MBA month sources, the B21 billing vs delivery guard and the
 * rail line, as behaviour. Replaces the M8 (B21) edit source pins
 * (partialMbaBillingGuardEditWiring.b21).
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import { featureDefinition } from "@/lib/features/registry"

import { cloneBillingMonths } from "../billingMonths"
import {
  partialMbaBaselineMonths,
  partialMbaBillingGuardWhenOn,
  partialMbaFinancialsOptions,
  partialMbaLineItemMonths,
  partialMbaSaveScopeNote,
  type PartialMbaMonthSources,
} from "../partialMba"

function month(label: string, withLines: boolean): BillingMonth {
  return {
    monthYear: label,
    mediaTotal: "$0.00",
    feeTotal: "$0.00",
    totalAmount: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: {},
    lineItems: withLines ? { television: [{ id: "x", monthlyAmounts: { [label]: 1 } }] } : {},
  } as unknown as BillingMonth
}

const working = [month("Working 2026", false)]
const workingWithLines = [month("Working 2026", true)]
const autoReference = [month("Auto 2026", true)]
const delivery = [month("Delivery 2026", false)]
const labels = (ms: BillingMonth[]) => ms.map((m) => m.monthYear)
const tagDelivery = (ms: BillingMonth[]) => ms.map((m) => ({ ...m, monthYear: `${m.monthYear} +lines` }))

test("switch partial_mba_billing_guard: planning, admin, default off, sent to the browser, no env", () => {
  const d = featureDefinition("partial_mba_billing_guard")
  assert.ok(d)
  assert.equal(d!.defaultOn, false)
  assert.equal(d!.area, "planning")
  assert.equal(d!.toggleRole, "admin")
  assert.equal(d!.clientVisible, true)
  assert.equal(d!.source, "switch")
  assert.equal(d!.envName, undefined)
})

test("month order: working billing with line rows, then auto billing (switch on), then delivery", () => {
  const src = (over: Partial<PartialMbaMonthSources>): PartialMbaMonthSources => ({
    guardOn: true,
    working,
    autoReference,
    autoDelivery: delivery,
    ...over,
  })
  assert.equal(partialMbaBaselineMonths(src({ working: workingWithLines })), workingWithLines)
  assert.equal(partialMbaBaselineMonths(src({})), autoReference)
  // Off: straight to delivery, as before B21.
  assert.equal(partialMbaBaselineMonths(src({ guardOn: false })), delivery)
  assert.equal(partialMbaBaselineMonths(src({ autoReference: [] })), delivery)
  assert.equal(partialMbaBaselineMonths(src({ autoReference: null, autoDelivery: [] })), working)
})

test("line item months: same order, always a copy; only delivery gets line rows attached", () => {
  const src: PartialMbaMonthSources = { guardOn: true, working: workingWithLines, autoReference, autoDelivery: delivery }
  const a = partialMbaLineItemMonths(src, tagDelivery)
  assert.deepEqual(a, workingWithLines)
  assert.notEqual(a[0], workingWithLines[0])
  const b = partialMbaLineItemMonths({ ...src, working }, tagDelivery)
  assert.deepEqual(labels(b), ["Auto 2026"])
  assert.notEqual(b[0], autoReference[0])
  assert.deepEqual(labels(partialMbaLineItemMonths({ ...src, working, guardOn: false }, tagDelivery)), ["Delivery 2026 +lines"])
  assert.deepEqual(
    labels(partialMbaLineItemMonths({ ...src, working, guardOn: false, autoDelivery: [] }, tagDelivery)),
    ["Working 2026 +lines"],
  )
})

test("provisional financials: bad dates and no months drop out", () => {
  const start = new Date("2026-01-01")
  const on = partialMbaFinancialsOptions({ campaignStart: start, campaignEnd: new Date("x"), selectedMonthYears: ["January 2026"] })
  assert.deepEqual(on, { campaignStart: start, campaignEnd: undefined, selectedMonthYears: ["January 2026"] })
  const none = partialMbaFinancialsOptions({ campaignStart: null, campaignEnd: undefined, selectedMonthYears: [] })
  assert.deepEqual(none, { campaignStart: undefined, campaignEnd: undefined, selectedMonthYears: undefined })
})

const perLine = [
  {
    lineItemId: "hema001TV1",
    mediaType: "television",
    label: "TV 1",
    flags: { excluded: false, clientPaysForMedia: false },
    billingMonths: [{ month: "January 2026", amount: 150 }],
    deliveryMonths: [{ month: "January 2026", amount: 100 }],
  },
] as unknown as Parameters<typeof partialMbaBillingGuardWhenOn>[0]["perLine"]

test("guard: computed only with the switch on, on a partial MBA, once every channel has its lines", () => {
  const args = { on: true, isPartial: true, allChannelsHydrated: true, perLine, selectedMonthYears: ["January 2026"], laterAddedMediaKeys: [] }
  const result = partialMbaBillingGuardWhenOn(args)
  assert.ok(result)
  assert.equal(result!.unexpectedLineCount, 1)
  assert.equal(partialMbaBillingGuardWhenOn({ ...args, on: false }), null)
  assert.equal(partialMbaBillingGuardWhenOn({ ...args, isPartial: false }), null)
  assert.equal(partialMbaBillingGuardWhenOn({ ...args, allChannelsHydrated: false }), null)
})

test("save rail: the partial count, then one guard line; nothing when neither applies", () => {
  const guard = partialMbaBillingGuardWhenOn({ on: true, isPartial: true, allChannelsHydrated: true, perLine, selectedMonthYears: ["January 2026"], laterAddedMediaKeys: [] })
  assert.equal(
    partialMbaSaveScopeNote({ isPartial: true, inCount: 3, totalCount: 5, guard }),
    "Client MBA covers 3 of 5 lines. Billing is $50.00 above delivery on 1 line in the MBA months. See MBA & billing.",
  )
  assert.equal(partialMbaSaveScopeNote({ isPartial: true, inCount: 3, totalCount: 5, guard: null }), "Client MBA covers 3 of 5 lines.")
  assert.equal(partialMbaSaveScopeNote({ isPartial: false, inCount: 0, totalCount: 5, guard: null }), null)
})

test("clone: a deep copy", () => {
  const a = [month("January 2026", true)]
  const b = cloneBillingMonths(a)
  assert.deepEqual(b, a)
  assert.notEqual((b[0]!.lineItems as Record<string, unknown[]>).television, (a[0]!.lineItems as Record<string, unknown[]>).television)
})
