import assert from "node:assert/strict"
import test from "node:test"

import { resolveListViewState } from "../viewState.js"

test("fetch error is error, never empty (confident-zero guard)", () => {
  const state = resolveListViewState({
    loading: false,
    error: "Failed to fetch media plans",
    items: [],
    visible: [],
    filtersActive: false,
    clear: () => {},
  })
  assert.equal(state.status, "error")
  if (state.status === "error") {
    assert.match(state.message, /Failed to fetch/)
  }
})

test("filtered-empty when filters exclude everything", () => {
  const state = resolveListViewState({
    loading: false,
    error: null,
    items: [{ id: 1 }],
    visible: [],
    filtersActive: true,
    clear: () => {},
  })
  assert.equal(state.status, "filtered-empty")
})
