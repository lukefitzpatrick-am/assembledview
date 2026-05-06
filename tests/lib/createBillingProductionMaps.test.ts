import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const createPageSource = readFileSync(
  join(process.cwd(), "app/mediaplans/create/page.tsx"),
  "utf8"
)

const productionMapEntry =
  /mp_production:\s*\{\s*lineItems:\s*productionLineItems,\s*key:\s*"production"\s*\}/

test("create manual billing map includes production line items", () => {
  const start = createPageSource.indexOf("function handleManualBillingOpen()")
  const end = createPageSource.indexOf("function handleManualBillingChange(", start)

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.match(createPageSource.slice(start, end), productionMapEntry)
})

test("create billing Excel export map includes production line items", () => {
  const start = createPageSource.indexOf("async function handleDownloadBillingScheduleExcel()")
  const end = createPageSource.indexOf("const [mediaPlanId", start)

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.match(createPageSource.slice(start, end), productionMapEntry)
})
