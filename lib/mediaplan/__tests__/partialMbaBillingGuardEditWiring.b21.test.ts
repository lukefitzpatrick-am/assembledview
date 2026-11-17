/**
 * M8 (B21) edit wiring pin: the guard notice in the MBA billing window.
 * The switch, month order, guard and rail line are behaviour tests in
 * app/mediaplans/_form/__tests__/partialMba.test.ts (B52).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const page = readFileSync(join(process.cwd(), "app/mediaplans/mba/[mba_number]/edit/page.tsx"), "utf8")

test("page reads the switch once", () => {
  assert.equal((page.match(/clientFeatureOn\("partial_mba_billing_guard"\)/g) ?? []).length, 1)
})

test("guard shows in the MBA billing window", () => {
  assert.match(page, /<PartialMbaBillingGuardNotice\n\s+result=\{partialMbaBillingGuard\}/)
})
