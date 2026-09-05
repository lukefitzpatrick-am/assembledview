/**
 * Shared glenda008-shaped inputs for C-95 billing / finance tests.
 */
import type { LineItemInput } from "../campaignFinancials.types.js"
import { computeCampaignFinancials } from "../computeCampaignFinancials.js"

function glendaSocialLine(): LineItemInput {
  return {
    lineItemId: "billing-socialMedia::glenda008SM1",
    mediaType: "social",
    buyType: "cpm",
    rate: 10,
    enteredAmount: 20_000,
    budgetIncludesFees: false,
    clientPaysForMedia: true,
    bursts: [
      {
        startDate: "2026-07-01",
        endDate: "2026-09-18",
        budget: 20_000,
        buyAmount: 10,
      },
    ],
    approval: "approved",
    label: "Meta | Prospecting",
  }
}

function glendaAgencyRadio(): LineItemInput {
  return {
    lineItemId: "billing-radio::glenda008RAD1",
    mediaType: "radio",
    buyType: "spots",
    rate: 1,
    enteredAmount: 40_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    bursts: [
      {
        startDate: "2026-07-01",
        endDate: "2026-09-30",
        budget: 40_000,
      },
    ],
    approval: "approved",
    label: "Nova | Sydney",
  }
}

export function glenda008ClientPaysFinancials() {
  return computeCampaignFinancials([glendaSocialLine(), glendaAgencyRadio()], {
    feeLoading: { feesocial: 20, feeradio: 0 },
  }, {
    campaignStart: new Date("2026-07-01T00:00:00"),
    campaignEnd: new Date("2026-09-30T00:00:00"),
  })
}
