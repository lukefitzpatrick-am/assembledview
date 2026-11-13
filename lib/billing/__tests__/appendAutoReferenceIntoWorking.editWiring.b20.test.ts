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

test("B35fix (L3): the number check gets every loaded line state, production included, below their declarations", () => {
  const start = page.indexOf("const billingAliasNumberCheck = useMemo(")
  assert.ok(start > 0)
  const block = page.slice(start, page.indexOf("billingAliasNumberCheckRef.current = billingAliasNumberCheck", start))
  const passed = new Map([...block.matchAll(/^\s+(\w+): (\w+LineItems),$/gm)].map((m) => [m[1]!, m[2]!]))
  // The loaded line states, from the post-save writers (`initial: set<State>`).
  const writers = [...page.matchAll(/^\s+(\w+): \{ media: set\w+, initial: set(\w+LineItems) \},$/gm)]
  assert.ok(writers.length >= 20, `writers found: ${writers.length}`)
  for (const [, key, setterState] of writers) {
    const mediaKey = key === "social" ? "socialMedia" : key!
    const state = setterState!.charAt(0).toLowerCase() + setterState!.slice(1)
    assert.equal(passed.get(mediaKey), state, `${mediaKey} passes ${state}`)
    assert.match(block, new RegExp(`\\n\\s+${state},\\n`), `${state} is a dependency`)
    // Declared before the memo reads it (no temporal dead zone at render).
    const decl = page.indexOf(`const [${state}, `)
    assert.ok(decl > 0 && decl < start, `${state} declared before the number check`)
  }
  assert.equal(passed.get("production"), "productionLineItems")
})
