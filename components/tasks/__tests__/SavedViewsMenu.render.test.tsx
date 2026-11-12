/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { CodexSavedView } from "@/lib/codex/savedViews"

import { SavedViewsMenu } from "../SavedViewsMenu"

const VIEW: CodexSavedView = {
  id: 3,
  owner_email: "luke@x.au",
  name: "My SEO",
  screen: "tasks",
  lens: "plan",
  filters: { status: "todo" },
  layout: "board",
  group_by: "status",
  shared: false,
  created_at: "2026-11-13T00:00:00Z",
  mine: true,
}

const noop = async () => true

function html(activeViewId: number | null, edited: boolean) {
  return renderToStaticMarkup(
    <SavedViewsMenu
      views={[VIEW]}
      activeViewId={activeViewId}
      activeViewEdited={edited}
      onPick={() => {}}
      onSave={noop}
      onRename={noop}
      onSetShared={noop}
      onDelete={noop}
    />,
  )
}

describe("SavedViewsMenu (F8)", () => {
  it("shows Views with no active view", () => {
    const out = html(null, false)
    expect(out).toContain("Views")
    expect(out).not.toContain("My SEO")
  })

  it("shows the active view's name, and marks it edited when the toolbar changed", () => {
    expect(html(3, false)).toContain("My SEO")
    expect(html(3, false)).not.toContain("(edited)")
    expect(html(3, true)).toContain("My SEO (edited)")
  })
})
