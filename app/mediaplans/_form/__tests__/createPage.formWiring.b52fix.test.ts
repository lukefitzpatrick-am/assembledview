// Temporary source pin. Delete when usePlanForm owns this wiring (S33 next batch).
/**
 * B52fix (review R1, R4; C-280): the create page cannot mount in a test. The
 * form behaviour is tested in `_form`; this pins only the page's calls into
 * it, so each save guard gets the page state it needs, not a constant.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { callText, entries, OVER_BUDGET, pageSource } from "./pageWiringSource"

const page = pageSource("app/mediaplans/create/page.tsx")
const save = page.slice(page.indexOf("const handleSaveAll = async"), page.indexOf("\n};\n", page.indexOf("const handleSaveAll = async")))

test("save: handleSaveAll runs the preflight with the page's state, then stops on a refusal before any prompt", () => {
  assert.deepEqual(entries(callText(save, "planSavePreflight(")), [
    'mode: "create"',
    "clientsBlocked: saveBlockedByClientsError",
    "clientsError",
    "datesOutOfOrder",
    "saveInFlight: saveAllInFlightRef.current",
    "mbaNumberPending: mbaNumberPendingRef.current",
    'mbaNumberProblem: mediaPlanIdRef.current == null ? mbaNumberClientProblem(form.getValues("mba_number"), form.getValues("mbaidentifier")) : null',
  ])
  const call = save.indexOf("const saveStop = planSavePreflight(")
  const stop = save.indexOf("if (saveStop) {", call)
  const prompt = save.indexOf("setAaPublishPrompt(")
  assert.ok(call > 0 && stop > call && prompt > stop && save.indexOf(OVER_BUDGET) > stop)
  assert.match(save.slice(stop, prompt), /^if \(saveStop\) \{\n\s+showSaveStop\(saveStop, toast\)\n[\s\S]*\n\s+return\n\s+\}\n/)
})

test("C-165: a running save refuses a second one; the flag is set after every refusal and prompt, and cleared in finally", () => {
  const set = save.indexOf("saveAllInFlightRef.current = true")
  assert.ok(set > save.indexOf("if (saveStop) {") && set > save.indexOf(OVER_BUDGET), "set only once the save starts")
  assert.ok(set < save.indexOf("try {", set) && save.indexOf("try {", set) < save.indexOf("await handleSaveMediaPlan()"))
  assert.match(save, /\} finally \{\n\s+saveAllInFlightRef\.current = false\n\s+\}$/)
  assert.equal(save.split("saveAllInFlightRef.current = ").length - 1, 2, "set once, cleared once")
})

test("B35 and builder issues: overlap lines from every channel feed the rail", () => {
  assert.match(page, /const burstOverlapWarningOn = clientFeatureOn\("burst_overlap_warning"\)/)
  assert.deepEqual(entries(callText(page, "() => planBurstOverlapLines(")), ["burstOverlapWarningOn", "mediaLineItemsByKey"])
  assert.deepEqual(entries(callText(page, "buildPlanBuilderIssues(")), [
    'mode: "create"',
    "clientName: watchedClientName",
    "campaignName: watchedCampaignName",
    "dateWarning",
    "budgetRemainingOverspend",
    "budgetRemaining",
    "finance: { financials: campaignFinancials, panelIndicators }",
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
    "{ campaignStartDate: toDateOnlyString(fv.mp_campaigndates_start), campaignEndDate: toDateOnlyString(fv.mp_campaigndates_end), }",
    "lineItemsForSave",
  ])
  const call = page.indexOf("const publishPreflight = publishValidationPreflight(")
  const post = page.indexOf("postPlansSave(", call)
  const stop = page.indexOf("if (publishPreflight.stop) {", call)
  assert.ok(call > 0 && stop > call && post > stop, "checked before the request")
  assert.ok(page.slice(stop, post).includes('return "failed"'), "a stop returns before the request")
  assert.ok(page.slice(call, stop).includes("setPublishCheck(publishPreflight.check)"))
  const body = callText(page, "assemblePlansSaveRequestBody(", 0)
  assert.ok(body.includes("campaignStartDate: toDateOnlyString(fv.mp_campaigndates_start)"), "same dates as posted")
  assert.deepEqual(entries(callText(page, "setPublishCheck(publishCheckFromRefusal(")), ["saveResult.data.publishProblems"])
  assert.match(page, /if \(saveResult\.data\.code === PUBLISH_VALIDATION_REFUSED\) \{\n\s+setPublishCheck\(publishCheckFromRefusal/)
})

test("B57fix (review R1): save order is preflight stop, AA prompt, over budget question, in-flight flag", () => {
  const at = ["if (saveStop) {", "setAaPublishPrompt(", OVER_BUDGET, "saveAllInFlightRef.current = true"].map((s) => save.indexOf(s))
  assert.ok(at[0]! > 0 && at.every((n, i) => i === 0 || n > at[i - 1]!), `out of order: ${at.join(", ")}`)
})

test("B57: over budget asks through useConfirm only when over budget, and the page renders its dialog", () => {
  assert.match(save, /if \(budgetRemaining < 0\) \{\n\s+if \(!\(await confirm\(overBudgetQuestion\(budgetRemaining\)\)\)\) return\n\s+\}/)
  assert.equal(page.split("useConfirm()").length - 1, 1)
  assert.match(page, /\{confirmDialog\}\n\s+<\/>/)
  assert.doesNotMatch(page, /window\.confirm|\balert\(/)
})

test("B58fix R2: Publish and leave in the unsaved changes window is disabled while dates are out of order, with that reason", () => {
  const start = page.indexOf("<UnsavedChangesDialog")
  const dialog = page.slice(start, page.indexOf("/>", start))
  assert.match(dialog, /saveDisabled=\{saveBlockedByClientsError \|\| datesOutOfOrder \|\| mbaNumberLoading\}/)
  assert.match(dialog, /: datesOutOfOrder\n\s+\? END_BEFORE_START_MESSAGE\n/)
})
