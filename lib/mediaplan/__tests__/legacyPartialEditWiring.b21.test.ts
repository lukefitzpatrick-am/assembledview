/**
 * MB-33 (B21) edit wiring pins. The page can't be mounted here, so these read
 * its source like the B20 pins do.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const page = readFileSync(join(process.cwd(), "app/mediaplans/mba/[mba_number]/edit/page.tsx"), "utf8")
const modal = readFileSync(join(process.cwd(), "components/billing/MbaBillingModal.tsx"), "utf8")

function effectBody(): string {
  const start = page.indexOf("// Prefer version.mba_scope; legacy versions fall back to mba_line_approvals GET.")
  const end = page.indexOf("function handlePartialMBAMonthsChange", start)
  assert.ok(start > 0 && end > start, "approvals effect found")
  return page.slice(start, end)
}

test("version load keeps the old partial channels, and a version change clears them", () => {
  assert.match(
    page,
    /legacyPartialChannelsRef\.current = billingHydrated\.partial\n\s+\? \[\.\.\.\(billingHydrated\.partial\.metadata\.channels \?\? \[\]\)\]\n\s+: null/
  )
  assert.ok((page.match(/legacyPartialChannelsRef\.current = null/g) ?? []).length >= 2)
})

test("approvals effect: mba_scope first, then the GET, then the old partial when the GET has no rows", () => {
  const body = effectBody()
  const scopeAt = body.indexOf("if (persisted) {")
  const waitAt = body.indexOf("if (legacyChannels && !allChannelsHydrated) return")
  const getAt = body.indexOf("await fetchMbaLineApprovalsClient")
  const fallbackAt = body.indexOf("if (!result.ok || !result.available || !result.rows.length) {\n        applyLegacyPartial()\n        return\n      }")
  assert.ok(scopeAt > 0 && waitAt > scopeAt && getAt > waitAt && fallbackAt > getAt, "order")
  assert.match(body, /reconcileLegacyPartialSelection\(\{\n\s+channels: legacyChannels,\n\s+editorIdsByMedia: allByMedia,\n\s+mbaNumber: String\(mbaNumber\),/)
  // Saved months are not touched; values are not recomputed on load.
  const apply = body.slice(body.indexOf("const applyLegacyPartial"), getAt)
  assert.doesNotMatch(apply, /setPartialMBAMonthYears|recomputePartialMBAFromLineItems|setIsPartialMBA/)
  assert.match(apply, /if \(r\.changed\) \{/)
  assert.match(apply, /describeLegacyPartialUnresolved\(r\.unresolved, mediaLabelByBillingKey\)/)
  assert.match(page, /\}, \[mbaNumber, selectedVersionNumber, loadPhase, billingFeeSeedEnabledConfigs, allChannelsHydrated\]\)/)
})

test("MBA billing window shows the unmatched notice in the scope column", () => {
  const at = page.indexOf("scopeNotice={")
  assert.ok(at > 0)
  const slot = page.slice(at, page.indexOf("pendingOverrideRows=", at))
  assert.match(slot, /isPartialMBA && \(?legacyPartialUnresolved\.length > 0/)
  assert.match(
    slot,
    /<PartialMbaUnmatchedNotice\n\s+message=\{describeLegacyPartialUnresolved\(legacyPartialUnresolved, mediaLabelByBillingKey\)\}/
  )
  assert.match(modal, /\{scopeNotice \? <div data-mba-scope-notice="1">\{scopeNotice\}<\/div> : null\}/)
})
