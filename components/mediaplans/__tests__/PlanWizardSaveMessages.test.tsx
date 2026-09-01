/**
 * UI-1 — Save-status panel empty/order contract + compact draft actions.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { PlanDraftActiveBanner } from "@/components/mediaplan/PlanDraftChrome"
import { PlanWizardSaveMessages } from "@/components/mediaplans/PlanWizardSaveMessages"

describe("PlanWizardSaveMessages", () => {
  it("renders nothing when every slot is empty", () => {
    expect(renderToStaticMarkup(<PlanWizardSaveMessages />)).toBe("")
    expect(
      renderToStaticMarkup(
        <PlanWizardSaveMessages
          draftBanner={null}
          issues={[]}
          extraProblemTexts={[]}
          savePrimary={null}
          saveSecondary={null}
          saveTip={null}
          isSaving={false}
        />
      )
    ).toBe("")
  })

  it("renders problems before draft before save state", () => {
    const html = renderToStaticMarkup(
      <PlanWizardSaveMessages
        extraProblemTexts={["ALERTS"]}
        draftBanner={<span>DRAFT-BANNER</span>}
        savePrimary="SAVE-MODE"
      />
    )
    expect(html).toContain("Save status")
    const alertsAt = html.indexOf("ALERTS")
    const bannerAt = html.indexOf("DRAFT-BANNER")
    const modeAt = html.indexOf("SAVE-MODE")
    expect(alertsAt).toBeGreaterThan(-1)
    expect(bannerAt).toBeGreaterThan(alertsAt)
    expect(modeAt).toBeGreaterThan(bannerAt)
  })

  it("renders a save-state-only card", () => {
    const html = renderToStaticMarkup(
      <PlanWizardSaveMessages savePrimary="Publish will create v1" />
    )
    expect(html).toContain("Publish will create v1")
    expect(html).toContain("Save status")
    expect(html).toContain("On save")
    expect(html.includes("Unsaved draft")).toBe(false)
    expect(html.includes("DRAFT-BANNER") || html.includes("ALERTS")).toBe(false)
  })

  it("renders Saving… when isSaving", () => {
    const idleEmpty = renderToStaticMarkup(<PlanWizardSaveMessages />)
    const savingOnly = renderToStaticMarkup(<PlanWizardSaveMessages isSaving />)
    expect(idleEmpty).toBe("")
    expect(savingOnly).toContain("Save status")
    expect(savingOnly).toContain("Saving…")
    expect(savingOnly).toContain("On save")

    const replacingPill = renderToStaticMarkup(
      <PlanWizardSaveMessages
        isSaving
        savePrimary="Publish will create v1"
        saveSecondary="Draft — working copy (not published)"
        saveTip="v4"
      />
    )
    expect(replacingPill).toContain("Saving…")
    expect(replacingPill.includes("Publish will create v1")).toBe(false)
    expect(replacingPill).toContain("Draft — working copy (not published)")
    expect(replacingPill).toContain("Docs/pacing serve v4")
  })

  it("renders extraProblemTexts after issues", () => {
    const html = renderToStaticMarkup(
      <PlanWizardSaveMessages
        issues={[
          {
            id: "missing-client",
            severity: "warning",
            title: "ISSUE-TITLE",
          },
        ]}
        extraProblemTexts={["EXTRA-TEXT"]}
      />
    )
    const issueAt = html.indexOf("ISSUE-TITLE")
    const extraAt = html.indexOf("EXTRA-TEXT")
    expect(issueAt).toBeGreaterThan(-1)
    expect(extraAt).toBeGreaterThan(issueAt)
  })
})

describe("PlanDraftActiveBanner compact", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("keeps View changes and Discard draft and calls onDiscard", () => {
    const onDiscard = vi.fn()
    act(() => {
      root.render(
        <PlanDraftActiveBanner
          compact
          updatedAt="2026-09-01T00:00:00.000Z"
          headline="Unsaved campaign: Acme — Spring, 2 lines, $1000"
          summary={{
            fieldChanges: [],
            addedLineIds: [],
            removedLines: [],
            changeCount: 0,
          }}
          onDiscard={onDiscard}
        />
      )
    })
    const buttons = Array.from(container.querySelectorAll("button")).map(
      (el) => el.textContent?.trim()
    )
    expect(buttons).toContain("View changes")
    expect(buttons).toContain("Discard draft")
    const discard = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Discard draft"
    )
    expect(discard).toBeTruthy()
    act(() => {
      discard!.click()
    })
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})
