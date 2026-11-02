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
  masterIdMismatchMessage,
} from "../createHeldMaster"

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
  // generateMBANumber is only reached through handleClientChange.
  assert.equal((create.match(/generateMBANumber\(/g) ?? []).length, 1, "one call, inside handleClientChange")
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
