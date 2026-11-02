/**
 * B6 notes F1: on create, once the first Save made the master, the MBA number
 * and client are fixed. Changing the client used to mint a new MBA number while
 * the page kept the old master, so every later Save got a 422
 * MASTER_ID_MISMATCH shown as a generic "Save failed".
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import ts from "typescript"

import {
  CREATE_CLIENT_LOCKED_NOTE,
  MASTER_ID_MISMATCH,
  heldMasterIdentityFixes,
  MBA_NUMBER_FETCH_TIMEOUT_MS,
  MBA_NUMBER_LOADING_MESSAGE,
  MBA_NUMBER_TAKEN_REFETCH_MESSAGE,
  masterIdMismatchMessage,
  mayApplyMbaNumberResponse,
  mbaNumberClientProblem,
} from "../createHeldMaster"
import { allocateNextMbaNumber } from "../allocateNextMbaNumber"

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")
const create = read("app/mediaplans/create/page.tsx")
const edit = read("app/mediaplans/mba/[mba_number]/edit/page.tsx")
const sf = ts.createSourceFile("create.tsx", create, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function constFnText(name: string): string {
  let out = ""
  const visit = (n: ts.Node) => {
    if (!out && ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer) out = n.initializer.getText(sf)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  assert.ok(out, `missing const ${name}`)
  return out
}

test("F1 helper: the mismatch message is clear on each page and names the way out on create", () => {
  assert.equal(MASTER_ID_MISMATCH, "MASTER_ID_MISMATCH")
  assert.equal(CREATE_CLIENT_LOCKED_NOTE, "To use a different client, start a new plan.")
  assert.match(masterIdMismatchMessage("create"), /another MBA number/)
  assert.ok(masterIdMismatchMessage("create").endsWith(CREATE_CLIENT_LOCKED_NOTE))
  assert.match(masterIdMismatchMessage("edit"), /Reload the plan/)
})

test("F1 helper: a restore that changed the MBA number or client is put back to the held master", () => {
  const held = { mbaNumber: "golf026", clientName: "Golf Co", mbaIdentifier: "golf" }
  assert.equal(heldMasterIdentityFixes(null, { mba_number: "x" }), null, "no master held: nothing to fix")
  assert.equal(heldMasterIdentityFixes(held, { mba_number: "golf026", mp_client_name: "Golf Co", mbaidentifier: "golf" }), null)
  assert.deepEqual(heldMasterIdentityFixes(held, { mba_number: "krusty004", mp_client_name: "Krusty Krab", mbaidentifier: "krusty" }), {
    mba_number: "golf026",
    mp_client_name: "Golf Co",
    mbaidentifier: "golf",
  })
  assert.deepEqual(heldMasterIdentityFixes(held, { mba_number: "", mp_client_name: "Golf Co", mbaidentifier: "golf" }), { mba_number: "golf026" })
})

test("F1 create: the client picker is disabled with the note once the master exists", () => {
  assert.match(create, /disabled=\{Boolean\(clientsError\) \|\| mediaPlanId != null\}/)
  assert.match(create, /title=\{mediaPlanId != null \? CREATE_CLIENT_LOCKED_NOTE : undefined\}/)
  assert.match(create, /\{mediaPlanId != null \? \([\s\S]{0,200}data-testid="create-client-locked-note"[\s\S]{0,120}\{CREATE_CLIENT_LOCKED_NOTE\}/)
})

test("F1 create: no client change (picker, prefill, URL) can mint a new MBA number once the master exists", () => {
  const body = constFnText("handleClientChange")
  const guard = body.indexOf("if (mediaPlanIdRef.current != null) {")
  assert.ok(guard >= 0, "guard present")
  for (const later of ["generateMBANumber(", 'form.setValue("mba_number"', 'form.setValue("mp_client_name"', "setSelectedClientId("]) {
    assert.ok(body.indexOf(later) > guard, `${later} runs only before a master exists`)
  }
  // generateMBANumber is reached through handleClientChange, from Save's
  // refetch when the number is missing or another client's (B7 review), and
  // from the master save when an MBA-taken retry number isn't the client's (B8
  // review 1); all stop once a master exists (generateMBANumber's own early return).
  assert.equal(
    (create.match(/generateMBANumber\(/g) ?? []).length,
    3,
    "handleClientChange, handleSaveAll's refetch and the MBA-taken refetch",
  )
  assert.match(constFnText("handleSaveAll"), /if \(problem\.refetch\) void generateMBANumber\(/)
  assert.match(constFnText("handleSaveMediaPlan"), /void generateMBANumber\(identifier\)/)
})

test("F1 create: draft restore keeps the held master's MBA number and client; the held id is never cleared", () => {
  const resets = create.match(/form\.reset\(restoreDraftFormValues\(state\.formValues\) as never\)\n\s*keepHeldMasterIdentity\(\)/g) ?? []
  assert.equal(resets.length, 2, "restore and revert-to-base both re-apply the held identity")
  assert.equal((create.match(/form\.reset\(restoreDraftFormValues/g) ?? []).length, 2, "no other restore path")
  const keep = constFnText("keepHeldMasterIdentity")
  assert.match(keep, /heldMasterIdentityFixes\(heldMasterIdentityRef\.current, form\.getValues\(\)\)/)
  assert.match(constFnText("handleSaveMediaPlan"), /mediaPlanIdRef\.current = mediaPlan\.id\s*\n\s*heldMasterIdentityRef\.current = \{/)
  // Clearing the held master would orphan it (Luke's call).
  assert.doesNotMatch(create, /mediaPlanIdRef\.current = null|setMediaPlanId\(null\)/)
})

test("F1: both pages map a 422 MASTER_ID_MISMATCH to the clear message, ahead of the generic text", () => {
  for (const [src, page] of [[create, "create"], [edit, "edit"]] as const) {
    const at = src.indexOf(`saveResult.data.code === MASTER_ID_MISMATCH\n            ? masterIdMismatchMessage("${page}")`)
    assert.ok(at >= 0, `${page}: mapping present`)
    assert.ok(at < src.indexOf('"Postgres save failed"', at), `${page}: before the generic fallback`)
  }
})

test("C-165 gap: an MBA number response applies only to the latest request and never once a master is held", () => {
  assert.equal(mayApplyMbaNumberResponse({ requestToken: 2, currentToken: 2, masterHeld: false }), true)
  assert.equal(mayApplyMbaNumberResponse({ requestToken: 1, currentToken: 2, masterHeld: false }), false, "stale request")
  assert.equal(mayApplyMbaNumberResponse({ requestToken: 2, currentToken: 2, masterHeld: true }), false, "master held")
})

test("C-165 gap (create): generateMBANumber never fetches, applies or blanks once a master exists; Save start invalidates in-flight requests", () => {
  const body = constFnText("generateMBANumber")
  const early = body.indexOf("if (mediaPlanIdRef.current != null) return")
  assert.ok(early >= 0 && early < body.indexOf("fetch("), "returns before any fetch or blanking")
  assert.ok(early < body.indexOf('form.setValue("mba_number", "")'), "before the empty-identifier blanking")
  // Every response / failure checkpoint (after the fetch, after the JSON, in the catch) asks the held-master gate.
  assert.equal((body.match(/mayApplyMbaNumberResponse\(\{\s*requestToken,\s*currentToken: mbaNumberRequestTokenRef\.current,\s*masterHeld: mediaPlanIdRef\.current != null,\s*\}\)/g) ?? []).length, 3)
  assert.doesNotMatch(body, /shouldApplyMbaNumberResponse/)
  const catchAt = body.lastIndexOf("} catch (error) {")
  const gateInCatch = body.indexOf("mayApplyMbaNumberResponse", catchAt)
  const blankInCatch = body.indexOf('form.setValue("mba_number", "")', catchAt)
  assert.ok(gateInCatch > catchAt && blankInCatch > gateInCatch, "a failed request blanks only when no master is held")
  const saveAll = constFnText("handleSaveAll")
  const flight = saveAll.indexOf("saveAllInFlightRef.current = true")
  const bump = saveAll.indexOf("beginMbaNumberRequest(mbaNumberRequestTokenRef)", flight)
  assert.ok(flight >= 0 && bump > flight && bump < saveAll.indexOf("await handleSaveMediaPlan()"), "token bumped at Save start, before the master save")
})

test("C-165 gap (create): an already-open client picker cannot change a held master's client name", () => {
  const onSelect = create.slice(create.indexOf("onSelect={() => {", create.indexOf('key={client.id}')))
  const guard = onSelect.indexOf("if (mediaPlanIdRef.current != null) {")
  assert.ok(guard >= 0 && guard < onSelect.indexOf("field.onChange(client.mp_client_name)"), "guard before field.onChange")
})

test("B7 review 1: the MBA number must start with the client's identifier; blank or another client's number is refused", () => {
  assert.equal(mbaNumberClientProblem("golf026", "golf"), null)
  assert.equal(mbaNumberClientProblem("GOLF026", " golf "), null, "trimmed, case-insensitive")
  assert.equal(mbaNumberClientProblem(" golf026 ", "GOLF"), null)
  assert.deepEqual(mbaNumberClientProblem("krusty004", "golf")?.refetch, true, "another client's number")
  assert.match(mbaNumberClientProblem("krusty004", "golf")!.message, /krusty004 doesn't belong to this client \(identifier golf\)/)
  assert.equal(mbaNumberClientProblem("", "golf")?.refetch, true, "no number yet")
  assert.equal(mbaNumberClientProblem(null, "golf")?.refetch, true)
  assert.equal(mbaNumberClientProblem("golf026", "")?.refetch, false, "client with no identifier: refetch can't help")
  assert.equal(mbaNumberClientProblem("golf026", null)?.refetch, false)
  // By construction every allocated number passes for its own identifier, whatever its case or digits.
  for (const id of ["golf", "PENFOLD", "abc1", " Buxton ", "pga"]) {
    assert.equal(mbaNumberClientProblem(allocateNextMbaNumber([], id), id), null, id)
    assert.equal(mbaNumberClientProblem(allocateNextMbaNumber([`${id.trim()}099`], id), id), null, id)
  }
})

test("B7 review 1 (create): Save refuses while an MBA number request is in flight, on every save route", () => {
  const saveAll = constFnText("handleSaveAll")
  const pending = saveAll.indexOf("if (mbaNumberPendingRef.current) {")
  const problem = saveAll.indexOf('mbaNumberClientProblem(form.getValues("mba_number"), form.getValues("mbaidentifier"))')
  const aa = saveAll.indexOf("setAaPublishPrompt(")
  const master = saveAll.indexOf("await handleSaveMediaPlan()")
  assert.ok(pending >= 0 && pending < aa && pending < master, "pending check before the AA prompt and the master save")
  assert.ok(saveAll.slice(pending, pending + 200).includes("MBA_NUMBER_LOADING_MESSAGE"))
  assert.ok(problem > pending && problem < aa, "client/number check before the AA prompt")
  assert.match(saveAll.slice(problem - 120, problem), /if \(mediaPlanIdRef\.current == null\) \{/, "only before a master exists")
  // Every save route goes through handleSaveAll: the master and version saves have no other caller.
  assert.equal((create.match(/await handleSaveMediaPlan\(\)/g) ?? []).length, 2, "handleSaveAll and the MBA-taken retry")
  assert.ok(constFnText("handleSaveMediaPlan").includes("return await handleSaveMediaPlan()"), "the second is the retry, inside itself")
  assert.equal((create.match(/await handleSaveMediaPlanVersion\(/g) ?? []).length, 1, "one call, in handleSaveAll")
  assert.ok(saveAll.includes("await handleSaveMediaPlanVersion(newMediaPlanId)"))
  for (const route of [
    'handleSaveAll({ intent: "publish", download: true })',
    'handleSaveAll({ intent: "publish", exitAfter: true })',
    "handleSaveAll({ exitAfter: true })",
    'handleSaveAll({ intent: "publish", zipAfter: true })',
    "handleSaveAll({ ...pending.opts, ackAaWarnings: true })",
    "onSave={() => void handleSaveAll()}",
  ]) {
    assert.ok(create.includes(route), route)
  }
  // The bar and the unsaved-changes dialog show it too.
  assert.match(create, /isWizardSaving \|\| saveBlockedByClientsError \|\| datesOutOfOrder \|\| mbaNumberLoading/)
  assert.match(create, /saveDisabled=\{saveBlockedByClientsError \|\| mbaNumberLoading\}/)
})

test("B7 review 1 (create): the pending flag is set per request and cleared only by the latest one", () => {
  const body = constFnText("generateMBANumber")
  const begin = body.indexOf("const requestToken = beginMbaNumberRequest(mbaNumberRequestTokenRef)")
  const set = body.indexOf("mbaNumberPendingRef.current = true")
  assert.ok(begin >= 0 && set > begin && set < body.indexOf("fetch("))
  const fin = body.lastIndexOf("} finally {")
  const tail = body.slice(fin)
  assert.match(tail, /if \(requestToken === mbaNumberRequestTokenRef\.current\) \{\s*mbaNumberPendingRef\.current = false\s*setMbaNumberLoading\(false\)/)
})

test("B7 review 1 (create): a client change blanks the old number first; the master create re-checks the pair", () => {
  const body = constFnText("handleClientChange")
  const guard = body.indexOf("if (mediaPlanIdRef.current != null) {")
  const blank = body.indexOf('form.setValue("mba_number", "")', guard)
  const gen = body.indexOf("generateMBANumber(selectedClient.mbaidentifier)")
  assert.ok(guard >= 0 && blank > guard && blank < gen, "blanked after the held-master guard, before the new request")
  const master = constFnText("handleSaveMediaPlan")
  const check = master.indexOf('mbaNumberClientProblem(mba_number, form.getValues("mbaidentifier"))')
  assert.ok(check >= 0 && check < master.indexOf("await createMediaPlan(payload)"), "checked before createMediaPlan")
  assert.ok(check > master.indexOf("if (existingId != null) {"), "only for a new master")
  assert.match(master.slice(check, check + 200), /if \(clientProblem\) throw new Error\(clientProblem\.message\)/)
})

test("B7 review 1: the edit page has no MBA number generation or client picker to guard", () => {
  assert.doesNotMatch(edit, /generateMBANumber|\/api\/mediaplans\/mbanumber|beginMbaNumberRequest|setIsClientPopoverOpen/)
  assert.equal(MBA_NUMBER_LOADING_MESSAGE, "The MBA number is still loading. Try again in a moment.")
})

test("B8 review 3: the MBA number is the identifier then digits only (the auth matcher), not a bare prefix", () => {
  for (const [num, id] of [
    ["golfx01", "golf"],
    ["xgolf001", "golf"],
    ["golf", "golf"],
    ["golf026a", "golf"],
    ["test-qa-3003", "test-qa-003"],
  ]) {
    assert.equal(mbaNumberClientProblem(num, id)?.refetch, true, `${num} vs ${id}`)
  }
  // Known overlap, shared with auth and the allocator: an identifier ending in
  // digits can't tell its own numbers from a longer identifier's. `test1` +
  // `23001` is digits, so `test123001` passes for `test1`, as it does in
  // mbaNumberMatchesClientIdentifier. Pinned so a change here is deliberate.
  assert.equal(mbaNumberClientProblem("test123001", "test1"), null)
  // The five live odd identifiers: every number the allocator hands out passes.
  for (const id of ["iwd2026", "000", "test123", "test-qa-003", "historical ox and harty clients", " historical ox and harty clients "]) {
    for (const existing of [[], [`${id.trim()}001`], [`${id.trim()}099`], [`${id.trim().toUpperCase()}1234`]]) {
      const allocated = allocateNextMbaNumber(existing, id)
      assert.equal(mbaNumberClientProblem(allocated, id), null, `${allocated} for ${JSON.stringify(id)}`)
    }
  }
  const body = read("lib/mediaplan/createHeldMaster.ts")
  assert.match(body, /if \(!mbaNumberMatchesClientIdentifier\(num, id\)\) \{/)
  assert.doesNotMatch(body, /startsWith\(/)
})

test("B8 review 7: a client with no MBA identifier is told to reload the page, not to pick it again", () => {
  const message = mbaNumberClientProblem("golf026", "")!.message
  assert.match(message, /Add one on the client, then reload this page\.$/)
  assert.doesNotMatch(message, /pick it again/)
})

test("B8 review 2 (create): the MBA number request gives up after 15 s and clears like a failure", () => {
  assert.equal(MBA_NUMBER_FETCH_TIMEOUT_MS, 15_000)
  const body = constFnText("generateMBANumber")
  const controller = body.indexOf("const abort = new AbortController()")
  const timer = body.indexOf("const abortTimer = setTimeout(() => abort.abort(), MBA_NUMBER_FETCH_TIMEOUT_MS)")
  const fetchAt = body.indexOf("fetch(")
  assert.ok(controller >= 0 && timer > controller && timer < fetchAt, "timer armed before the fetch")
  assert.match(body.slice(fetchAt, fetchAt + 200), /\{\s*signal: abort\.signal,\s*\}\)/)
  // The abort rejects into the same catch as an error (blank the number), and
  // finally clears the timer and, for the latest request, the in-flight flag.
  const fin = body.lastIndexOf("} finally {")
  assert.ok(body.lastIndexOf("} catch (error) {") < fin)
  assert.match(body.slice(fin), /\} finally \{\s*clearTimeout\(abortTimer\)\s*\/\/[^\n]*\n\s*if \(requestToken === mbaNumberRequestTokenRef\.current\) \{\s*mbaNumberPendingRef\.current = false/)
})

test("B8 review 1 (create): an MBA-taken retry number that isn't the client's is not saved; a fresh number is fetched", () => {
  const master = constFnText("handleSaveMediaPlan")
  const check = master.indexOf('if (decision.action === "retry" && mbaNumberClientProblem(decision.nextMbaNumber, identifier)) {')
  const retry = master.indexOf('} else if (decision.action === "retry") {')
  assert.ok(check >= 0 && retry > check, "checked before the retry branch")
  const refused = master.slice(check, retry)
  assert.match(refused, /mbaNumberRenameRef\.current = null/, "the stale rename is dropped")
  assert.match(refused, /void generateMBANumber\(identifier\)/, "a fresh number from the normal allocator")
  assert.match(refused, /err = new Error\(MBA_NUMBER_TAKEN_REFETCH_MESSAGE\)/, "the save fails with the clear message")
  assert.doesNotMatch(refused, /handleSaveMediaPlan\(|form\.setValue\("mba_number"|mbaNumberRenameRef\.current = \{/, "no save, no form number, no rename")
  assert.match(master, /const identifier = String\(form\.getValues\("mbaidentifier"\) \?\? ""\)/)
  // The good retry still renames and saves once.
  assert.match(master.slice(retry), /^[\s\S]*?mbaNumberRenameRef\.current = \{[\s\S]*?return await handleSaveMediaPlan\(\)/)
  assert.match(MBA_NUMBER_TAKEN_REFETCH_MESSAGE, /taken by another plan\. Getting a new one now; try again in a moment\.$/)
})
