import assert from "node:assert/strict"
import test from "node:test"

import termsData from "../../../data/learning/terms.json"
import { buildFuseIndex, searchTerms } from "../search.js"
import type { LearningTerm } from "../types.js"

const terms = termsData as LearningTerm[]
const fuse = buildFuseIndex(terms)

test("searchTerms returns exact CPM as first hit", () => {
  const results = searchTerms(fuse, terms, "CPM")
  assert.ok(results.length > 0)
  assert.equal(results[0]!.item.term, "CPM")
  assert.equal(results[0]!.score, 0)
})

test("searchTerms finds ROAS GRP VOZ by exact term", () => {
  for (const name of ["ROAS", "GRP", "VOZ"]) {
    const results = searchTerms(fuse, terms, name)
    assert.equal(results[0]?.item.term, name, name)
  }
})
