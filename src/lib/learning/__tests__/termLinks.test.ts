import assert from "node:assert/strict"
import test from "node:test"

import {
  hrefForGlossaryTerm,
  hrefForKnowledgeSearch,
  findTermByName,
} from "../termLinks.js"

test("CPM resolves to formulas section (findable from home search)", () => {
  const t = findTermByName("CPM")
  assert.ok(t)
  assert.equal(t!.type, "formula")
  const href = hrefForKnowledgeSearch("CPM")
  assert.match(href, /\/knowledge\/formulas/)
  assert.match(href, /q=CPM/)
  assert.match(href, /id=/)
})

test("ROAS GRP VOZ related-term links are not stuck on definitions", () => {
  for (const name of ["ROAS", "GRP", "VOZ"]) {
    const href = hrefForGlossaryTerm(name)
    assert.ok(href, `missing term ${name}`)
    assert.equal(href!.includes("/knowledge/definitions?"), false, name)
  }
})
