import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("downloading the invoicing workbook does not stamp exported_at", () => {
  const page = fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../components/finance/sections/invoicing/InvoicingPageClient.tsx"
    ),
    "utf8"
  )
  const start = page.indexOf("const exportExcel")
  const end = page.indexOf("const approveReady")
  assert.ok(start >= 0 && end > start, "exportExcel handler must exist")
  const handler = page.slice(start, end)
  assert.equal(
    handler.includes("markBillingRecordsExported"),
    false,
    "Excel download must not call markBillingRecordsExported"
  )
})

test("mark-as-sent confirm is an AlertDialog and never window.confirm", () => {
  const src = fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../components/finance/sections/invoicing/MarkSentToFinanceButton.tsx"
    ),
    "utf8"
  )
  assert.ok(src.includes("AlertDialog"), "must use AlertDialog")
  assert.ok(src.includes('layer="nested"'), "must declare layer=nested")
  assert.equal(src.includes("window.confirm"), false)
  assert.ok(src.includes("MARK_SENT_TO_FINANCE_COPY"))
})
