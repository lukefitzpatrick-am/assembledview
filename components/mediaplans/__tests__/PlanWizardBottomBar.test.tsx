/**
 * SM-30 / SM-30b — create and edit share PlanWizardBottomBar.
 * Visible row is Save draft, Files, Publish. Downloads live in the Files menu.
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

function buttonByLabel(root: ParentNode, label: string) {
  return Array.from(root.querySelectorAll("button")).find(
    (el) => el.textContent?.replace(/\s+/g, " ").trim() === label,
  )
}

async function openFiles(container: HTMLElement) {
  const files = buttonByLabel(container, "Files")
  expect(files).toBeTruthy()
  await act(async () => {
    files!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    files!.click()
  })
}

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

  it("renders Save draft, Files, then Publish, with draft downloads in Files", async () => {
    act(() => {
      root.render(renderBar({ isCreate: true }))
    })
    const labels = Array.from(container.querySelectorAll("button"))
      .map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((text) => text === "Publish" || text === "Save draft" || text === "Files")
    expect(labels).toEqual(["Save draft", "Files", "Publish"])
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
    await openFiles(container)
    const fileLabels = Array.from(document.body.querySelectorAll("button"))
      .map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(
        (text) =>
          text === "Download draft MBA" ||
          text === "Download draft Media Plan" ||
          text === "Generate Naming (Ava)",
      )
    expect(fileLabels).toEqual([
      "Download draft MBA",
      "Download draft Media Plan",
      "Generate Naming (Ava)",
    ])
    const mba = buttonByLabel(document.body, "Download draft MBA")
    expect(mba?.className).not.toContain("bg-primary")
    expect(mba?.querySelector("svg")).toBeTruthy()
  })

  it("enables draft MBA on create and uses the watermark hint", async () => {
    act(() => {
      root.render(renderBar({ isCreate: true, isPublished: false }))
    })
    await openFiles(container)
    const mba = buttonByLabel(document.body, "Download draft MBA")
    expect(mba).toBeTruthy()
    expect(mba?.disabled).toBe(false)
    expect(mba?.getAttribute("title")).toBe("Watermarked DRAFT. Clients still have vN.")
  })

  it("edit dirty Published Media Plan calls the published handler, not the draft handler", async () => {
    let publishedCalls = 0
    let draftCalls = 0
    act(() => {
      root.render(
        renderBar({
          isPublished: true,
          hasWorkingDraftOrDirty: true,
          publishedVersionNumber: 1,
          gateDownloadsOnPublish: true,
          onDownloadMediaPlan: () => {
            publishedCalls += 1
          },
          onDraftMediaPlan: () => {
            draftCalls += 1
          },
        }),
      )
    })
    await openFiles(container)
    const published = buttonByLabel(document.body, "Published Media Plan (v1)")
    expect(published).toBeTruthy()
    expect(published?.disabled).toBe(false)
    act(() => {
      published!.click()
    })
    expect(publishedCalls).toBe(1)
    expect(draftCalls).toBe(0)
  })

  it("edit dirty Published Media Plan (AA) calls the published handler, not the draft handler", async () => {
    let publishedCalls = 0
    let draftCalls = 0
    act(() => {
      root.render(
        renderBar({
          isPublished: true,
          hasWorkingDraftOrDirty: true,
          hasAdvertisingAssociatesBilling: true,
          publishedVersionNumber: 2,
          gateDownloadsOnPublish: true,
          onDownloadAa: () => {
            publishedCalls += 1
          },
          onDraftAa: () => {
            draftCalls += 1
          },
        }),
      )
    })
    await openFiles(container)
    const published = buttonByLabel(document.body, "Published Media Plan (AA) (v2)")
    expect(published).toBeTruthy()
    expect(published?.disabled).toBe(false)
    act(() => {
      published!.click()
    })
    expect(publishedCalls).toBe(1)
    expect(draftCalls).toBe(0)
  })

  it("edit dirty shows Draft MBA and Published MBA (vN)", async () => {
    act(() => {
      root.render(
        renderBar({
          isPublished: true,
          hasWorkingDraftOrDirty: true,
          publishedVersionNumber: 33,
        }),
      )
    })
    await openFiles(container)
    const labels = Array.from(document.body.querySelectorAll("button")).map(
      (el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "",
    )
    expect(labels).toContain("Draft MBA")
    expect(labels).toContain("Published MBA (v33)")
    const draft = buttonByLabel(document.body, "Draft MBA")
    expect(draft?.className).not.toContain("bg-primary")
  })

  it("shows Generating MBA… while busy", async () => {
    act(() => {
      root.render(renderBar({ isPublished: true, mbaBusy: true }))
    })
    await openFiles(container)
    const mba = Array.from(document.body.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Generating MBA"),
    )
    expect(mba?.textContent).toContain("Generating MBA…")
  })

  it("keeps idle MBA label when downloads are locked for page load", async () => {
    act(() => {
      root.render(renderBar({ mbaBusy: false, downloadsLocked: true, isPublished: true }))
    })
    await openFiles(container)
    const mba = buttonByLabel(document.body, "MBA")
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
