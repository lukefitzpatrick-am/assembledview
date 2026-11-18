import assert from "node:assert/strict"
import test from "node:test"

test("DigiDisplay burst builder attaches canonical line item id for KPI join", async () => {
  const { getDigiDisplayBursts } = await import("@/lib/mediaplan/legacyBillingBursts")

  const bursts = getDigiDisplayBursts(
    {
      getValues(name: "lineItems") {
        assert.equal(name, "lineItems")
        return [
          {
            platform: "DV360",
            site: "Example",
            buyType: "cpc",
            publisher: "Example Publisher",
            bursts: [
              {
                startDate: new Date("2026-05-01"),
                endDate: new Date("2026-05-31"),
                budget: "1000",
                calculatedValue: 100,
              },
            ],
          },
        ]
      },
    },
    10,
    "MBA123",
  )

  assert.equal(bursts[0]?.lineItemId, "MBA123DD1")
})
