import assert from "node:assert/strict"
import test from "node:test"

import { socialMediaFormSchema } from "../schemas.js"
import { mergeSocialMediaStandardFromExpertWithPrevious } from "../expertModeSwitch.js"

test("social merge clears identity for unmatched generated rows", () => {
  const [merged] = mergeSocialMediaStandardFromExpertWithPrevious(
    [
      {
        platform: "Meta",
        bidStrategy: "Lowest cost",
        buyType: "cpm",
        creativeTargeting: "",
        creative: "",
        buyingDemo: "",
        market: "",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        noadserving: false,
        line_item: 4,
        lineItem: 4,
        line_item_id: "MBA123SM4",
        lineItemId: "MBA123SM4",
        bursts: [],
      },
    ],
    []
  )

  assert.equal(merged?.line_item, undefined)
  assert.equal(merged?.lineItem, undefined)
  assert.equal(merged?.line_item_id, undefined)
  assert.equal(merged?.lineItemId, undefined)
})

test("social form schema accepts optional line item identity fields", () => {
  const parsed = socialMediaFormSchema.parse({
    lineItems: [
      {
        platform: "Meta",
        bidStrategy: "Lowest cost",
        buyType: "cpm",
        creativeTargeting: "",
        creative: "",
        buyingDemo: "",
        market: "",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        noadserving: false,
        line_item: 7,
        lineItem: 7,
        line_item_id: "MBA123SM7",
        lineItemId: "MBA123SM7",
        bursts: [
          {
            budget: "100",
            buyAmount: "100",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-01-07"),
            calculatedValue: 0,
            fee: 0,
          },
        ],
      },
    ],
  })

  assert.equal(parsed.lineItems[0]?.line_item, 7)
  assert.equal(parsed.lineItems[0]?.lineItem, 7)
  assert.equal(parsed.lineItems[0]?.line_item_id, "MBA123SM7")
  assert.equal(parsed.lineItems[0]?.lineItemId, "MBA123SM7")
})
