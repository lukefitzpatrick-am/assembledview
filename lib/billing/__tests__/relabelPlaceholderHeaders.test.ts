import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import { relabelPlaceholderHeaders } from "../relabelPlaceholderHeaders"

const LINES: Record<string, unknown> = {
  STRMEA001RA1: { network: "Southern Cross Austereo", station: "2Day" },
  STRMEA001OH1: { network: "QMS", format: "large_format" },
}

function schedule(): BillingMonth[] {
  return [
    {
      monthYear: "May 2026",
      mediaTotal: "$112,268.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: "$112,269.00",
      mediaCosts: {
        radio: "$24,768.00",
        ooh: "$87,501.00",
      },
      lineItems: {
        radio: [
          {
            id: "STRMEA001RA1",
            header1: "radio",
            header2: "STRMEA001RA1",
            monthlyAmounts: { "May 2026": 24768 },
            totalAmount: 24768,
          },
        ],
        ooh: [
          {
            id: "STRMEA001OH1",
            header1: "QMS",
            header2: "large_format",
            monthlyAmounts: { "May 2026": 87500 },
            totalAmount: 87500,
          },
          {
            id: "MISSING",
            header1: "ooh",
            header2: "MISSING",
            monthlyAmounts: { "May 2026": 1 },
            totalAmount: 1,
          },
        ],
      },
    } as unknown as BillingMonth,
  ]
}

test("placeholder rows are relabelled and labelled rows, amounts, and unknown ids stay", () => {
  const input = schedule()
  const before = JSON.stringify(input)
  const radioRow = input[0].lineItems!.radio![0]
  const labelledRow = input[0].lineItems!.ooh![0]
  const unknownRow = input[0].lineItems!.ooh![1]

  const next = relabelPlaceholderHeaders(input, LINES)

  assert.notEqual(next, input)
  assert.equal(next[0].lineItems!.radio![0].header1, "Southern Cross Austereo")
  assert.equal(next[0].lineItems!.radio![0].header2, "2Day")
  assert.equal(next[0].lineItems!.ooh![0].header1, "QMS")
  assert.equal(next[0].lineItems!.ooh![0].header2, "large_format")
  assert.equal(next[0].lineItems!.ooh![1].header1, "ooh")
  assert.equal(next[0].lineItems!.ooh![1].header2, "MISSING")

  assert.equal(next[0].mediaTotal, "$112,268.00")
  assert.equal(next[0].feeTotal, "$0.00")
  assert.equal(next[0].totalAmount, "$112,269.00")
  assert.equal(next[0].lineItems!.radio![0].totalAmount, 24768)
  assert.deepEqual(next[0].lineItems!.radio![0].monthlyAmounts, { "May 2026": 24768 })
  assert.equal(next[0].lineItems!.ooh![0].totalAmount, 87500)
  assert.equal(next[0].mediaCosts.radio, "$24,768.00")
  assert.equal(next[0].mediaCosts.ooh, "$87,501.00")

  assert.equal(JSON.stringify(input), before)
  assert.equal(radioRow.header1, "radio")
  assert.equal(radioRow.header2, "STRMEA001RA1")
  assert.equal(labelledRow.header1, "QMS")
  assert.equal(unknownRow.header1, "ooh")
  assert.equal(unknownRow.header2, "MISSING")
  assert.equal(input[0].totalAmount, "$112,269.00")
})
