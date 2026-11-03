/**
 * B20 ghost-row guard wiring pins (edit page, registry). The page can't be
 * mounted here, so these read the source like the MB-23 pins do.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { featureDefinition } from "@/lib/features/registry"

const page = readFileSync(join(process.cwd(), "app/mediaplans/mba/[mba_number]/edit/page.tsx"), "utf8")

test("switch billing_ghost_row_guard: planning, admin, default off, browser visible", () => {
  const def = featureDefinition("billing_ghost_row_guard")
  assert.ok(def)
  assert.equal(def!.defaultOn, false)
  assert.equal(def!.clientVisible, true)
  assert.equal(def!.toggleRole, "admin")
  assert.match(def!.description, /Saved data is never changed or deleted/)
  assert.match(def!.description, /Off: no check, as before/)
})

test("edit reads the switch and checks the working schedule only when it is on", () => {
  assert.match(page, /clientFeatureOn\("billing_ghost_row_guard"\)/)
  assert.match(
    page,
    /billingGhostGuardOn \? findBillingAliasGhostPairs\(workingBillingMonths, mbaNumber\) : \[\]/,
  )
})

test("handleSaveAll refuses before the save request while a pair is present", () => {
  const start = page.indexOf("const handleSaveAll = async")
  const stop = page.indexOf("billingAliasGhostSaveBlockMessage(", start)
  const post = page.indexOf("await postPlansSave(", start)
  assert.ok(start > 0 && stop > start && post > stop, "ghost stop must sit inside handleSaveAll, before postPlansSave")
  const at = page.indexOf("if (ghostSaveBlock) {", stop)
  assert.ok(at > stop && at < post)
  assert.match(page.slice(at, at + 300), /^if \(ghostSaveBlock\) \{\s*toast\(\{[\s\S]*variant: "destructive",\s*\}\)\s*return\s*\}/)
})

test("the notice is on the save rail and in the MBA billing window; saved pairs are logged", () => {
  assert.match(page, /billingAliasDuplicateNotice\("rail"\)/)
  assert.match(page, /aliasDuplicateNotice=\{billingAliasDuplicateNotice\("modal"\)\}/)
  assert.match(page, /source: "saved",\s*entries: \[\],\s*savedPairs:/)
  // Keep the current rows touches the working copy (and the open draft) only.
  const keep = page.slice(page.indexOf("const handleKeepCurrentBillingRows"), page.indexOf("const billingAliasDuplicateNotice"))
  assert.match(keep, /setWorkingBillingMonths\(nextWorking\)/)
  assert.doesNotMatch(keep, /fetch\(|postPlansSave|setSavedBillingMonths|billing-overrides/)
})
