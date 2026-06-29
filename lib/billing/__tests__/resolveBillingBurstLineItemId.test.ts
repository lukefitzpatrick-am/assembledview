import assert from "node:assert/strict"
import test from "node:test"

import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import { resolveBillingBurstLineItemId } from "../resolveBillingBurstLineItemId.js"

test("uses stored line item id before recomputing a burst join key", () => {
  assert.equal(
    resolveBillingBurstLineItemId(
      { line_item_id: " MBA123DD9 ", lineItemId: "MBA123DD2" },
      "MBA123",
      MEDIA_TYPE_ID_CODES.digitalDisplay,
      0,
    ),
    "MBA123DD9",
  )

  assert.equal(
    resolveBillingBurstLineItemId(
      { lineItemId: " MBA123DD2 " },
      "MBA123",
      MEDIA_TYPE_ID_CODES.digitalDisplay,
      0,
    ),
    "MBA123DD2",
  )
})

test("recomputes burst join key with the same identity inputs when no stored id exists", () => {
  assert.equal(
    resolveBillingBurstLineItemId(
      { line_item: 7 },
      "MBA123",
      MEDIA_TYPE_ID_CODES.digitalDisplay,
      0,
    ),
    "MBA123DD7",
  )

  assert.equal(
    resolveBillingBurstLineItemId(
      {},
      "MBA123",
      MEDIA_TYPE_ID_CODES.digitalDisplay,
      2,
    ),
    "MBA123DD3",
  )
})
