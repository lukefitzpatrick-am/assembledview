import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { readFail, readOk } from "@/lib/data/readResult"
import {
  resolveListViewState,
  viewStateFromReadResult,
} from "../viewState"

describe("viewStateFromReadResult — forced domain failures → error, never empty", () => {
  const clear = () => {}

  it("finance-shaped DB error → ViewState error (never empty)", () => {
    const state = viewStateFromReadResult({
      loading: false,
      result: readFail("finance_billing_records query failed: connection refused"),
      visible: [],
      filtersActive: false,
      clear,
    })
    assert.equal(state.status, "error")
    if (state.status === "error") {
      assert.match(state.message, /finance_billing_records/)
    }
  })

  it("plans-shaped DB error → ViewState error (never empty)", () => {
    const state = viewStateFromReadResult({
      loading: false,
      result: readFail("media_plan_masters select failed"),
      visible: [],
      filtersActive: false,
      clear,
    })
    assert.equal(state.status, "error")
  })

  it("pacing-shaped warehouse error → ViewState error (never empty)", () => {
    const state = viewStateFromReadResult({
      loading: false,
      result: readFail("Snowflake query failed for meta"),
      visible: [],
      filtersActive: false,
      clear,
    })
    assert.equal(state.status, "error")
  })

  it("reference-shaped DB error → ViewState error (never empty)", () => {
    const state = viewStateFromReadResult({
      loading: false,
      result: readFail("publishers select failed"),
      visible: [],
      filtersActive: false,
      clear,
    })
    assert.equal(state.status, "error")
  })

  it("genuine empty (ok + []) → empty, not error", () => {
    const state = viewStateFromReadResult({
      loading: false,
      result: readOk([]),
      visible: [],
      filtersActive: false,
      clear,
    })
    assert.equal(state.status, "empty")
  })

  it("filtered-empty stays distinct from genuine empty", () => {
    const items = [{ id: 1 }, { id: 2 }]
    const state = viewStateFromReadResult({
      loading: false,
      result: readOk(items),
      visible: [],
      filtersActive: true,
      clear,
    })
    assert.equal(state.status, "filtered-empty")
  })

  it("ready carries derived freshness (never asserted)", () => {
    const state = viewStateFromReadResult({
      loading: false,
      result: readOk([{ id: 1 }], { stale: true, fetchedAt: 1_700_000_000_000 }),
      visible: [{ id: 1 }],
      filtersActive: false,
      clear,
    })
    assert.equal(state.status, "ready")
    if (state.status === "ready") {
      assert.equal(state.freshness?.stale, true)
      assert.equal(state.freshness?.fetchedAt, 1_700_000_000_000)
    }
  })
})

describe("resolveListViewState freshness", () => {
  it("attaches freshness only on ready", () => {
    const ready = resolveListViewState({
      loading: false,
      error: null,
      items: [1],
      visible: [1],
      filtersActive: false,
      clear: () => {},
      freshness: { stale: true, fetchedAt: 42 },
    })
    assert.equal(ready.status, "ready")
    if (ready.status === "ready") {
      assert.deepEqual(ready.freshness, { stale: true, fetchedAt: 42 })
    }

    const errored = resolveListViewState({
      loading: false,
      error: "boom",
      items: [],
      visible: [],
      filtersActive: false,
      clear: () => {},
      freshness: { stale: true },
    })
    assert.equal(errored.status, "error")
  })
})
