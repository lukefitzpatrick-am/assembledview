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
