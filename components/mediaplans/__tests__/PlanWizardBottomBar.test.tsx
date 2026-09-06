/**
 * SM-30 — create and edit share PlanWizardBottomBar: Publish, Save draft, Publish MBA.
 *
 * @vitest-environment jsdom
 */
import { act, createElement, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PlanWizardBottomBar } from "@/components/mediaplans/PlanWizardBottomBar"

function pointerCaptureShim() {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
  }
}

const NOOP = () => undefined

function renderBar(overrides: Partial<ComponentProps<typeof PlanWizardBottomBar>> = {}) {
  return createElement(PlanWizardBottomBar, {
    savePublishesImmediately: true,
    isPublished: false,
    primaryLabel: "Publish",
    isSaving: false,
    saveBarDisabled: false,
    onPrimary: NOOP,
    onPublishAndExit: NOOP,
    onSaveAndExit: NOOP,
    showExplicitPublish: false,
    onExplicitPublish: NOOP,
    onExplicitPublishAndExit: NOOP,
    showSaveDraft: true,
    onSaveDraft: NOOP,
    onSaveDraftAndExit: NOOP,
    saveDraftDisabled: false,
    onPublishMba: NOOP,
    mbaBusy: false,
    onDownloadMediaPlan: NOOP,
    onDownloadAa: NOOP,
    onDownloadNaming: NOOP,
    onSaveAndDownloadAll: NOOP,
    isDownloading: false,
    isDownloadingAa: false,
    isNamingDownloading: false,
    downloadsLocked: false,
    hasAdvertisingAssociatesBilling: false,
    gateDownloadsOnPublish: false,
    ...overrides,
  })
}

describe("PlanWizardBottomBar", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    pointerCaptureShim()
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

  it("renders Publish, Save draft, Publish MBA in that order via SplitActionButton then outline MBA", () => {
    act(() => {
      root.render(renderBar())
    })
    const labels = Array.from(container.querySelectorAll("button"))
      .map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((text) => text === "Publish" || text === "Save draft" || text === "Publish MBA")
    expect(labels.slice(0, 3)).toEqual(["Publish", "Save draft", "Publish MBA"])
    expect(container.querySelector('[aria-label="Publish menu"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Save draft menu"]')).not.toBeNull()
  })

  it("disables Publish MBA until published and uses the draft title", () => {
    act(() => {
      root.render(
        renderBar({
          isPublished: false,
          draftBlocksDownloadMessage: "Publish this version to download and send to client",
        }),
      )
    })
    const mba = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.includes("Publish MBA"),
    )
    expect(mba).toBeTruthy()
    expect(mba?.disabled).toBe(true)
    expect(mba?.getAttribute("title")).toBe(
      "Publish this version to download and send to client",
    )
  })

  it("shows Publishing MBA… while busy", () => {
    act(() => {
      root.render(renderBar({ isPublished: true, mbaBusy: true }))
    })
    const mba = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Publishing MBA"),
    )
    expect(mba?.textContent).toContain("Publishing MBA…")
  })
})
