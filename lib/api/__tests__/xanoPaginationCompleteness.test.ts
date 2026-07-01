import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"
import axios from "axios"

const mockGet = mock.fn(async (): Promise<{ data: unknown[] }> => ({ data: [] }))
axios.get = mockGet as typeof axios.get

const { fetchAllXanoPagesWithCompleteness } = await import("../xanoPagination.js")

beforeEach(() => {
  mockGet.mock.resetCalls()
})

test("marks pagination incomplete when a non-404 page error is swallowed", async () => {
  let callNumber = 0
  mockGet.mock.mockImplementation(async () => {
    callNumber += 1
    if (callNumber === 1) {
      return { data: [{ id: 1, line_item_id: "LI-1" }] }
    }

    const error = new Error("upstream unavailable") as Error & {
      response?: { status: number }
    }
    error.response = { status: 503 }
    throw error
  })

  const result = await fetchAllXanoPagesWithCompleteness(
    "https://xano.test/media_plan_search",
    {},
    "TEST",
    1,
    5
  )

  assert.deepEqual(result.items, [{ id: 1, line_item_id: "LI-1" }])
  assert.equal(result.complete, false)
})

test("keeps pagination complete when a 404 terminates pagination", async () => {
  let callNumber = 0
  mockGet.mock.mockImplementation(async () => {
    callNumber += 1
    if (callNumber === 1) {
      return { data: [{ id: 1, line_item_id: "LI-1" }] }
    }

    const error = new Error("not found") as Error & {
      response?: { status: number }
    }
    error.response = { status: 404 }
    throw error
  })

  const result = await fetchAllXanoPagesWithCompleteness(
    "https://xano.test/media_plan_search",
    {},
    "TEST",
    1,
    5
  )

  assert.deepEqual(result.items, [{ id: 1, line_item_id: "LI-1" }])
  assert.equal(result.complete, true)
})
