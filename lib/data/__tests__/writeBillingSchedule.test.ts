import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { reconcileBillingOverrideSources } from "../writeBillingSchedule"

describe("reconcileBillingOverrideSources", () => {
  it("marks matching billing months as override with override amounts", () => {
    const rows = reconcileBillingOverrideSources(
      [
        {
          versionId: 1,
          lineItemId: "MBA001",
          component: "media",
          basis: "billing",
          month: "2026-08-01",
          amountCents: 10000,
          source: "computed",
        },
      ],
      [
        {
          lineItemId: "MBA001",
          component: "media",
          months: [{ month: "2026-08", amount: 150 }],
        },
      ]
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.source, "override")
    assert.equal(rows[0]!.amountCents, 15000)
  })
})
