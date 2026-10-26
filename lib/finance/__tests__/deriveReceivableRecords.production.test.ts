import assert from "node:assert/strict"
import { test } from "node:test"

import { derivePlanReceivableBillingRecordsForMonth } from "../deriveReceivableRecords.js"
import { isProductionItemCode } from "../productionItemCodes.js"

/**
 * TheY001 v17 October 2026 shape (trimmed): production sits in the month
 * header AND in `lineItems.production`. It must bill once, as the Production
 * service row, never also as a media line.
 */
const OCT = "October 2026"
const theY001October = {
  monthYear: OCT,
  mediaTotal: "$61,465.00",
  feeTotal: "$1,320.00",
  adservingTechFees: "$99.27",
  production: "$13,198.00",
  totalAmount: "$76,082.27",
  lineItems: {
    ooh: [
      { id: "TheY001OH25", header1: "QMS", header2: "large_format", mediaType: "ooh", billingMode: "auto", monthlyAmounts: { [OCT]: 37146 } },
      { id: "TheY001OH123", header1: "GoTranist", header2: "transit", mediaType: "ooh", billingMode: "auto", monthlyAmounts: { [OCT]: 7089 } },
    ],
    production: [
      { id: "TheY001PROD1", header1: "Go Transit", header2: "Full Back and Mini Sides", mediaType: "production", billingMode: "auto", monthlyAmounts: { [OCT]: 13198 } },
    ],
    digiDisplay: [
      { id: "TheY001DD1", header1: "Quantcast", header2: "Whitelist", mediaType: "digiDisplay", billingMode: "auto", monthlyAmounts: { [OCT]: 9750 } },
    ],
    socialMedia: [
      { id: "TheY001SM1", header1: "Meta", header2: "The Y High Value Audience", mediaType: "socialMedia", billingMode: "auto", monthlyAmounts: { [OCT]: 7480 } },
    ],
  },
}

const publishers = new Map<string, unknown>([
  ["QMS", { billingagency: "advertising associates" }],
  ["GoTranist", { billingagency: "assembled media" }],
  ["Quantcast", { billingagency: "assembled media" }],
  ["Meta", { billingagency: "assembled media" }],
])

function deriveOctober() {
  return derivePlanReceivableBillingRecordsForMonth(
    [
      {
        id: 19604,
        mba_number: "TheY001",
        version_number: 17,
        campaign_status: "approved",
        campaign_name: "TheY001",
        mp_client_name: "The Y",
        clients_id: 1,
        campaign_start_date: "2026-10-01",
        campaign_end_date: "2026-10-31",
        billingSchedule: [theY001October],
      },
    ],
    2026,
    10,
    publishers,
    new Map(),
    [],
    { includeNonBookedCampaigns: true },
  )
}

test("production bills once: no Production media line, one Production service row", () => {
  const [record] = deriveOctober()
  assert.ok(record)
  const media = record.line_items.filter((l) => l.line_type === "media")
  assert.equal(media.some((l) => l.media_type === "Production"), false)
  const production = record.line_items.filter((l) => isProductionItemCode(l.item_code))
  assert.equal(production.length, 1)
  // Media under G. (QMS) and D. (Meta): split by production publisher.
  // "Go Transit" is not in this publisher map, so it goes to D.
  assert.equal(production[0]!.item_code, "D.Production")
  assert.equal(production[0]!.line_type, "service")
  assert.equal(production[0]!.amount, 13198)
})

test("line items sum to the month header total", () => {
  const [record] = deriveOctober()
  assert.ok(record)
  const sum = Math.round(record.line_items.reduce((s, l) => s + Number(l.amount), 0) * 100) / 100
  assert.equal(record.total, 76082.27)
  assert.equal(sum, 76082.27)
  const mediaSum = record.line_items
    .filter((l) => l.line_type === "media")
    .reduce((s, l) => s + Number(l.amount), 0)
  assert.equal(Math.round(mediaSum * 100) / 100, 61465)
})

test("real publisher names keep their agency code", () => {
  const [record] = deriveOctober()
  assert.ok(record)
  const qms = record.line_items.find((l) => l.publisher_name === "QMS")
  assert.equal(qms?.item_code, "G.OOH")
  const meta = record.line_items.find((l) => l.publisher_name === "Meta")
  assert.equal(meta?.item_code, "D.SocialMedia")
})
