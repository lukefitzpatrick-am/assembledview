/**
 * M8 (B21) switch and edit wiring pins (switch `partial_mba_billing_guard`).
 * The page can't be mounted here, so these read its source like the B20 pins.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { featureDefinition } from "@/lib/features/registry"

const page = readFileSync(join(process.cwd(), "app/mediaplans/mba/[mba_number]/edit/page.tsx"), "utf8")

test("switch: planning, admin, default off, sent to the browser", () => {
  const d = featureDefinition("partial_mba_billing_guard")
  assert.ok(d)
  assert.equal(d!.defaultOn, false)
  assert.equal(d!.area, "planning")
  assert.equal(d!.toggleRole, "admin")
  assert.equal(d!.clientVisible, true)
  assert.equal(d!.source, "switch")
  assert.equal(d!.envName, undefined)
})

test("page reads the switch once, and each use is gated by it", () => {
  assert.equal((page.match(/clientFeatureOn\("partial_mba_billing_guard"\)/g) ?? []).length, 1)
  assert.match(page, /function getPartialMbaBillingFallbackMonths\(\): BillingMonth\[\] \| null \{\n\s+if \(!partialMbaBillingGuardOn\) return null/)
  assert.match(page, /partialFeeFromFeeMonths: partialMbaBillingGuardOn,/)
  assert.equal((page.match(/partialFeeFromFeeMonths/g) ?? []).length, 1)
})

test("fallback order: working billing with line rows, then auto billing months (switch on), then delivery", () => {
  const raw = page.slice(page.indexOf("function getPartialMbaRawMonthsForBaseline"), page.indexOf("function getPartialMbaLineItemMonths"))
  const primaryAt = raw.indexOf("if (billingMonthsHaveDetailedLineItems(primary)) return primary")
  const billingAt = raw.indexOf("if (billingFallback) return billingFallback")
  const deliveryAt = raw.indexOf("return autoDeliveryMonths.length > 0 ? autoDeliveryMonths : workingBillingMonths")
  assert.ok(primaryAt > 0 && billingAt > primaryAt && deliveryAt > billingAt)
  const lines = page.slice(page.indexOf("function getPartialMbaLineItemMonths"), page.indexOf("function recomputePartialMBAFromLineItems"))
  assert.match(lines, /if \(billingFallback\) return deepCloneBillingMonths\(billingFallback\)\n\s+const base = autoDeliveryMonths/)
})
