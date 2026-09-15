/**
 * SM-30 / SM-30b — create and edit share PlanWizardBottomBar:
 * Publish, Save draft, then download group (MBA first).
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

  it("renders Publish, Save draft, then MBA first in the download group", async () => {
    act(() => {
      root.render(renderBar())
    })
    const labels = Array.from(container.querySelectorAll("button"))
      .map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(
        (text) =>
          text === "Publish" ||
          text === "Save draft" ||
          text === "MBA" ||
          text === "Media Plan" ||
          text === "Media Plan (AA)" ||
          text === "Generate Naming (Ava)",
      )
    expect(labels.slice(0, 6)).toEqual([
      "Publish",
      "Save draft",
      "MBA",
      "Media Plan",
      "Media Plan (AA)",
      "Generate Naming (Ava)",
    ])
    const allButtonLabels = Array.from(container.querySelectorAll("button")).map(
      (el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "",
    )
    expect(allButtonLabels.includes("Save & Download All")).toBe(false)
    const publishMenu = container.querySelector('[aria-label="Publish menu"]')
    expect(publishMenu).not.toBeNull()
    await act(async () => {
      publishMenu!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      ;(publishMenu as HTMLButtonElement).click()
    })
    expect(document.body.textContent).toContain("Publish & download all")
    expect(document.body.textContent).toContain(
      "Publishes, then downloads the MBA, media plan and naming as one zip",
    )
    expect(container.querySelector('[aria-label="Save draft menu"]')).not.toBeNull()
    const mba = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.replace(/\s+/g, " ").trim() === "MBA",
    )
    expect(mba?.className).toContain("bg-primary")
    expect(mba?.className).not.toContain("border-border")
    expect(mba?.querySelector("svg")).toBeTruthy()
  })

  it("disables MBA until published and uses the draft title", () => {
    act(() => {
      root.render(
        renderBar({
          isPublished: false,
          draftBlocksDownloadMessage: "Publish this version to download and send to client",
        }),
      )
    })
    const mba = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.replace(/\s+/g, " ").trim() === "MBA",
    )
    expect(mba).toBeTruthy()
    expect(mba?.disabled).toBe(true)
    expect(mba?.getAttribute("title")).toBe(
      "Publish this version to download and send to client",
    )
  })

  it("shows Generating MBA… while busy", () => {
    act(() => {
      root.render(renderBar({ isPublished: true, mbaBusy: true }))
    })
    const mba = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Generating MBA"),
    )
    expect(mba?.textContent).toContain("Generating MBA…")
  })

  it("keeps idle MBA label when downloads are locked for page load", () => {
    act(() => {
      root.render(renderBar({ mbaBusy: false, downloadsLocked: true, isPublished: true }))
    })
    const mba = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.replace(/\s+/g, " ").trim() === "MBA",
    )
    expect(mba).toBeTruthy()
    expect(mba?.disabled).toBe(true)
    expect(mba?.textContent).not.toContain("Generating MBA")
  })

  it("SD-1: disabled Save draft exposes the create tooltip", () => {
    act(() => {
      root.render(
        renderBar({
          saveDraftDisabled: true,
          saveDraftTitle: "Drafts save to this browser until the plan is published",
        }),
      )
    })
    const saveDraft = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.replace(/\s+/g, " ").trim() === "Save draft",
    )
    expect(saveDraft).toBeTruthy()
    expect(saveDraft?.disabled).toBe(true)
    expect(saveDraft?.getAttribute("title")).toBe(
      "Drafts save to this browser until the plan is published",
    )
  })
})
