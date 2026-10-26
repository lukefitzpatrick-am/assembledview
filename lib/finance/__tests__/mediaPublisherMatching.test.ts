/**
 * Media finance lines match publisher names the same forgiving way as
 * production (Luke, 26 Oct 2026, decision 5): trimmed, case-insensitive,
 * lowest id, alias, then publisherid. Drives the G./D. item code.
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import { financeMediaLinesFromBillingMonth } from "@/lib/finance/scheduleMonthFinanceExtract"
import { publisherAgencyLateralSql } from "@/lib/finance/sections/publisherIdentitySql"
import { buildItemCode, extractLineItemsFromBillingSchedule } from "@/lib/finance/utils"
import { createPublisherLookup } from "@/lib/publisher/resolvePublisherName"

const OCT = "October 2026"

const publishers = [
  { id: 5, publisher_name: "QMS", publisherid: "QMS", billingagency: "advertising associates" },
  { id: 6, publisher_name: "Meta", publisherid: "meta", billingagency: "assembled media" },
  { id: 47, publisher_name: "Channel Factory", publisherid: "chfact", billingagency: "advertising associates" },
  { id: 65, publisher_name: "Vicinity", publisherid: "Vicinity", billingagency: "assembled media" },
  { id: 77, publisher_name: "GoTranist", publisherid: "GoTransit", billingagency: "advertising associates" },
  { id: 41, publisher_name: "ARE Media ", publisherid: "aremedia", billingagency: "advertising associates" },
  { id: 48, publisher_name: "Are Media", publisherid: "are", billingagency: "assembled media" },
]

function ooh(header1: string, amount = 100) {
  return { id: `X${header1}`, header1, header2: "format", mediaType: "ooh", billingMode: "auto", monthlyAmounts: { [OCT]: amount } }
}

function month(rows: ReturnType<typeof ooh>[]): BillingMonth {
  return {
    monthYear: OCT,
    mediaTotal: "$0.00",
    feeTotal: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: "$0.00",
    lineItems: { ooh: rows },
  } as unknown as BillingMonth
}

function codes(rows: ReturnType<typeof ooh>[], list = publishers) {
  const lines = financeMediaLinesFromBillingMonth(month(rows), createPublisherLookup(list))
  return Object.fromEntries(lines.map((l) => [l.publisherName, l.itemCode]))
}

test("case and spaces are ignored", () => {
  assert.deepEqual(codes([ooh("qms"), ooh("META")]), { qms: "G.OOH", META: "D.OOH" })
})

test("aliases: Go Transit reads as GoTranist (AA)", () => {
  assert.deepEqual(codes([ooh("Go Transit")]), { "Go Transit": "G.OOH" })
})

test("aliases: Vicinity Group follows Vicinity (#65) and its billing agency", () => {
  assert.deepEqual(codes([ooh("Vicinity Group")]), { "Vicinity Group": "D.OOH" })
  const aa = publishers.map((p) => (p.id === 65 ? { ...p, billingagency: "advertising associates" } : p))
  assert.deepEqual(codes([ooh("Vicinity Group"), ooh("Vicinity")], aa), {
    "Vicinity Group": "G.OOH",
    Vicinity: "G.OOH",
  })
})

test("publisherid when no name or alias matches", () => {
  assert.deepEqual(codes([ooh("chfact")]), { chfact: "G.OOH" })
})

test("a shared name takes the lowest id, never last-wins", () => {
  // "Are Media" (#48, AM) and "ARE Media " (#41, AA) share a key: #41 wins.
  assert.deepEqual(codes([ooh("Are Media")]), { "Are Media": "G.OOH" })
})

test("unknown text stays D.", () => {
  assert.deepEqual(codes([ooh("Vogue")]), { Vogue: "D.OOH" })
})

test("a plain Map still works with exact keys (back-compat)", () => {
  const map = new Map([["QMS", { billingagency: "advertising associates" }]])
  const lines = financeMediaLinesFromBillingMonth(month([ooh("QMS"), ooh("qms")]), map)
  assert.deepEqual(
    lines.map((l) => l.itemCode),
    ["G.OOH", "D.OOH"],
  )
})

test("old mediaTypes shape uses the same lookup", () => {
  const schedule = [
    {
      monthYear: OCT,
      mediaTypes: [
        {
          mediaType: "OOH",
          lineItems: [
            { lineItemId: "TheY001OH1", header1: "go transit", header2: "x", amount: "$100.00" },
            { lineItemId: "TheY001OH2", header1: "meta", header2: "y", amount: "$50.00" },
          ],
        },
      ],
    },
  ]
  const lines = extractLineItemsFromBillingSchedule(schedule, 2026, 10, createPublisherLookup(publishers))
  assert.deepEqual(
    lines.map((l) => l.itemCode),
    ["G.OOH", "D.OOH"],
  )
})

test("buildItemCode classifies the raw agency trimmed and case-insensitive", () => {
  assert.equal(buildItemCode(" Advertising Associates ", "OOH"), "G.OOH")
  assert.equal(buildItemCode("advertising associates", "Social Media"), "G.SocialMedia")
  assert.equal(buildItemCode("assembled media", "OOH"), "D.OOH")
  assert.equal(buildItemCode(null, "OOH"), "D.OOH")
})

test("SQL twin carries the aliases, lowest id and unique publisherid rules", () => {
  const text = publisherAgencyLateralSql("li.publisher")
  assert.match(text, /LOWER\(BTRIM\(COALESCE\(li\.publisher, ''\)\)\) AS k/)
  assert.match(text, /WHEN 'go transit' THEN 'gotranist'/)
  assert.match(text, /WHEN 'vicinity group' THEN 'vicinity'/)
  assert.match(text, /WHEN 'sca' THEN 'southern cross austereo'/)
  assert.match(text, /p2\.id <> p\.id AND LOWER\(BTRIM\(p2\.publisherid\)\) = pk\.k/)
  assert.match(text, /ELSE 2\s+END,\s+p\.id\s+LIMIT 1/)
  assert.match(text, /\) p ON TRUE$/)
})
