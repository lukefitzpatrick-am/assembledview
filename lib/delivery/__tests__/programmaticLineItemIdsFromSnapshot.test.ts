import assert from "node:assert/strict"
import test from "node:test"

import { programmaticLineItemIdsFromSnapshot } from "../deliveredTotals"

test("programmatic_ooh snapshot ids are excluded from Direct like the CF-DASH video case", () => {
  const ids = programmaticLineItemIdsFromSnapshot({
    channels: [
      { group: "programmatic_video", lines: [{ lineItemId: "bicau002pv1" }] },
      { group: "programmatic_ooh", lines: [{ lineItemId: "legal004po1" }] },
      { group: "digital_display", lines: [{ lineItemId: "legal004dd1" }] },
    ],
  })
  assert.equal(ids.has("legal004po1"), true)
  assert.equal(ids.has("bicau002pv1"), true)
  assert.equal(ids.has("legal004dd1"), false)
})
