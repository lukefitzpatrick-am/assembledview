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

function findLine(
  schedule: ReturnType<typeof glenda008ClientPaysFinancials>["billingSchedule"],
  group: "socialMedia" | "radio",
  idPart: string
) {
  for (const month of schedule) {
    const items = month.lineItems?.[group] ?? []
    const hit = items.find((li) => String(li.id).includes(idPart))
    if (hit) return { month, line: hit }
  }
  return null
}

function feeSum(line: { feeMonthlyAmounts?: Record<string, number> }): number {
  return Object.values(line.feeMonthlyAmounts ?? {}).reduce((s, v) => s + v, 0)
}

test("C-95: billingSchedule keeps social with media 0 and fee 5,000", () => {
  const { billingSchedule } = glenda008ClientPaysFinancials()
  const social = findLine(billingSchedule, "socialMedia", "glenda008SM1")
  const radio = findLine(billingSchedule, "radio", "glenda008RAD1")
  assert.ok(social, "client-pays social must stay on billingSchedule.lineItems")
  assert.ok(radio, "agency radio must stay on billingSchedule.lineItems")
  const { line } = social!
  assert.equal(line.clientPaysForMedia, true)
  const mediaSum = Object.values(line.monthlyAmounts).reduce((s, v) => s + v, 0)
  const socialFee = feeSum(line)
  const radioFee = feeSum(radio!.line)
  assert.equal(round2(mediaSum), 0)
  assert.equal(round2(socialFee), 5_000)
  assert.equal(round2(radioFee), 0)
  assert.equal(round2(socialFee + radioFee), 5_000)
})

test("C-95: delivery schedule still has social media (not the same drop)", () => {
  const { deliverySchedule } = glenda008ClientPaysFinancials()
  const found = findLine(deliverySchedule, "socialMedia", "glenda008SM1")
  assert.ok(found)
  const mediaSum = Object.values(found!.line.monthlyAmounts).reduce((s, v) => s + v, 0)
  assert.equal(round2(mediaSum), 20_000)
  assert.equal(round2(feeSum(found!.line)), 5_000)
})

test("C-95: approvedSlice feeCents is 500000 for the social line", () => {
  const slice = computeApprovedSlice({ financials: glenda008ClientPaysFinancials() })
  const feeCentsByLineId = Object.fromEntries(
    slice.lines.map((l) => [l.lineItemId, l.feeCents])
  )
  assert.equal(feeCentsByLineId["billing-socialMedia::glenda008SM1"], 500_000)
  assert.equal(feeCentsByLineId["billing-radio::glenda008RAD1"], 0)
  const social = slice.lines.find((l) => l.lineItemId.includes("glenda008SM1"))
  assert.ok(social)
  assert.equal(social!.mediaCents, 0)
  assert.equal(
    Object.values(feeCentsByLineId).reduce((s, v) => s + v, 0),
    500_000
  )
})
