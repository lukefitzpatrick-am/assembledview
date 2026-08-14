import assert from "node:assert/strict"
import { test } from "node:test"

import { clampTaskDetailWidth, TASK_DETAIL_WIDTH_DEFAULT } from "../taskDetailWidth.js"

test("clampTaskDetailWidth respects min 420 and max 80vw", () => {
  assert.equal(clampTaskDetailWidth(200, 1000), 420)
  assert.equal(clampTaskDetailWidth(900, 1000), 800)
  assert.equal(clampTaskDetailWidth(TASK_DETAIL_WIDTH_DEFAULT, 1200), TASK_DETAIL_WIDTH_DEFAULT)
})
