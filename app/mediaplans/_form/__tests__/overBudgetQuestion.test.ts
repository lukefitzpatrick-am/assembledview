/** B57: the over budget question both plan pages ask before a save. */
import assert from "node:assert/strict"
import test from "node:test"

import { overBudgetQuestion } from "../overBudgetQuestion"

test("names the overspend and the action, in the default tone", () => {
  assert.deepEqual(overBudgetQuestion(-1234.5), {
    title: "Save over budget?",
    description: "Budget remaining is -$1,234.50. This campaign is over budget.",
    confirmLabel: "Save anyway",
  })
})
