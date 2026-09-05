/**
 * C-95 glenda008-shaped: social is client-pays; billing media 0 / fee $5,000;
 * approved slice feeCents = 500000.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { computeApprovedSlice } from "../approvedSlice.js"
import { glenda008ClientPaysFinancials } from "./glenda008ClientPaysFee.fixture.js"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function findSocial(schedule: ReturnType<typeof glenda008ClientPaysFinancials>["billingSchedule"]) {
  for (const month of schedule) {
    const items = month.lineItems?.socialMedia ?? []
    const hit = items.find((li) => String(li.id).includes("glenda008SM1"))
    if (hit) return { month, line: hit }
  }
  return null
}

test("C-95: billingSchedule keeps social with media 0 and fee 5,000", () => {
  const { billingSchedule } = glenda008ClientPaysFinancials()
  const found = findSocial(billingSchedule)
  assert.ok(found, "client-pays social must stay on billingSchedule.lineItems")
  const { line } = found!
  assert.equal(line.clientPaysForMedia, true)
  const mediaSum = Object.values(line.monthlyAmounts).reduce((s, v) => s + v, 0)
  const feeSum = Object.values(line.feeMonthlyAmounts ?? {}).reduce((s, v) => s + v, 0)
  assert.equal(round2(mediaSum), 0)
  assert.equal(round2(feeSum), 5_000)
})

test("C-95: delivery schedule still has social media (not the same drop)", () => {
  const { deliverySchedule } = glenda008ClientPaysFinancials()
  const found = findSocial(deliverySchedule)
  assert.ok(found)
  const mediaSum = Object.values(found!.line.monthlyAmounts).reduce((s, v) => s + v, 0)
  const feeSum = Object.values(found!.line.feeMonthlyAmounts ?? {}).reduce((s, v) => s + v, 0)
  assert.equal(round2(mediaSum), 20_000)
  assert.equal(round2(feeSum), 5_000)
})

test("C-95: approvedSlice feeCents is 500000 for the social line", () => {
  const slice = computeApprovedSlice({ financials: glenda008ClientPaysFinancials() })
  const social = slice.lines.find((l) => l.lineItemId.includes("glenda008SM1"))
  assert.ok(social)
  assert.equal(social!.mediaCents, 0)
  assert.equal(social!.feeCents, 500_000)
})
