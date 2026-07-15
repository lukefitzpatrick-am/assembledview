import assert from "node:assert/strict"
import test from "node:test"

import { resolveApproval } from "@/lib/finance/buildEditorLineItemInputs"

test("resolveApproval: full MBA → always approved", () => {
  assert.equal(resolveApproval("search", "S1", { isPartialMBA: false }), "approved")
  assert.equal(resolveApproval("search", "S1"), "approved")
})

test("resolveApproval: unlisted channel (undefined) → approved (IN)", () => {
  assert.equal(
    resolveApproval("ooh", "O1", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { search: ["S1"] },
    }),
    "approved"
  )
})

test("resolveApproval: explicitly emptied channel ([]) → excluded (OUT)", () => {
  assert.equal(
    resolveApproval("search", "S1", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { search: [] },
    }),
    "excluded"
  )
})

test("resolveApproval: managed channel selects by id; new line defaults excluded", () => {
  assert.equal(
    resolveApproval("search", "S1", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { search: ["S1"] },
    }),
    "approved"
  )
  assert.equal(
    resolveApproval("search", "S-new", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { search: ["S1"] },
    }),
    "excluded"
  )
})
