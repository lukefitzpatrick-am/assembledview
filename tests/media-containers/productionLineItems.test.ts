import assert from "node:assert/strict"
import test from "node:test"
import { shouldIncludeMediaPlanLineItem } from "../../lib/mediaplan/advertisingAssociatesExcel.js"
import { mapProductionLineItemsForExport } from "../../lib/mediaplan/productionLineItems.js"

test("production export mapper emits includeable media plan rows", () => {
  const rows = mapProductionLineItemsForExport(
    [
      {
        mediaType: "Video",
        publisher: "Studio One",
        description: "Hero asset",
        market: "AU",
        lineItemId: "MBA-123-PROD-1",
        bursts: [
          {
            cost: 2500,
            amount: 2,
            startDate: new Date(2026, 4, 1),
            endDate: new Date(2026, 4, 31),
          },
        ],
      },
    ],
    "MBA-123"
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0].platform, "production")
  assert.equal(rows[0].network, "Studio One")
  assert.equal(rows[0].deliverablesAmount, "2500")
  assert.equal(rows[0].grossMedia, "5000")
  assert.equal(shouldIncludeMediaPlanLineItem(rows[0]), true)
})
