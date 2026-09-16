import assert from "node:assert/strict"
import test from "node:test"

import { programmaticLineItemIdsFromSnapshot } from "../deliveredTotals"

test("overlay snapshot ids (programmatic + direct-digital) are excluded from the Direct sum", () => {
  const ids = programmaticLineItemIdsFromSnapshot({
    channels: [
      { group: "programmatic_video", lines: [{ lineItemId: "bicau002pv1" }] },
      { group: "programmatic_ooh", lines: [{ lineItemId: "legal004po1" }] },
      { group: "digital_display", lines: [{ lineItemId: "legal004dd1" }] },
      { group: "bvod", lines: [{ lineItemId: "bicau002bv2" }] },
      { group: "social_meta", lines: [{ lineItemId: "bicau002sm1" }] },
    ],
  })
  assert.equal(ids.has("legal004po1"), true)
  assert.equal(ids.has("bicau002pv1"), true)
  assert.equal(ids.has("legal004dd1"), true)
  assert.equal(ids.has("bicau002bv2"), true)
  assert.equal(ids.has("bicau002sm1"), false)
})
