import assert from "node:assert/strict"
import test from "node:test"

import { statusCountsFromColumns } from "../boardCounts.js"

test("statusCountsFromColumns uses loaded column sizes, zero for missing columns", () => {
  assert.deepEqual(
    statusCountsFromColumns({
      todo: [{}, {}],
      in_progress: [{}],
      done: [],
    }),
    { backlog: 0, todo: 2, in_progress: 1, waiting: 0, done: 0 }
  )
})
