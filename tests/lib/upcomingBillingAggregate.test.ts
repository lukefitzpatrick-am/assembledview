import assert from "node:assert/strict"
import test from "node:test"
import type { FinanceCampaignData } from "../../lib/finance/utils.js"
import {
  aggregateMediaLineItemsByType,
  aggregateServiceRowsByService,
  combineFinanceCampaignLists,
  sumCampaignTotals,
} from "../../lib/finance/upcomingBillingAggregate.js"

const baseCampaign = (over: Partial<FinanceCampaignData>): FinanceCampaignData => ({
  clientName: "Acme",
  mbaNumber: "MBA1",
  campaignName: "C1",
  paymentDays: 30,
  paymentTerms: "Net 30",
  invoiceDate: "2026-03-31",
  lineItems: [],
  serviceRows: [],
  total: 0,
  ...over,
})

test("combineFinanceCampaignLists merges booked and other", () => {
  const a = baseCampaign({ mbaNumber: "A", total: 1 })
  const b = baseCampaign({ mbaNumber: "B", total: 2 })
  const out = combineFinanceCampaignLists([a], [b])
  assert.equal(out.length, 2)
  assert.equal(out[0].mbaNumber, "A")
  assert.equal(out[1].mbaNumber, "B")
})

test("aggregateMediaLineItemsByType sums by media type and sorts by amount", () => {
  const campaigns = [
    baseCampaign({
      lineItems: [
        { itemCode: "D.Search", mediaType: "Search", description: "x", amount: 100 },
        { itemCode: "D.Social", mediaType: "Social Media", description: "y", amount: 50 },
      ],
    }),
    baseCampaign({
      lineItems: [{ itemCode: "D.Search", mediaType: "Search", description: "z", amount: 25 }],
    }),
  ]
  const rows = aggregateMediaLineItemsByType(campaigns)
  assert.deepEqual(rows, [
    { mediaType: "Search", amount: 125 },
    { mediaType: "Social Media", amount: 50 },
  ])
})

test("aggregateServiceRowsByService groups fee lines", () => {
  const campaigns = [
    baseCampaign({
      serviceRows: [
        { itemCode: "T.Adserving", service: "Adserving and Tech Fees", amount: 10 },
        { itemCode: "Service", service: "Assembled Fee", amount: 5 },
      ],
    }),
    baseCampaign({
      serviceRows: [{ itemCode: "T.Adserving", service: "Adserving and Tech Fees", amount: 3 }],
    }),
  ]
  const rows = aggregateServiceRowsByService(campaigns)
  assert.deepEqual(rows, [
    { service: "Adserving and Tech Fees", amount: 13 },
    { service: "Assembled Fee", amount: 5 },
  ])
})

test("sumCampaignTotals adds campaign totals", () => {
  const campaigns = [baseCampaign({ total: 100.2 }), baseCampaign({ total: 50.555 })]
  assert.equal(sumCampaignTotals(campaigns), 150.76)
})
