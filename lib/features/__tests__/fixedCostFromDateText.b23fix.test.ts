/**
 * B23fix (B23 review finding 9): the `fixed_cost_from_date` text claims only
 * what B23 built. The margin report (FC9) doesn't read the date.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { featureDefinition } from "@/lib/features/registry"

test("fixed_cost_from_date text: no margin report split; says FC9 is not built", () => {
  const text = featureDefinition("fixed_cost_from_date")!.description
  assert.doesNotMatch(text, /margin report by day/)
  assert.match(text, /splits client dashboards, decks and pacing by day/)
  assert.match(text, /margin report doesn't read the date yet \(FC9 not built\)/)
})
