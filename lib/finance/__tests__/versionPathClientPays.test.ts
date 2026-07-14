import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "../../billing/types.js"
import { computeCampaignFinancialsFromVersion } from "../computeCampaignFinancialsFromVersion.js"

function emptyMediaCosts(): BillingMonth["mediaCosts"] {
  return {
    search: "$0.00",
    socialMedia: "$0.00",
    television: "$0.00",
    radio: "$0.00",
    newspaper: "$0.00",
    magazines: "$0.00",
    ooh: "$0.00",
    cinema: "$0.00",
    digiDisplay: "$0.00",
    digiAudio: "$0.00",
    digiVideo: "$0.00",
    bvod: "$0.00",
    integration: "$0.00",
    progDisplay: "$0.00",
    progVideo: "$0.00",
    progBvod: "$0.00",
    progAudio: "$0.00",
    progOoh: "$0.00",
    influencers: "$0.00",
    production: "$0.00",
  }
}

/** One client-pays line: delivery keeps full media; billing media is already 0 (fee only). */
function clientPaysOnlyVersion(): Record<string, unknown> {
  const delivery: BillingMonth[] = [
    {
      monthYear: "May 2026",
      mediaTotal: "$8,000.00",
      feeTotal: "$2,000.00",
      totalAmount: "$10,000.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: { ...emptyMediaCosts(), progDisplay: "$8,000.00" },
      lineItems: {
        progDisplay: [
          {
            id: "billing-progDisplay::CP1",
            header1: "DV360",
            header2: "RON",
            monthlyAmounts: { "May 2026": 8000 },
            totalAmount: 8000,
            feeMonthlyAmounts: { "May 2026": 2000 },
            totalFeeAmount: 2000,
            clientPaysForMedia: true,
            mediaType: "Programmatic Display",
            publisher: "DV360",
          },
        ],
      },
    },
  ]

  const billing: BillingMonth[] = [
    {
      monthYear: "May 2026",
      mediaTotal: "$0.00",
      feeTotal: "$2,000.00",
      totalAmount: "$2,000.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: emptyMediaCosts(),
      lineItems: {
        progDisplay: [
          {
            id: "billing-progDisplay::CP1",
            header1: "DV360",
            header2: "RON",
            monthlyAmounts: { "May 2026": 0 },
            totalAmount: 0,
            feeMonthlyAmounts: { "May 2026": 2000 },
            totalFeeAmount: 2000,
            clientPaysForMedia: true,
            mediaType: "Programmatic Display",
            publisher: "DV360",
          },
        ],
      },
    },
  ]

  return {
    billingSchedule: billing,
    deliverySchedule: delivery,
  }
}

test("version path: client-pays — nettExGst includes media; billable = nett − clientPays (no double-subtract)", () => {
  const result = computeCampaignFinancialsFromVersion(clientPaysOnlyVersion())
  assert.ok(result, "expected hydrated financials from persisted schedules")

  // Full booked MBA (delivery basis) — includes client-pays media.
  assert.equal(result.mbaScopeTotals.grossMedia, 8000)
  assert.equal(result.mbaScopeTotals.fee, 2000)
  assert.equal(result.mbaScopeTotals.nettExGst, 10_000)

  const clientPaysMedia = result.perLine
    .filter((p) => p.flags.clientPaysForMedia)
    .reduce((s, p) => s + p.media, 0)
  assert.equal(clientPaysMedia, 8000)

  const billableMbaExGst = Math.round((result.mbaScopeTotals.nettExGst - clientPaysMedia) * 100) / 100
  assert.equal(billableMbaExGst, 2000, "billable = nettExGst − clientPaysMedia (fee only)")

  // Billing schedule is fee-only; validation must match that single subtract — not double.
  assert.equal(result.validation.billableEqualsMba, true)
  assert.ok(Math.abs(result.validation.deltaExGst) < 0.02)
})
