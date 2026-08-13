/**
 * getDeliveredTotalsForCampaign — no range must match the unbounded loader call.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const loadDeliverySnapshot = mock.fn(
  async (_input: { mbaNumber: string; startDate?: string; endDate?: string }) => ({
    asOf: "2026-06-01",
    planTotals: {
      spendToDate: 10,
      impressions: 100,
      clicks: 2,
      results: 1,
      video3sViews: 0,
    },
  }),
)

const fetchDirectPacingRows = mock.fn(async () => [])

if (supportsMockModule()) {
  await mock.module!("@/lib/delivery/loadDeliverySnapshot", {
    namedExports: { loadDeliverySnapshot },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: { fetchDirectPacingRows },
  })
  await mock.module!("@/lib/pacing/maths", {
    namedExports: { getAsOfDate: () => "2026-06-01" },
  })
}

test(
  "getDeliveredTotalsForCampaign with no range equals the unbounded call",
  { skip },
  async () => {
    const { getDeliveredTotalsForCampaign } = await import("../getDeliveredTotalsForCampaign.js")

    loadDeliverySnapshot.mock.resetCalls()
    const unbounded = await getDeliveredTotalsForCampaign({ mbaNumber: "foo001" })
    const noRangeArgs = loadDeliverySnapshot.mock.calls[0]?.arguments[0] as {
      startDate?: string
      endDate?: string
    }

    loadDeliverySnapshot.mock.resetCalls()
    const explicitEmpty = await getDeliveredTotalsForCampaign({
      mbaNumber: "foo001",
      startDate: null,
      endDate: null,
    })
    const emptyArgs = loadDeliverySnapshot.mock.calls[0]?.arguments[0] as {
      startDate?: string
      endDate?: string
    }

    assert.deepEqual(unbounded, explicitEmpty)
    assert.equal(noRangeArgs.startDate, undefined)
    assert.equal(noRangeArgs.endDate, undefined)
    assert.equal(emptyArgs.startDate, undefined)
    assert.equal(emptyArgs.endDate, undefined)
  },
)

test(
  "getDeliveredTotalsForCampaign passes DATE_DAY bounds when a range is set",
  { skip },
  async () => {
    const { getDeliveredTotalsForCampaign } = await import("../getDeliveredTotalsForCampaign.js")
    loadDeliverySnapshot.mock.resetCalls()
    await getDeliveredTotalsForCampaign({
      mbaNumber: "foo001",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    })
    const args = loadDeliverySnapshot.mock.calls[0]?.arguments[0] as {
      startDate?: string
      endDate?: string
    }
    assert.equal(args.startDate, "2026-03-01")
    assert.equal(args.endDate, "2026-03-31")
  },
)
