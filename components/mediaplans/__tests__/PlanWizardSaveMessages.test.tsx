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
        <PlanWizardSaveMessages draftBanner={null} saveMode={null} alerts={null} />
      )
    ).toBe("")
  })

  it("renders banner, then save-mode, then alerts, in that order", () => {
    const html = renderToStaticMarkup(
      <PlanWizardSaveMessages
        draftBanner={<span>DRAFT-BANNER</span>}
        saveMode={<span>SAVE-MODE</span>}
        alerts={<span>ALERTS</span>}
      />
    )
    expect(html).toContain("Save status")
    const bannerAt = html.indexOf("DRAFT-BANNER")
    const modeAt = html.indexOf("SAVE-MODE")
    const alertsAt = html.indexOf("ALERTS")
    expect(bannerAt).toBeGreaterThan(-1)
    expect(modeAt).toBeGreaterThan(bannerAt)
    expect(alertsAt).toBeGreaterThan(modeAt)
  })

  it("renders a save-mode-only idle card (no empty-card path)", () => {
    const html = renderToStaticMarkup(
      <PlanWizardSaveMessages saveMode={<span>Publish will create v1</span>} />
    )
    expect(html).toContain("Publish will create v1")
    expect(html).toContain("Save status")
    expect(html.includes("DRAFT-BANNER") || html.includes("ALERTS")).toBe(false)
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
