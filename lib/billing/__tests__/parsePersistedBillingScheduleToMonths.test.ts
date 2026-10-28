import assert from "node:assert/strict"
import test from "node:test"

import { parsePersistedBillingScheduleToMonths } from "../parsePersistedBillingScheduleToMonths.js"

test("top-level production only — mirrors to mediaCosts.production", () => {
  const schedule = [
    {
      monthYear: "May 2026",
      production: "$500.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      mediaTypes: [
        {
          mediaType: "Television",
          lineItems: [{ header1: "Net", header2: "Site", amount: 1000 }],
        },
      ],
    },
  ]
  const months = parsePersistedBillingScheduleToMonths(schedule)
  assert.ok(months)
  const m = months![0]
  assert.equal(m.production, "$500.00")
  assert.equal(m.mediaCosts.production, "$500.00")
})

test("mediaTypes Production agrees with top-level — both $500.00", () => {
  const schedule = [
    {
      monthYear: "June 2026",
      production: "$500.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      mediaTypes: [
        {
          mediaType: "Production",
          lineItems: [
            { header1: "Prod A", header2: "", amount: 300 },
            { header1: "Prod B", header2: "", amount: 200 },
          ],
        },
      ],
    },
  ]
  const months = parsePersistedBillingScheduleToMonths(schedule)
  assert.ok(months)
  const m = months![0]
  assert.equal(m.production, "$500.00")
  assert.equal(m.mediaCosts.production, "$500.00")
})

test("mediaTypes Production disagrees with top-level — sum wins ($500.00)", () => {
  const schedule = [
    {
      monthYear: "July 2026",
      production: "$300.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      mediaTypes: [
        {
          mediaType: "Production",
          lineItems: [
            { header1: "Prod A", header2: "", amount: 300 },
            { header1: "Prod B", header2: "", amount: 200 },
          ],
        },
      ],
    },
  ]
  const months = parsePersistedBillingScheduleToMonths(schedule)
  assert.ok(months)
  const m = months![0]
  assert.equal(m.production, "$500.00")
  assert.equal(m.mediaCosts.production, "$500.00")
})

test("no production at all — both fields $0.00", () => {
  const schedule = [
    {
      monthYear: "August 2026",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      mediaTypes: [
        {
          mediaType: "Search",
          lineItems: [{ header1: "KW", header2: "", amount: 100 }],
        },
      ],
    },
  ]
  const months = parsePersistedBillingScheduleToMonths(schedule)
  assert.ok(months)
  const m = months![0]
  assert.equal(m.production, "$0.00")
  assert.equal(m.mediaCosts.production, "$0.00")
})

test("glenda005 April 2026 shape — top-level $500, no mediaTypes Production", () => {
  const schedule = [
    {
      monthYear: "April 2026",
      production: "$500.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      mediaTypes: [
        {
          mediaType: "Digital Display",
          lineItems: [
            {
              lineItemId: "digiDisplay-Example-0",
              header1: "Example Network",
              header2: "Example Site",
              amount: 2500,
            },
          ],
        },
      ],
    },
  ]
  const months = parsePersistedBillingScheduleToMonths(schedule)
  assert.ok(months)
  const april = months!.find((m) => m.monthYear === "April 2026")
  assert.ok(april)
  assert.equal(april.production, "$500.00")
  assert.equal(april.mediaCosts.production, "$500.00")
})

test("search and social fee is the saved feeTotal only, never media x fee % (fee-on-top path removed)", () => {
  const schedule = [
    {
      monthYear: "May 2026",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      mediaTypes: [
        { mediaType: "Search", lineItems: [{ header1: "Google", header2: "Brand", amount: 1000 }] },
        { mediaType: "Social Media", lineItems: [{ header1: "Meta", header2: "Reach", amount: 2000 }] },
      ],
    },
    {
      monthYear: "June 2026",
      feeTotal: "$150.00",
      adservingTechFees: "$0.00",
      mediaTypes: [{ mediaType: "Search", lineItems: [{ header1: "Google", header2: "Brand", amount: 1000 }] }],
    },
  ]
  const months = parsePersistedBillingScheduleToMonths(schedule)
  assert.ok(months)
  assert.equal(months![0].feeTotal, "$0.00")
  assert.equal(months![0].totalAmount, "$3,000.00")
  assert.equal(months![1].feeTotal, "$150.00")
  assert.equal(months![1].totalAmount, "$1,150.00")
})
