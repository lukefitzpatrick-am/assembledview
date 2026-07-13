import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"
import axios from "axios"

const mockGet = mock.fn(async (..._args: unknown[]): Promise<{ data: unknown }> => ({ data: [] }))
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

test("walks Xano paged objects via nextPage", async () => {
  let callNumber = 0
  mockGet.mock.mockImplementation(async (url: string) => {
    callNumber += 1
    const page = Number(new URL(url).searchParams.get("page") || "1")
    if (page === 1) {
      return {
        data: {
          items: [{ id: 1 }],
          curPage: 1,
          nextPage: 2,
          itemsReceived: 1,
          itemsTotal: 2,
          pageTotal: 2,
        },
      }
    }
    return {
      data: {
        items: [{ id: 2 }],
        curPage: 2,
        nextPage: null,
        itemsReceived: 1,
        itemsTotal: 2,
        pageTotal: 2,
      },
    }
  })

  const result = await fetchAllXanoPagesWithCompleteness(
    "https://xano.test/media_plan_versions_latest",
    {},
    "TEST_PAGED",
    1,
    5
  )

  assert.deepEqual(result.items, [{ id: 1 }, { id: 2 }])
  assert.equal(result.complete, true)
  assert.equal(callNumber, 2)
})
