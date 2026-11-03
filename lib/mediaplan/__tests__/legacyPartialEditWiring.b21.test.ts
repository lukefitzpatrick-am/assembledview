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
  assert.match(body, /reconcileLegacyPartialSelection\(\{\n\s+channels: legacyChannels,\n\s+editorIdsByMedia: allByMedia,\n\s+loadedLinesByMedia,\n\s+mbaNumber: String\(mbaNumber\),/)
  // Saved months are not touched; values are not recomputed on load.
  const apply = body.slice(body.indexOf("const applyLegacyPartial"), getAt)
  assert.doesNotMatch(apply, /setPartialMBAMonthYears|recomputePartialMBAFromLineItems|setIsPartialMBA/)
  assert.match(apply, /if \(r\.changed\) \{/)
  assert.match(
    apply,
    /setLegacyPartialOnOpen\(\{\n\s+unresolved: r\.unresolved,\n\s+addedSince: r\.addedSince,\n\s+leftOutByMedia: r\.leftOutByMedia,\n\s+\}\)/
  )
  assert.match(page, /\}, \[mbaNumber, selectedVersionNumber, loadPhase, billingFeeSeedEnabledConfigs, allChannelsHydrated\]\)/)
})

test("MBA billing window shows the unmatched notice in the scope column", () => {
  const at = page.indexOf("scopeNotice={")
  assert.ok(at > 0)
  const slot = page.slice(at, page.indexOf("pendingOverrideRows=", at))
  assert.match(slot, /isPartialMBA &&\n\s+\(legacyPartialNotices\.unresolved\.length > 0 \|\|/)
  assert.match(
    slot,
    /<PartialMbaUnmatchedNotice\n\s+message=\{describeLegacyPartialUnresolved\(legacyPartialNotices\.unresolved, mediaLabelByBillingKey\)\}/
  )
  assert.match(modal, /\{scopeNotice \? <div data-mba-scope-notice="1">\{scopeNotice\}<\/div> : null\}/)
})

test("B21fix finding 2: the reconcile gets the loaded lines of every billing channel, before the editor renumbers them", () => {
  const body = effectBody()
  const at = body.indexOf("const loadedLinesByMedia: LegacyPartialLoadedLines = {")
  assert.ok(at > 0, "loaded lines map")
  const map = body.slice(at, body.indexOf("}", at))
  const pairs = [...map.matchAll(/^\s+(\w+): (\w+),$/gm)].map((m) => [m[1]!, m[2]!] as const)
  // Same billing keys as the fee-seed configs that give the editor ids.
  const seedAt = page.indexOf("const seedConfigs: SeedLineFeesMediaConfig[] = [")
  const seed = page.slice(seedAt, page.indexOf("\n    ]\n", seedAt))
  const seedPairs = [...seed.matchAll(/billingKey: "(\w+)", lineItems: (\w+)MediaLineItems,/g)].map((m) => [m[1]!, m[2]!] as const)
  assert.equal(seedPairs.length, 20)
  assert.deepEqual(
    pairs.map(([k]) => k).toSorted(),
    seedPairs.map(([k]) => k).toSorted()
  )
  // Each value is the loaded state (`<name>LineItems`), never the editor copy.
  // Search and social keep their own loaded names.
  const loadedName: Record<string, string> = { socialMedia: "socialMediaLineItems", search: "searchLineItems" }
  for (const [key, stem] of seedPairs) {
    const value = pairs.find(([k]) => k === key)?.[1]
    assert.equal(value, loadedName[key] ?? `${stem}LineItems`, key)
    assert.match(page, new RegExp(`initialLineItems=\\{${value}\\}`), `${value} feeds a container`)
  }
})

test("B21fix finding 5: the unmatched toast fires on open from the match result", () => {
  const body = effectBody()
  const apply = body.slice(body.indexOf("const applyLegacyPartial"), body.indexOf("await fetchMbaLineApprovalsClient"))
  assert.match(
    apply,
    /const unmatchedToast = legacyPartialUnmatchedToast\(r\.unresolved, mediaLabelByBillingKey\)\n\s+if \(unmatchedToast\) toast\(unmatchedToast\)/
  )
  // Once, on open: the toast is not raised anywhere else.
  assert.equal((page.match(/legacyPartialUnmatchedToast\(/g) ?? []).length, 1)
})

test("B21fix finding 5: the scope notice reads the current selection, and a version change clears the open result", () => {
  assert.match(
    page,
    /const legacyPartialNotices = useMemo\(\n\s+\(\) => currentLegacyPartialNotices\(legacyPartialOnOpen, partialMBASelectedLineItemIds\),\n\s+\[legacyPartialOnOpen, partialMBASelectedLineItemIds\]\n\s+\)/
  )
  assert.ok((page.match(/setLegacyPartialOnOpen\(null\)/g) ?? []).length >= 1)
  assert.doesNotMatch(page, /setLegacyPartialUnresolved/)
})

test("B21fix R4: the MBA scope column names lines added since, from the current selection, with the switch off too", () => {
  const at = page.indexOf("scopeNotice={")
  const slot = page.slice(at, page.indexOf("pendingOverrideRows=", at))
  assert.match(slot, /legacyPartialNotices\.addedSince\.length > 0 \|\|\n\s+partialMbaBillingGuard\)/)
  assert.match(
    slot,
    /\{legacyPartialNotices\.addedSince\.length > 0 \? \(\n\s+<PartialMbaAddedSinceNotice\n\s+message=\{describeLegacyPartialAddedSince\(legacyPartialNotices\.addedSince, mediaLabelByBillingKey\)\}/
  )
  // Not behind partial_mba_billing_guard: the slot reads no switch for it.
  const notice = slot.slice(slot.indexOf("{legacyPartialNotices.addedSince.length > 0 ? ("), slot.indexOf("<PartialMbaBillingGuardNotice"))
  assert.doesNotMatch(notice, /partialMbaBillingGuardOn/)
})
