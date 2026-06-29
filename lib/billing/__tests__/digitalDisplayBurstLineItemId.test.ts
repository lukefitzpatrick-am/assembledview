import assert from "node:assert/strict"
import test from "node:test"

test("DigiDisplay burst builder attaches canonical line item id for KPI join", async () => {
  process.env.XANO_PUBLISHERS_BASE_URL = "https://example.test"
  process.env.XANO_CLIENTS_BASE_URL = "https://example.test"
  process.env.XANO_MEDIA_DETAILS_BASE_URL = "https://example.test"
  process.env.XANO_MEDIA_PLANS_BASE_URL = "https://example.test"

  const { getDigiDisplayBursts } = await import(
    "@/components/media-containers/DigitalDisplayContainer"
  )

  const bursts = getDigiDisplayBursts(
    {
      getValues(name: "digidisplaylineItems") {
        assert.equal(name, "digidisplaylineItems")
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
