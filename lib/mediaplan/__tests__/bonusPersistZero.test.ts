import assert from "node:assert/strict"
import test from "node:test"

import {
  extractAndFormatBursts,
  parseBurstMoney,
} from "@/lib/mediaplan/formatBurstsForPersist"

const FEE_PCT = 10
const BURST_BUDGET = 50000

function lineItem(buyType: string, buyTypeKey: "buy_type" | "buyType" = "buy_type") {
  return {
    bursts: [
      {
        budget: BURST_BUDGET,
        buyAmount: "0",
        startDate: "2026-01-05",
        endDate: "2026-01-11",
        calculatedValue: 0,
      },
    ],
    [buyTypeKey]: buyType,
    budget_includes_fees: false,
    client_pays_for_media: false,
  }
}

test("bonus buy_type persists mediaAmount 0 and feeAmount 0 despite non-zero burst budget", () => {
  const result = extractAndFormatBursts(lineItem("bonus"), FEE_PCT)
  assert.equal(result.length, 1)
  assert.equal(parseBurstMoney(result[0].mediaAmount), 0)
  assert.equal(parseBurstMoney(result[0].feeAmount), 0)
})

test("package_inclusions buy_type persists mediaAmount 0 and feeAmount 0 despite non-zero burst budget", () => {
  const result = extractAndFormatBursts(lineItem("package_inclusions"), FEE_PCT)
  assert.equal(result.length, 1)
  assert.equal(parseBurstMoney(result[0].mediaAmount), 0)
  assert.equal(parseBurstMoney(result[0].feeAmount), 0)
})

test("ordinary cpm line still persists non-zero mediaAmount and feeAmount", () => {
  const result = extractAndFormatBursts(lineItem("cpm"), FEE_PCT)
  assert.equal(result.length, 1)
  // standard net budget @ 10%: media = 50000, fee = 50000*10/90
  assert.equal(parseBurstMoney(result[0].mediaAmount), 50000)
  assert.ok(parseBurstMoney(result[0].feeAmount) > 0)
})
