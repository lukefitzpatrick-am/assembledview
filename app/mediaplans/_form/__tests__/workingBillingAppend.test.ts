/**
 * B52: the edit append merge and union with the plan's alias identity, as
 * behaviour. Replaces the MB-30 (B20, B35, B35fix) edit source pins
 * (appendAutoReferenceIntoWorking.editWiring.b20). The identity is a required
 * argument now, so no call site can leave it out.
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { BillingAliasReconcileEntry } from "@/lib/billing/appendAutoReferenceIntoWorking"
import { buildBillingAliasNumberCheck } from "@/lib/billing/billingAliasNumberCheck"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

import { appendAutoReferenceIntoWorkingBilling, unionWithAliasIdentity, type BillingAliasIdentity } from "../workingBillingAppend"

const MAY = "May 2026"
const FMT = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 })

const line = (id: string, amount: number, extra?: Partial<BillingLineItem>): BillingLineItem => ({
  id,
  header1: "Pub",
  header2: "Site",
  monthlyAmounts: { [MAY]: amount },
  totalAmount: amount,
  ...extra,
})

function month(items: BillingLineItem[]): BillingMonth {
  const sum = items.reduce((s, li) => s + (li.monthlyAmounts[MAY] || 0), 0)
  return {
    monthYear: MAY,
    mediaTotal: FMT.format(sum),
    feeTotal: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: FMT.format(sum),
    mediaCosts: { ooh: FMT.format(sum) } as BillingMonth["mediaCosts"],
    lineItems: { ooh: items } as BillingMonth["lineItems"],
  }
}

const ids = (months: BillingMonth[]) =>
  ((months[0]?.lineItems as Record<string, BillingLineItem[]>).ooh ?? []).map((r) => r.id)

/** Saved working `[ML1, ML2]` and the auto template `[OH1, OH2]` (malay003, discovery 3 Nov 2026). */
const working = () => [month([line("billing-ooh::malay003ML1", 5000, { billingMode: "manual" }), line("billing-ooh::malay003ML2", 3000)])]
const auto = () => [month([line("billing-ooh::malay003OH1", 4000), line("billing-ooh::malay003OH2", 3000)])]

function identity(mbaNumber: string | null): BillingAliasIdentity & { entries: BillingAliasReconcileEntry[] } {
  const entries: BillingAliasReconcileEntry[] = []
  return { mbaNumber, aliasNumberCheck: null, onReconcile: (e) => entries.push(...e), entries }
}

test("append with the plan's MBA number: old ids take the current ids, the line bills once, the merge is reported", () => {
  const modes: string[] = []
  const id = identity("malay003")
  const merged = appendAutoReferenceIntoWorkingBilling(working(), auto(), FMT, (m, mode) => (modes.push(mode), m), {
    mbaNumber: id.mbaNumber,
    aliasNumberCheck: id.aliasNumberCheck,
    onReconcile: id.onReconcile,
  })
  assert.deepEqual(ids(merged), ["billing-ooh::malay003OH1", "billing-ooh::malay003OH2"])
  assert.equal(merged[0]!.mediaTotal, "$8,000.00")
  assert.deepEqual(
    id.entries.map((e) => e.kind),
    ["alias_adoption", "alias_adoption"],
  )
  assert.deepEqual(modes, ["billing"])
  // A blank number matches canonically only: the same line twice (what the identity prevents).
  const blind = appendAutoReferenceIntoWorkingBilling(working(), auto(), FMT, (m) => m, identity(null))
  assert.equal(ids(blind).length, 4)
})

test("append keeps the follow-auto options beside the identity", () => {
  const merged = appendAutoReferenceIntoWorkingBilling(working(), auto(), FMT, (m) => m, identity("malay003"), {
    isManualBilling: true,
    resyncExistingFromTemplate: true,
  })
  const rows = (merged[0]!.lineItems as Record<string, BillingLineItem[]>).ooh
  // The manual row keeps its money and mode; the auto row takes the template.
  assert.deepEqual(rows.map((r) => [r.id, r.monthlyAmounts[MAY], r.billingMode]), [
    ["billing-ooh::malay003OH1", 5000, "manual"],
    ["billing-ooh::malay003OH2", 3000, undefined],
  ])
})

test("append template: working is the skeleton when auto has no months; nothing when neither has", () => {
  const seen: BillingMonth[][] = []
  appendAutoReferenceIntoWorkingBilling(working(), [], FMT, (m) => (seen.push(m), m), identity("malay003"))
  assert.deepEqual(ids(seen[0]!), ["billing-ooh::malay003ML1", "billing-ooh::malay003ML2"])
  const w = working()
  appendAutoReferenceIntoWorkingBilling(w, [], FMT, (m) => (m[0]!.monthYear = "changed", m), identity("malay003"))
  assert.equal(w[0]!.monthYear, MAY, "the skeleton is a copy")
  const calls: number[] = []
  assert.deepEqual(appendAutoReferenceIntoWorkingBilling([], [], FMT, (m) => (calls.push(1), m), identity("malay003")), [])
  assert.equal(calls.length, 0)
})

test("union with the identity: the old id adopts the current id; the number check is passed through", () => {
  const existing = [line("billing-ooh::malay003ML1", 5000)]
  const generated = [line("billing-ooh::malay003OH1", 4000)]
  const u = unionWithAliasIdentity(existing, generated, "ooh", { mbaNumber: "malay003", aliasNumberCheck: null })
  assert.deepEqual(u.list.map((r) => r.id), ["billing-ooh::malay003OH1"])
  assert.equal(u.aliasAdoptions.length, 1)
  assert.equal(unionWithAliasIdentity(existing, generated, "ooh", { mbaNumber: null, aliasNumberCheck: null }).list.length, 2)
  // B35: a no-code id pairs only when the loaded lines prove its number.
  const noCode = [line("billing-ooh::malay0031", 5000)]
  assert.equal(unionWithAliasIdentity(noCode, generated, "ooh", { mbaNumber: "malay003", aliasNumberCheck: null }).list.length, 2)
  const proven = buildBillingAliasNumberCheck({ ooh: [{ line_item_id: "malay0031", line_item: 1 }] }, "malay003")
  const withCheck = unionWithAliasIdentity(noCode, generated, "ooh", { mbaNumber: "malay003", aliasNumberCheck: proven })
  assert.equal(withCheck.list.length, 1)
})
