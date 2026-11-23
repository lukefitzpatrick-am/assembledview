// Temporary source pin. Delete when usePlanForm owns this wiring (S33 next batch).
/**
 * B52fix (review R1, R2; C-280): the edit page cannot mount in a test. The
 * form behaviour is tested in `_form`; this pins only the page's calls into
 * it, so each never-cut guard gets the page state it needs, not a constant
 * or a dropped argument.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { loadedLinesByBillingKey } from "../planChannels"
import { callText, count, entries, OVER_BUDGET, pageSource } from "./pageWiringSource"

const page = pageSource("app/mediaplans/mba/[mba_number]/edit/page.tsx")

function constFnText(name: string): string {
  const start = page.indexOf(`  const ${name} = `)
  assert.ok(start >= 0, name)
  return page.slice(start, page.indexOf("\n  }\n", start) + 4)
}

test("save: handleSaveAll runs the preflight with the page's state, then stops on a refusal before any prompt", () => {
  const save = constFnText("handleSaveAll")
  assert.deepEqual(entries(callText(save, "planSavePreflight(")), [
    'mode: "edit"',
    "clientsBlocked: saveBlockedByClientsError",
    "clientsError",
    "datesOutOfOrder",
    "duplicateLines: saveBlockedByDuplicates",
    "billingAliasGhostPairs",
    "billingMonthOrder: workingBillingMonths.map((m) => m.monthYear)",
    "linesStillLoading: saveHeldForHydration",
    "channelLoadFailed: saveBlockedByFailedChannelLoad",
    "channelLoadFailedReason: saveFailedChannelLoadReason",
    "billingOverridesLoadState",
    "pendingBillingOverrideCount: pendingBillingOverrideRows.length",
  ])
  const call = save.indexOf("const saveStop = planSavePreflight(")
  const stop = save.indexOf("if (saveStop) {", call)
  const prompt = save.indexOf(OVER_BUDGET)
  assert.ok(call > 0 && stop > call && prompt > stop, "preflight, then its stop, then the prompts")
  assert.ok(save.indexOf("setAaPublishPrompt(") > stop && save.indexOf("await postPlansSave(") > stop)
  assert.match(save.slice(stop, prompt), /^if \(saveStop\) \{\n\s+showSaveStop\(saveStop, toast\)\n[\s\S]*\n\s+return\n\s+\}\n/)
})

test("B20: ghost pairs come from the working schedule with the switch and the alias identity", () => {
  assert.equal(count(page, 'clientFeatureOn("billing_ghost_row_guard")'), 1)
  assert.match(page, /const billingGhostGuardOn = clientFeatureOn\("billing_ghost_row_guard"\)/)
  assert.deepEqual(entries(callText(page, "() => billingAliasGhostPairsWhenOn(")), [
    "billingGhostGuardOn",
    "workingBillingMonths",
    "mbaNumber",
    "billingAliasNumberCheck",
  ])
  assert.match(page, /const billingAliasGhostPairs = useMemo\(\n\s+\(\) => billingAliasGhostPairsWhenOn\(/)
})

test("B21: the guard gets the switch, the partial flag and waits for every channel", () => {
  assert.equal(count(page, 'clientFeatureOn("partial_mba_billing_guard")'), 1)
  assert.match(page, /const partialMbaBillingGuardOn = clientFeatureOn\("partial_mba_billing_guard"\)/)
  assert.deepEqual(entries(callText(page, "partialMbaBillingGuardWhenOn(")), [
    "on: partialMbaBillingGuardOn",
    "isPartial: isPartialMBA",
    "allChannelsHydrated",
    "perLine: campaignFinancials.perLine",
    "selectedMonthYears: partialMBAMonthYears",
    "laterAddedMediaKeys: legacyPartialLaterAddedKeys",
  ])
})

test("M8: the month sources read the switch; the fee basis is the engine's (S4)", () => {
  const sources = page.slice(page.indexOf("function partialMbaMonthSources()"), page.indexOf("function getPartialMbaRawMonthsForBaseline"))
  assert.deepEqual(entries(sources.slice(sources.indexOf("return {") + "return ".length, sources.indexOf("\n    }\n") + 6)), [
    "guardOn: partialMbaBillingGuardOn",
    "working: workingBillingMonths",
    "autoReference: manualBillingAutoReferenceMonths",
    "autoDelivery: autoDeliveryMonths",
  ])
  assert.match(page, /return partialMbaBaselineMonths\(partialMbaMonthSources\(\)\)/)
  assert.match(page, /return partialMbaLineItemMonths\(partialMbaMonthSources\(\), \(months\) => attachLineItemsToMonths\(months, "delivery"\)\)/)
  const recompute = page.slice(page.indexOf("function recomputePartialMBAFromLineItems("), page.indexOf("function handlePartialMBAMonthsChange"))
  assert.deepEqual(entries(callText(recompute, "partialMbaFinancialsOptions(")), [
    "campaignStart: campaignStartDate",
    "campaignEnd: campaignEndDate",
    "selectedMonthYears: nextMonthYears",
  ])
})

test("MB-30, MB-40: every merge and union gets the plan's alias identity, built from the loaded lines", () => {
  const identity = constFnText("billingAliasIdentity")
  assert.match(
    identity,
    /mbaNumber: mbaNumberRef\.current,\n\s+aliasNumberCheck: billingAliasNumberCheckRef\.current,\n\s+onReconcile: \(entries\) => reportAliasReconcileRef\.current\("merge", entries\),/
  )
  assert.match(page, /buildBillingAliasNumberCheck\(loadedLinesByKey, mbaNumber\)/)
  assert.match(page, /\n\s+billingAliasNumberCheckRef\.current = billingAliasNumberCheck\n/)
  assert.equal(count(page, "appendAutoReferenceIntoWorkingBilling("), 2)
  assert.equal(count(page, "unionWithAliasIdentity("), 2)
  for (const nth of [0, 1]) {
    assert.equal(entries(callText(page, "= appendAutoReferenceIntoWorkingBilling(", nth))[4], "billingAliasIdentity()", `merge ${nth}`)
    assert.equal(entries(callText(page, "= unionWithAliasIdentity(", nth))[3], "billingAliasIdentity()", `union ${nth}`)
  }
})

test("R2: the loaded lines map gets each loaded state by name, and each key matches its post-save writer", () => {
  const passed = entries(callText(page, "loadedLinesByBillingKey<readonly LineItemWithIdentity[]>("))
  assert.equal(passed.length, 20)
  for (const e of passed) assert.match(e, /^\w+LineItems$/, `${e}: by name, never a renamed state`)
  // The post-save writers (`initial: set<State>`) name the loaded state of each key.
  const writers = [...page.matchAll(/^\s+(\w+): \{ media: set\w+, initial: set(\w+LineItems) \},$/gm)]
  assert.equal(writers.length, 20)
  const byName = Object.fromEntries(passed.map((name) => [name, name]))
  const byKey = loadedLinesByBillingKey(byName as Parameters<typeof loadedLinesByBillingKey<string>>[0]) as Record<string, string>
  for (const [, key, setterState] of writers) {
    const state = setterState!.charAt(0).toLowerCase() + setterState!.slice(1)
    assert.equal(byKey[key === "social" ? "socialMedia" : key!], state, key)
  }
})

test("MB-33: version load keeps an old partial MBA's channels; a version change clears them", () => {
  assert.match(
    page,
    /legacyPartialChannelsRef\.current = billingHydrated\.partial\n\s+\? \[\.\.\.\(billingHydrated\.partial\.metadata\.channels \?\? \[\]\)\]\n\s+: null/
  )
  assert.match(page, /legacyPartialChannelsRef\.current = null\n\s+setLegacyPartialOnOpen\(null\)/)
  assert.equal(count(page, "legacyPartialChannelsRef.current = null"), 2, "version change and a version with no billing")
})

test("MB-33: the scope on open reads the version first, then waits for every channel with the loaded lines", () => {
  const fromVersion = page.indexOf("const fromVersion = mbaScopeFromVersion(")
  const resolve = page.indexOf("const scope = await resolveMbaScopeOnLoad(")
  assert.ok(fromVersion > 0 && resolve > fromVersion)
  assert.deepEqual(entries(callText(page, "await resolveMbaScopeOnLoad(")).slice(0, 6), [
    "editorIdsByMedia: allByMedia",
    "legacyChannels: legacyPartialChannelsRef.current",
    "allChannelsHydrated",
    "loadedLinesByMedia: loadedLinesByKey",
    "mbaNumber: String(mbaNumber)",
    "mediaLabelByKey: mediaLabelByBillingKey",
  ])
  assert.match(page.slice(resolve), /^const scope = await resolveMbaScopeOnLoad\([\s\S]*?\n\s+if \(cancelled \|\| scope\.kind === "wait"\) return\n/)
  assert.match(page, /\}, \[mbaNumber, selectedVersionNumber, loadPhase, billingFeeSeedEnabledConfigs, allChannelsHydrated\]\)/)
})

test("the MBA billing window's scope column and the save rail line get the guard", () => {
  const slot = page.slice(page.indexOf("scopeNotice={"), page.indexOf("pendingOverrideRows=", page.indexOf("scopeNotice={")))
  assert.match(slot, /^scopeNotice=\{\n\s+partialMbaScopeNoticesShown\(\{/, "the slot is decided by the shared rule alone")
  assert.deepEqual(entries(callText(slot, "partialMbaScopeNoticesShown(")), [
    "isPartial: isPartialMBA",
    "notices: legacyPartialNotices",
    "guard: partialMbaBillingGuard",
  ])
  assert.match(
    slot,
    /\}\) \? \(\n\s+<PartialMbaScopeNotices\n\s+isPartial=\{isPartialMBA\}\n\s+notices=\{legacyPartialNotices\}\n\s+guard=\{partialMbaBillingGuard\}\n\s+mediaLabelByKey=\{mediaLabelByBillingKey\}\n\s+\/>\n\s+\) : null/
  )
  assert.deepEqual(entries(callText(page, "saveScopeNote={partialMbaSaveScopeNote(")), [
    "isPartial: isPartialMBA",
    "inCount: flattenPartialMbaSelectedLineIds(partialMBASelectedLineItemIds).length",
    "totalCount: countablePartialMbaLineCount(campaignFinancials.perLine)",
    "guard: partialMbaBillingGuard",
  ])
})

test("B35 and builder issues: overlap lines from every channel, finance only once every channel has loaded", () => {
  assert.match(page, /const burstOverlapWarningOn = clientFeatureOn\("burst_overlap_warning"\)/)
  assert.deepEqual(entries(callText(page, "() => planBurstOverlapLines(")), ["burstOverlapWarningOn", "mediaLineItemsByKey"])
  assert.deepEqual(entries(callText(page, "buildPlanBuilderIssues(")), [
    'mode: "edit"',
    "clientName: watchedClientName",
    "campaignName: watchedCampaignName",
    "dateWarning",
    "budgetRemainingOverspend",
    "budgetRemaining",
    "finance: allChannelsHydrated ? { financials: campaignFinancialsForPanels, panelIndicators } : null",
    "mbaScopeTotals: campaignFinancials.mbaScopeTotals",
    "missingPublisherKpiCount",
    "missingBuyTypeLineIds",
    "missingBurstDateLineIds",
    "burstOverlapLines",
    "publisherGuard: { blocked: publisherGuardBlocked, warnings: publisherGuardWarnings }",
    "aaPublishWarnings",
    "publishCheck",
  ])
})

test("S1: the publish check gets the posted mode, plan dates and lines, stops before the request, and takes the server's refusal", () => {
  assert.deepEqual(entries(callText(page, "publishValidationPreflight(")), [
    "modeResolved.mode",
    "{ campaignStartDate: toDateOnlyString(formValues.mp_campaigndates_start), campaignEndDate: toDateOnlyString(formValues.mp_campaigndates_end), }",
    "lineItemsForSave",
  ])
  const call = page.indexOf("const publishPreflight = publishValidationPreflight(")
  const post = page.indexOf("postPlansSave(", call)
  const stop = page.indexOf("if (publishPreflight.stop) {", call)
  assert.ok(call > 0 && stop > call && post > stop, "checked before the request")
  assert.match(page.slice(stop, post), /setIsSaving\(false\)\n\s+return\n/, "a stop returns before the request")
  assert.ok(page.slice(call, stop).includes("setPublishCheck(publishPreflight.check)"))
  const body = callText(page, "assemblePlansSaveRequestBody(", 0)
  assert.ok(body.includes("campaignStartDate: toDateOnlyString(formValues.mp_campaigndates_start)"), "same dates as posted")
  assert.deepEqual(entries(callText(page, "setPublishCheck(publishCheckFromRefusal(")), ["saveResult.data.publishProblems"])
  assert.match(page, /if \(saveResult\.data\.code === PUBLISH_VALIDATION_REFUSED\) \{\n\s+setPublishCheck\(publishCheckFromRefusal/)
})

test("X2: every client publish refusal stops before the PC4 collision worksheet writes billing overrides", () => {
  const save = constFnText("handleSaveAll")
  const firstWrite = Math.min(
    save.indexOf("detectBillingCollisions("),
    save.indexOf("writeCollisionDecisionEdits("),
    save.indexOf("persistManualBillingOverrides("),
  )
  assert.ok(firstWrite > 0, "the PC4 worksheet is in handleSaveAll")
  const checks = save.indexOf('if (modeResolved.uiMode !== "working_draft") {')
  assert.ok(checks > 0 && checks < firstWrite, "the checks run before the worksheet")
  for (const refusal of [
    "lineItemsForSave = buildSavePlanLineItemsFromSnapshots(",
    "countEnabledPublishIntegrityFlags(formValues) > 0",
    "if (publisherPreflight.reject) {",
    "if (publishPreflight.stop) {",
  ]) {
    const at = save.indexOf(refusal)
    assert.ok(at > checks && at < firstWrite, `${refusal} runs before the worksheet`)
    assert.equal(count(save, refusal), 1, `${refusal} runs once`)
  }
  assert.ok(save.indexOf("await postPlansSave(") > firstWrite)
})

test("B57: over budget asks through useConfirm only when over budget, and the page renders its dialog", () => {
  const save = constFnText("handleSaveAll")
  assert.match(save, /if \(budgetRemainingOverspend\) \{\n\s+if \(!\(await confirm\(overBudgetQuestion\(budgetRemaining\)\)\)\) return\n\s+\}/)
  assert.equal(page.split("useConfirm()").length - 1, 1)
  assert.match(page, /\{confirmDialog\}\n\s+<\/>/)
  assert.doesNotMatch(page, /window\.confirm|\balert\(/)
})

test("B58fix R2: Publish and leave in the unsaved changes window is disabled while dates are out of order, with that reason", () => {
  const start = page.indexOf("<UnsavedChangesDialog")
  const dialog = page.slice(start, page.indexOf("/>", start))
  assert.match(dialog, /saveDisabled=\{saveBlockedByDuplicates \|\| saveBlockedByClientsError \|\| datesOutOfOrder\}/)
  assert.match(dialog, /: END_BEFORE_START_MESSAGE\n\s+\}/)
})
