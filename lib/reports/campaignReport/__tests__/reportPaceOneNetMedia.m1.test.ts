/**
 * M1 R10: the report pace helper hands its `one_net_media` value to the
 * expected net helper, for the whole line and for a window. 10.50 at 7% is
 * the cent-edge pair.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { netBurstExpectedInWindow } from "@/lib/reports/campaignReport/reportPace"

const line = {
  bursts: [{ startDate: "2026-10-01", endDate: "2026-10-31", budget: 10.5 }],
  budgetIncludesFees: true,
  feePct: 7,
  lineBudget: 10.5,
  lineStart: "2026-10-01",
  lineEnd: "2026-10-31",
  lineItemId: "m1rp1",
  asOf: "2026-10-31",
}

test("report pace follows the passed one_net_media value", () => {
  assert.equal(netBurstExpectedInWindow({ ...line, oneNetMedia: true }), 9.765)
  assert.equal(netBurstExpectedInWindow({ ...line, oneNetMedia: false }), 9.764999999999999)
  const window = { windowStart: "2026-10-01", windowEnd: "2026-10-31" }
  assert.equal(netBurstExpectedInWindow({ ...line, ...window, oneNetMedia: true }), 9.765)
  assert.equal(netBurstExpectedInWindow({ ...line, ...window, oneNetMedia: false }), 9.764999999999999)
})
