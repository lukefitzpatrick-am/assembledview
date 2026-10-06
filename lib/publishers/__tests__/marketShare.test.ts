import assert from "node:assert/strict"
import test from "node:test"

import {
  marketShareFromLines,
  type MarketSharePublisher,
} from "../marketShare"

const FY = { start: "2025-07-01", end: "2026-06-30" }

const NINE: MarketSharePublisher = {
  id: 7,
  publisherName: "Nine",
  publisherid: "nine",
}

test("market share for a fixture publisher across two media types", () => {
  const rows = marketShareFromLines(
    [
      {
        mediaType: "television",
        publisher: "Nine",
        bursts: [{ mediaAmount: "400", startDate: "2025-08-01", endDate: "2025-08-31" }],
      },
      {
        mediaType: "television",
        publisher: "Seven",
        bursts: [{ mediaAmount: "600", startDate: "2025-09-01", endDate: "2025-09-30" }],
      },
      {
        mediaType: "television",
        publisher: "Nine",
        bursts: [{ mediaAmount: "999", startDate: "2024-01-01", endDate: "2024-02-01" }],
      },
      {
        mediaType: "search",
        publisher: "nine",
        bursts: [{ budget: "100", startDate: "2026-01-01", endDate: "2026-01-31" }],
      },
      {
        mediaType: "search",
        publisher: "Google",
        bursts: [{ mediaAmount: "300", startDate: "2026-02-01", endDate: "2026-02-28" }],
      },
      {
        mediaType: "radio",
        publisher: "SCA",
        bursts: [{ mediaAmount: "50", startDate: "2025-10-01", endDate: "2025-10-31" }],
      },
    ],
    NINE,
    FY,
  )

  assert.deepEqual(rows, [
    {
      mediaType: "search",
      thisPublisherSpend: 100,
      totalMarketSpend: 400,
      sharePercent: 25,
    },
    {
      mediaType: "television",
      thisPublisherSpend: 400,
      totalMarketSpend: 1000,
      sharePercent: 40,
    },
  ])
})

test("market share is empty when the publisher has no FY lines", () => {
  const rows = marketShareFromLines(
    [
      {
        mediaType: "television",
        publisher: "Seven",
        bursts: [{ mediaAmount: "600", startDate: "2025-09-01", endDate: "2025-09-30" }],
      },
    ],
    NINE,
    FY,
  )
  assert.deepEqual(rows, [])
})
