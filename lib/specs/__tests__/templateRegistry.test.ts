import assert from "node:assert/strict"
import test from "node:test"

import { loadTemplateStructure } from "../library.js"
import {
  PROMOTED_ENRICH_TO_REQUIRED,
  specsFieldRole,
  specsRolesForTab,
} from "../templateRegistry.js"

test("promoted mapping-hole fields are REQUIRED on the tabs where the column exists", () => {
  const tabs = loadTemplateStructure().tabs
  for (const [tab, columns] of Object.entries(PROMOTED_ENRICH_TO_REQUIRED)) {
    for (const column of columns) {
      assert.ok(tabs[tab]?.SPECS.includes(column), `${tab} is missing SPECS column ${column}`)
      assert.equal(specsFieldRole(tab, column), "REQUIRED", `${tab}.${column}`)
    }
  }
})

test("Print Specs Link stays ENRICH — no library key exists", () => {
  assert.equal(specsFieldRole("Print", "Specs Link"), "ENRICH")
  assert.equal(specsRolesForTab("Print")["Specs Link"], "ENRICH")
})

test("every template SPECS column has a role", () => {
  for (const [tab, structure] of Object.entries(loadTemplateStructure().tabs)) {
    const roles = specsRolesForTab(tab)
    for (const column of structure.SPECS) {
      assert.ok(roles[column] === "REQUIRED" || roles[column] === "ENRICH", `${tab}.${column}`)
    }
  }
})
