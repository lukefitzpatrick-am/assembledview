import assert from "node:assert/strict"
import test from "node:test"

import {
  enqueueVisibleMount,
  resetVisibleMountQueueForTests,
} from "@/lib/mediaplan/staggerVisibleMount"

test("enqueueVisibleMount: drains all callbacks when rAF is unavailable", () => {
  resetVisibleMountQueueForTests()
  const order: number[] = []
  enqueueVisibleMount(() => order.push(1))
  enqueueVisibleMount(() => order.push(2))
  enqueueVisibleMount(() => order.push(3))
  assert.deepEqual(order, [1, 2, 3])
})
