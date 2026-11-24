import assert from "node:assert/strict"
import test from "node:test"

import { clientMatchTerms } from "../rules.js"

test("Match terms: name, aliases and account refs and labels, lower case, 4 characters or more", () => {
  assert.deepEqual(
    clientMatchTerms(" PGA of Australia ", ["PGA", " PGA_AU_2026 ", "Golf", 9], [
      { ref: "act_123", label: "ABC" },
      { ref: null, label: "Main Account" },
    ]),
    ["pga of australia", "pga_au_2026", "golf", "act_123", "main account"],
  )
  assert.deepEqual(clientMatchTerms("Abc", "not an array", []), [])
})
