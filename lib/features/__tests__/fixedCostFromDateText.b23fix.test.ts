/**
 * B23fix (B23 review finding 9): the `fixed_cost_from_date` text claims only
 * what is built. B31 (FC9): the margin report reads the date only with its own
 * switch, `fixed_cost_margin_from_date`.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { featureDefinition } from "@/lib/features/registry"

test("fixed_cost_from_date text: no margin report split by day; names the FC9 switch", () => {
  const text = featureDefinition("fixed_cost_from_date")!.description
  assert.doesNotMatch(text, /margin report by day/)
  assert.doesNotMatch(text, /FC9 not built/)
  assert.match(text, /splits client dashboards, decks and pacing by day/)
  assert.match(
    text,
    /fixed-cost margin report reads the date only when its own switch, Fixed cost margin by the from date, is on too \(FC9\)/,
  )
  assert.equal(featureDefinition("fixed_cost_margin_from_date")!.label, "Fixed cost margin by the from date")
})
