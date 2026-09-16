import assert from "node:assert/strict"
import test from "node:test"

import { pacingFactChannelWhere } from "../pacing-fact"

test("pacing-fact matcher picks Programmatic - OOH via programmatic and ooh LIKE", () => {
  const where = pacingFactChannelWhere("programmatic-ooh")
  assert.match(where, /LIKE '%programmatic%'/)
  assert.match(where, /LIKE '%ooh%'/)
  assert.doesNotMatch(where, /%display%/)
  assert.doesNotMatch(where, /%video%/)
})

test("programmatic-display and programmatic-video keep their existing matchers", () => {
  assert.match(pacingFactChannelWhere("programmatic-display"), /LIKE '%display%'/)
  assert.match(pacingFactChannelWhere("programmatic-video"), /LIKE '%video%'/)
})
