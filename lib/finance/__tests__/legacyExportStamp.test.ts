import assert from "node:assert/strict"
import test from "node:test"

import { resolveBillingState } from "../billingLifecycle.js"
import { isLegacyExportStamp, LEGACY_BILLED_LABEL } from "../legacyExportStamp.js"
import { summariseLastExport } from "../approvedReceivablesExport.js"
import { invoicingFunnelBucket } from "../sections/invoicingFunnel.js"
import { invoicingPrimaryAction } from "../sections/invoicingRowPresentation.js"
import { billingInXeroCell } from "../sections/billingPresentation.js"
import { BILLING_STATE } from "@/lib/design/status.js"
import type { BillingRecord } from "@/lib/types/financeBilling.js"

const TODAY = new Date("2026-11-01T09:00:00+11:00")

test("C-150 predicate: epoch AND by 0, in every stamp shape; anything else is a real send", () => {
  for (const at of ["1970-01-01 00:00:00+00", "1970-01-01T00:00:00.000Z", "1970-01-01T00:00:00Z", 0, new Date(0)]) {
    assert.equal(isLegacyExportStamp(at, 0), true, String(at))
    assert.equal(isLegacyExportStamp(at, "0"), true, String(at))
  }
  assert.equal(isLegacyExportStamp("1970-01-01 00:00:00+00", 321), false)
  assert.equal(isLegacyExportStamp("1970-01-01 00:00:00+00", null), false)
  assert.equal(isLegacyExportStamp("2026-10-31T01:00:00Z", 0), false)
  assert.equal(isLegacyExportStamp(null, 0), false)
  assert.equal(isLegacyExportStamp("", 0), false)
  assert.equal(LEGACY_BILLED_LABEL, "Billed before AssembledView")
})

test("lifecycle: legacy stamp is legacy_billed, not sent_to_finance; a live Xero match still wins", () => {
  const legacy = resolveBillingState({
    approvedAt: null,
    exportedAt: "1970-01-01T00:00:00.000Z",
    exportedBy: 0,
    xero: null,
    today: TODAY,
  })
  assert.equal(legacy.state, "legacy_billed")
  const real = resolveBillingState({ approvedAt: "2026-10-30", exportedAt: "2026-10-31T01:00:00Z", exportedBy: 321, xero: null, today: TODAY })
  assert.equal(real.state, "sent_to_finance")
  const noBy = resolveBillingState({ approvedAt: null, exportedAt: "1970-01-01T00:00:00.000Z", xero: null, today: TODAY })
  assert.equal(noBy.state, "sent_to_finance", "without exported_by the old reading stands")
  const paid = resolveBillingState({
    approvedAt: null,
    exportedAt: "1970-01-01T00:00:00.000Z",
    exportedBy: 0,
    xero: { status: "PAID", amountDue: 0, dueDate: "2026-02-28", fullyPaidDate: "2026-03-01" },
    today: TODAY,
  })
  assert.equal(paid.state, "paid")
})

test("legacy rows sit with the closed states: no Approve, In Xero, Issued outside AV tile, own label", () => {
  assert.equal(invoicingPrimaryAction("legacy_billed"), null)
  assert.equal(billingInXeroCell("legacy_billed", null).kind, "in_xero")
  assert.equal(invoicingFunnelBucket("legacy_billed"), "issued_outside_av")
  assert.equal(invoicingFunnelBucket("sent_to_finance"), "sent_to_finance")
  assert.deepEqual(BILLING_STATE.legacy_billed, { tone: "ink", label: "Billed before AssembledView" })
})

function rec(partial: Partial<BillingRecord>): BillingRecord {
  return {
    id: 1,
    clients_id: 1,
    client_name: "Acme",
    billing_type: "media",
    mba_number: "X001",
    campaign_name: "Camp",
    billing_month: "2026-07",
    status: "booked",
    total: 100,
    line_items: [],
    ...partial,
  } as BillingRecord
}

test("latest export ignores the legacy stamp, and is null when only legacy rows are stamped", () => {
  const rows = [
    rec({ clients_id: 1, total: 500, exported_at: "1970-01-01 00:00:00+00", exported_by: 0 }),
    rec({ clients_id: 2, total: 120.5, exported_at: "2026-10-31T01:00:00.000Z", exported_by: 321, exported_by_name: "Luke" }),
  ]
  const s = summariseLastExport(rows)
  assert.equal(s?.exportedAt, "2026-10-31T01:00:00.000Z")
  assert.equal(s?.clientCount, 1)
  assert.equal(s?.total, 120.5)
  assert.equal(summariseLastExport([rows[0]!]), null)
})
