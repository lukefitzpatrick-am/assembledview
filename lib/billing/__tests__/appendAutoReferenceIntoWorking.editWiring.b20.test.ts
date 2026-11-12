/**
 * MB-30 (B20) edit wiring pins. The page can't be mounted here, so these read
 * its source like the MB-23 pins do: both merge call sites pass the MBA number
 * and report reconciles, and both union paths use unionGeneratedBillingLines.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const page = readFileSync(join(process.cwd(), "app/mediaplans/mba/[mba_number]/edit/page.tsx"), "utf8")

function count(re: RegExp): number {
  return [...page.matchAll(re)].length
}

test("every append merge option set passes the MBA number and reports reconciles", () => {
  // calculateBillingSchedule resync, append effect follow-auto and non-follow branches.
  // B35 (MB-40): each also passes the loaded lines' number check.
  assert.equal(count(/mbaNumber: mbaNumberRef\.current,\n\s+aliasNumberCheck: billingAliasNumberCheckRef\.current,\n\s+onReconcile: \(entries\) => reportAliasReconcileRef\.current\("merge", entries\)/g), 3)
  assert.equal(count(/= appendAutoReferenceIntoWorkingBilling\(\n/g), 2)
})

test("both union paths go through unionGeneratedBillingLines with the MBA number", () => {
  assert.equal(count(/unionGeneratedBillingLines\(li\[(mediaKey|key)\], generatedList, \{\n\s+mediaKey(: key)?,\n\s+mbaNumber: mbaNumberRef\.current,\n\s+aliasNumberCheck: billingAliasNumberCheckRef\.current,/g), 2)
  assert.match(page, /reportAliasReconcileRef\.current\("modal_open", modalReconcile\)/)
  assert.match(page, /reportAliasReconcileRef\.current\("attach", attachReconcile\)/)
  // The old id-only union filter is gone.
  assert.doesNotMatch(page, /const newItems = generatedList\.filter/)
})
