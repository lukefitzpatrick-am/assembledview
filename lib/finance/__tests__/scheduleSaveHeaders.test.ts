import assert from "node:assert/strict"
import test from "node:test"

import {
  getScheduleHeaders,
  scheduleHeadersForSaveLine,
} from "@/lib/billing/scheduleHeaders"
import { saveBodyToLineItemInputs } from "@/lib/docs/saveBodyLineInputs"
import type { LineItemInput } from "../campaignFinancials.types.js"
import { computeBillingInputsHash } from "../computeBillingInputsHash.js"
import { computeCampaignFinancials } from "../computeCampaignFinancials.js"

const BURST = {
  startDate: "2026-05-01",
  endDate: "2026-05-31",
  budget: 24_768,
  buyAmount: 1,
}

function line(overrides: Partial<LineItemInput> = {}): LineItemInput {
  return {
    lineItemId: "STRMEA001RA1",
    mediaType: "radio",
    buyType: "cpm",
    rate: 1,
    enteredAmount: 24_768,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 0,
    bursts: [BURST],
    approval: "approved",
    ...overrides,
  }
}

function rowHeader(
  input: LineItemInput,
  mediaKey: "radio" | "ooh",
): { id: string; header1: string; header2: string; monthly: number } {
  const financials = computeCampaignFinancials([input], { feeLoading: {} })
  const month = financials.billingSchedule.find((m) => m.monthYear === "May 2026")
  const row = month?.lineItems?.[mediaKey]?.[0]
  assert.ok(row, `expected a ${mediaKey} row`)
  return {
    id: row.id,
    header1: row.header1,
    header2: row.header2,
    monthly: row.monthlyAmounts["May 2026"] ?? 0,
  }
}

test("schedule headers are display copy and do not change the billing-inputs hash", () => {
  const plain = line()
  const stamped = line({
    scheduleHeader1: "Southern Cross Austereo",
    scheduleHeader2: "2Day",
  })
  assert.equal(computeBillingInputsHash([plain]), computeBillingInputsHash([stamped]))
  assert.equal(
    computeBillingInputsHash([line({ scheduleHeader1: "", scheduleHeader2: "" })]),
    computeBillingInputsHash([plain]),
  )
})

test("buildBillingLineItem: label wins, then schedule headers, then the media-key fallback", () => {
  const labelled = rowHeader(
    line({
      label: "Custom title",
      scheduleHeader1: "Southern Cross Austereo",
      scheduleHeader2: "2Day",
    }),
    "radio",
  )
  assert.equal(labelled.header1, "Custom title")
  assert.equal(labelled.header2, "")

  const stamped = rowHeader(
    line({
      scheduleHeader1: "Southern Cross Austereo",
      scheduleHeader2: "2Day",
    }),
    "radio",
  )
  assert.equal(stamped.header1, "Southern Cross Austereo")
  assert.equal(stamped.header2, "2Day")

  const blank = rowHeader(
    line({ scheduleHeader1: "", scheduleHeader2: "" }),
    "radio",
  )
  assert.equal(blank.header1, "")
  assert.equal(blank.header2, "")

  const fallback = rowHeader(line(), "radio")
  assert.equal(fallback.header1, "radio")
  assert.equal(fallback.header2, "STRMEA001RA1")
})

test("STRMEA001 save lines stamp publisher and station or format, and money and ids stay put", () => {
  const bursts = [
    { startDate: "2026-05-01", endDate: "2026-05-31", budget: 24_768, buyAmount: 1 },
  ]
  const ohBursts = [
    { startDate: "2026-05-01", endDate: "2026-05-31", budget: 87_500, buyAmount: 1 },
  ]
  const smallBursts = [
    { startDate: "2026-05-01", endDate: "2026-05-31", budget: 22_500, buyAmount: 1 },
  ]
  const saveLines = [
    {
      lineItemId: "STRMEA001RA1",
      mediaType: "radio",
      buyType: "cpm",
      rate: 12,
      enteredAmount: 24_768,
      feePct: 0,
      bursts,
      publisher: null,
      platform: null,
      bidStrategy: null,
      attrs: { network: "Southern Cross Austereo", station: "2Day" },
    },
    {
      lineItemId: "STRMEA001OH1",
      mediaType: "ooh",
      buyType: "cpm",
      rate: 8,
      enteredAmount: 87_500,
      feePct: 0,
      bursts: ohBursts,
      attrs: { network: "QMS", format: "large_format" },
    },
    {
      lineItemId: "STRMEA001OH162",
      mediaType: "ooh",
      buyType: "cpm",
      rate: 4,
      enteredAmount: 22_500,
      feePct: 0,
      bursts: smallBursts,
      attrs: { network: "Cartology", format: "small_format" },
    },
  ]

  for (const saveLine of saveLines) {
    const template = getScheduleHeaders(saveLine.mediaType, {
      ...(saveLine.attrs ?? {}),
      publisher: saveLine.publisher,
      platform: saveLine.platform,
      bidStrategy: saveLine.bidStrategy,
      bid_strategy: saveLine.bidStrategy,
    })
    const saved = scheduleHeadersForSaveLine(saveLine.mediaType, saveLine)
    assert.deepEqual(saved, template)
  }

  const inputs = saveBodyToLineItemInputs(saveLines)
  assert.equal(inputs[0]?.scheduleHeader1, "Southern Cross Austereo")
  assert.equal(inputs[0]?.scheduleHeader2, "2Day")
  assert.equal(inputs[1]?.scheduleHeader1, "QMS")
  assert.equal(inputs[1]?.scheduleHeader2, "large_format")
  assert.equal(inputs[2]?.scheduleHeader1, "Cartology")
  assert.equal(inputs[2]?.scheduleHeader2, "small_format")

  assert.equal(inputs[0]?.lineItemId, "STRMEA001RA1")
  assert.equal(inputs[1]?.lineItemId, "STRMEA001OH1")
  assert.equal(inputs[2]?.lineItemId, "STRMEA001OH162")
  assert.deepEqual(inputs[0]?.bursts, bursts)
  assert.deepEqual(inputs[1]?.bursts, ohBursts)
  assert.deepEqual(inputs[2]?.bursts, smallBursts)
  assert.equal(inputs[0]?.enteredAmount, 24_768)
  assert.equal(inputs[0]?.rate, 12)
  assert.equal(inputs[1]?.enteredAmount, 87_500)
  assert.equal(inputs[2]?.enteredAmount, 22_500)

  const ra = rowHeader(inputs[0]!, "radio")
  assert.equal(ra.header1, "Southern Cross Austereo")
  assert.equal(ra.header2, "2Day")
  assert.equal(ra.id, "STRMEA001RA1")
  assert.equal(ra.monthly, 24_768)

  const without = rowHeader(
    { ...inputs[0]!, scheduleHeader1: undefined, scheduleHeader2: undefined },
    "radio",
  )
  assert.equal(without.id, ra.id)
  assert.equal(without.monthly, ra.monthly)

  const oh = rowHeader(inputs[1]!, "ooh")
  assert.equal(oh.header1, "QMS")
  assert.equal(oh.header2, "large_format")
  assert.equal(oh.id, "STRMEA001OH1")
  assert.equal(oh.monthly, 87_500)

  const small = rowHeader(inputs[2]!, "ooh")
  assert.equal(small.header1, "Cartology")
  assert.equal(small.header2, "small_format")
  assert.equal(small.id, "STRMEA001OH162")
  assert.equal(small.monthly, 22_500)
})
