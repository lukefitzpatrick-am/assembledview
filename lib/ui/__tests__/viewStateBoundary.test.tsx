import assert from "node:assert/strict"
import { describe, it } from "node:test"
import React, { type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { resolveListViewState, type ViewState } from "@/lib/ui/viewState"

function renderBranch(state: ViewState<string[]>): string {
  // Render-prop children — eslint's createElement children-prop rule doesn't apply to JSX.
  const tree: ReactElement = (
    <ViewStateBoundary
      state={state}
      emptyAction={<button type="button">Create</button>}
    >
      {(data) => <ul data-testid="ready-list">{data.join(",")}</ul>}
    </ViewStateBoundary>
  )
  return renderToStaticMarkup(tree)
}

function assertExactlyOneBranch(html: string, expected: string) {
  const matches = html.match(/data-view-state="([^"]+)"/g) ?? []
  assert.equal(matches.length, 1, `expected one data-view-state, got ${matches.join(",")}`)
  assert.match(html, new RegExp(`data-view-state="${expected}"`))
  for (const other of ["loading", "error", "empty", "filtered-empty", "ready"]) {
    if (other === expected) continue
    assert.doesNotMatch(html, new RegExp(`data-view-state="${other}"`))
  }
}

describe("resolveListViewState", () => {
  it("prefers error over empty when the fetch cleared items", () => {
    const state = resolveListViewState({
      loading: false,
      error: "boom",
      items: [],
      visible: [],
      filtersActive: false,
      clear: () => {},
      retry: () => {},
    })
    assert.equal(state.status, "error")
  })

  it("distinguishes filtered-empty from genuinely empty", () => {
    const empty = resolveListViewState({
      loading: false,
      error: null,
      items: [],
      visible: [],
      filtersActive: false,
      clear: () => {},
    })
    assert.equal(empty.status, "empty")

    const filtered = resolveListViewState({
      loading: false,
      error: null,
      items: ["a"],
      visible: [],
      filtersActive: true,
      clear: () => {},
    })
    assert.equal(filtered.status, "filtered-empty")
  })
})

describe("ViewStateBoundary", () => {
  it("renders exactly one branch per state", () => {
    assertExactlyOneBranch(renderBranch({ status: "loading" }), "loading")
    assertExactlyOneBranch(
      renderBranch({ status: "error", message: "failed", retry: () => {} }),
      "error",
    )
    assertExactlyOneBranch(renderBranch({ status: "empty" }), "empty")
    assertExactlyOneBranch(
      renderBranch({ status: "filtered-empty", clear: () => {} }),
      "filtered-empty",
    )
    assertExactlyOneBranch(renderBranch({ status: "ready", data: ["one"] }), "ready")
  })

  it("error branch includes the message and no empty copy", () => {
    const html = renderBranch({ status: "error", message: "Tasks failed to load" })
    assert.match(html, /Tasks failed to load/)
    assert.doesNotMatch(html, /No data yet/)
    assert.doesNotMatch(html, /No matches/)
  })

  it("filtered-empty exposes a Clear filters action", () => {
    const html = renderBranch({ status: "filtered-empty", clear: () => {} })
    assert.match(html, /Clear filters/)
  })
})
