import assert from "node:assert/strict"
import test from "node:test"

import { trueUpFixedCells } from "../loadRevisionContext"
import type { RevisionLine } from "../types"

const line = (id: string): RevisionLine => ({
  lineItemId: id,
  label: id,
  channel: "social",
  isProduction: false,
  clientPaysForMedia: false,
  isAaLine: false,
  media: {},
  fee: {},
  adserving: {},
})

test("service rows and rows with no line are fixed cells, split like the report", () => {
  const out = trueUpFixedCells({
    lines: [line("x001SM1")],
    billingRows: [
      { lineItemId: "x001SM1", component: "media", month: "2026-09-01", amountCents: 100, source: "computed" },
      { lineItemId: "billing-socialMedia::x001SM1", component: "fee", month: "2026-09-01", amountCents: 25, source: "computed" },
      { lineItemId: "__service__fees", component: "fee", month: "2026-09-01", amountCents: 500, source: "computed" },
      { lineItemId: "__service__adserving", component: "adserving", month: "2026-09-01", amountCents: 40, source: "computed" },
      { lineItemId: "__service__production", component: "media", month: "2026-10-01", amountCents: 900, source: "computed" },
      { lineItemId: "__service__media_total", component: "media", month: "2026-10-01", amountCents: 7000, source: "computed" },
      { lineItemId: "x001PROD2", component: "media", month: "2026-10-01", amountCents: 300, source: "computed" },
      { lineItemId: "x001DD9", component: "media", month: "2026-10-01", amountCents: 11, source: "computed" },
    ],
  })
  assert.deepEqual(out, {
    fee: { "2026-09": 500 },
    adserving: { "2026-09": 40 },
    production: { "2026-10": 1200 },
    media: { "2026-10": 7011 },
  })
})
