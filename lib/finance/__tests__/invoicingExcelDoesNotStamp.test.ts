import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("invoicing page does not download a workbook or mark rows sent", () => {
  const page = fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../components/finance/sections/invoicing/InvoicingPageClient.tsx"
    ),
    "utf8"
  )
  assert.equal(page.includes("exportReceivablesWorkbook"), false)
  assert.equal(page.includes("markBillingRecordsExported"), false)
  assert.equal(page.includes("SendToAccountsButton"), true)
})

test("filter row no longer hosts Approve ready or the export caption", () => {
  const src = fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../components/finance/sections/invoicing/InvoicingLocalFilters.tsx"
    ),
    "utf8"
  )
  assert.equal(src.includes("Approve ready"), false)
  assert.equal(src.includes("onApproveReady"), false)
  assert.equal(src.includes("Only approved invoices export."), false)
})

test("send-to-accounts confirm is an AlertDialog and never window.confirm", () => {
  const src = fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../components/finance/sections/invoicing/SendToAccountsButton.tsx"
    ),
    "utf8"
  )
  assert.ok(src.includes("AlertDialog"), "must use AlertDialog")
  assert.ok(src.includes('layer="nested"'), "must declare layer=nested")
  assert.equal(src.includes("window.confirm"), false)
})

// ── Download Excel / CSV (review before sending) ──────────────────────────
// Behaviour (no fetch writes, records untouched, status rows) is in
// invoicingReviewDownload.test.ts, which needs --experimental-test-module-mocks.

const here = path.dirname(fileURLToPath(import.meta.url))

test("page wires Download Excel and CSV to the read-only review module", () => {
  const page = fs.readFileSync(
    path.join(here, "../../../components/finance/sections/invoicing/InvoicingPageClient.tsx"),
    "utf8"
  )
  assert.ok(page.includes("downloadInvoicingReviewWorkbook"))
  assert.ok(page.includes("downloadInvoicingReviewCsv"))
  assert.ok(page.includes("Download Excel"))
  assert.ok(page.includes("Download CSV"))
  assert.ok(page.includes('"Workbook downloaded"'))
  assert.ok(page.includes("[FIN-6]"))
})

test("review module never writes: no POST, no stamp, no send route", () => {
  const src = fs.readFileSync(path.join(here, "../invoicingReviewDownload.ts"), "utf8")
  for (const banned of [
    "method:",
    "POST",
    "markBillingRecordsExported",
    "approveBillingRecords",
    "send-to-accounts",
    "exported_at =",
    "stampFinanceBillingRecord",
    "fetch(",
  ]) {
    assert.equal(src.includes(banned), false, `must not contain ${banned}`)
  }
})
