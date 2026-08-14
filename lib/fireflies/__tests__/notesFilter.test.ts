import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  FIREFLIES_NOTES_FILTERS,
  parseFirefliesNotesFilter,
} from "../notesFilter.js"

describe("parseFirefliesNotesFilter", () => {
  it("defaults to unattributed so triage stays the landing tab", () => {
    assert.equal(parseFirefliesNotesFilter(null), "unattributed")
    assert.equal(parseFirefliesNotesFilter(""), "unattributed")
    assert.equal(parseFirefliesNotesFilter("nope"), "unattributed")
  })

  it("accepts All / Clients / Publishers / Internal / New Business / Unattributed", () => {
    assert.deepEqual(FIREFLIES_NOTES_FILTERS, [
      "all",
      "client",
      "publisher",
      "internal",
      "new_business",
      "unattributed",
    ])
    for (const f of FIREFLIES_NOTES_FILTERS) {
      assert.equal(parseFirefliesNotesFilter(f), f)
    }
  })
})
