/**
 * MB-23 — no code path reachable from the MBA & billing modal may POST
 * /api/billing-overrides. Campaign save (and leftover PC4/C3 save helpers) may
 * still call the client; this suite pins the modal surface.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

/** Strip block comments so commented-out call sites do not fail the pin. */
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "")
}

test("MB-23: MbaBillingModal + LineTimingInlineEditor never hit billing-overrides API", () => {
  for (const rel of [
    "components/billing/MbaBillingModal.tsx",
    "components/billing/LineTimingInlineEditor.tsx",
  ]) {
    const src = stripBlockComments(readSrc(rel))
    assert.doesNotMatch(
      src,
      /\/api\/billing-overrides/,
      `${rel} must not reference /api/billing-overrides`
    )
    assert.doesNotMatch(
      src,
      /replaceBillingOverrideLineClient|resetBillingOverrideLineClient|persistManualBillingOverrides/,
      `${rel} must not import override writers`
    )
  }
})

test("MB-23: edit Apply / Reset / date-basis keep are state-only (no override POST)", () => {
  const src = stripBlockComments(
    readSrc("app/mediaplans/mba/[mba_number]/edit/page.tsx")
  )

  // Extract handleManualBillingSave body (Apply).
  const applyStart = src.indexOf("async function handleManualBillingSave")
  assert.ok(applyStart >= 0, "handleManualBillingSave present")
  const applyEnd = src.indexOf("\n  // Media type display names mapping", applyStart)
  assert.ok(applyEnd > applyStart, "Apply function bounds")
  const applyBody = src.slice(applyStart, applyEnd)
  assert.doesNotMatch(
    applyBody,
    /persistManualBillingOverrides|replaceBillingOverrideLineClient|resetBillingOverrideLineClient|fetchBillingOverridesClient|reportBillingOverridesRefetchAnomaly/
  )
  assert.match(applyBody, /buildPendingBillingOverrideRows/)
  assert.match(applyBody, /MB-23/)

  // Extract Reset handler (ends at its useCallback deps).
  const resetStart = src.indexOf(
    "const handleManualBillingLineItemResetToAuto = useCallback"
  )
  assert.ok(resetStart >= 0)
  const resetDeps = src.indexOf("}, [manualBillingMonths])", resetStart)
  assert.ok(resetDeps > resetStart)
  const resetBody = src.slice(resetStart, resetDeps)
  assert.doesNotMatch(
    resetBody,
    /resetBillingOverrideLineClient|replaceBillingOverrideLineClient|persistManualBillingOverrides|resolveMediaPlanVersionRowId/
  )
  assert.match(resetBody, /removeLineFromPendingBillingOverrideRows/)

  // Date-basis keep / reset (modal inline).
  const keepStart = src.indexOf("const handleDateBasisKeepForLine = useCallback")
  const keepEnd = src.indexOf("const handleDateBasisResetForLine = useCallback", keepStart)
  assert.ok(keepStart >= 0 && keepEnd > keepStart)
  const keepBody = src.slice(keepStart, keepEnd)
  assert.doesNotMatch(
    keepBody,
    /replaceBillingOverrideLineClient|applyDateBasisKeepOrReset|persistManualBillingOverrides/
  )

  const dateResetStart = keepEnd
  const dateResetEnd = src.indexOf(
    "[handleManualBillingLineItemResetToAuto]",
    dateResetStart
  )
  assert.ok(dateResetEnd > dateResetStart)
  const dateResetBody = src.slice(dateResetStart, dateResetEnd)
  assert.doesNotMatch(
    dateResetBody,
    /applyDateBasisKeepOrReset|resetBillingOverrideLineClient|replaceBillingOverrideLineClient/
  )
})

test("MB-23: create Apply stays local (no override POST)", () => {
  const src = stripBlockComments(readSrc("app/mediaplans/create/page.tsx"))
  const start = src.indexOf("function handleManualBillingApply()")
  assert.ok(start >= 0)
  const end = src.indexOf("function handlePartialMBAMonthsChange", start)
  assert.ok(end > start)
  const body = src.slice(start, end)
  assert.doesNotMatch(
    body,
    /persistManualBillingOverrides|replaceBillingOverrideLineClient|resetBillingOverrideLineClient|\/api\/billing-overrides/
  )
})
