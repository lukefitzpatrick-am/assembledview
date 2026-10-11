/**
 * SM-30 / SM-30b — create and edit share PlanWizardBottomBar.
 * Visible row is Save draft, Files, Publish. Downloads live in the Files menu.
 *
 * @vitest-environment jsdom
 */
import { act, createElement, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PlanWizardBottomBar } from "@/components/mediaplans/PlanWizardBottomBar"
import { BLOB_DOWNLOAD_REVOKE_MS, clickBlobDownload } from "@/lib/docs/clickBlobDownload"
import { END_BEFORE_START_MESSAGE } from "@/lib/mediaplan/dateOrder"

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

function itemText(el: Element): string {
  return el.textContent?.replace(/\s+/g, " ").trim() ?? ""
}

function menuItemByLabel(root: ParentNode, label: string) {
  return Array.from(root.querySelectorAll('[role="menuitem"]')).find(
    (el) => itemText(el) === label,
  ) as HTMLElement | undefined
}

function itemDisabled(el: Element | undefined): boolean {
  return el?.getAttribute("aria-disabled") === "true"
}

/** Pointer sequence Radix uses for a menu item. Not element.click() on its own. */
async function pointerSelect(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
      }),
    )
    el.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
      }),
    )
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }))
  })
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
    const publish = buttonByLabel(container, "Publish")
    expect(publish?.className).toContain("bg-accent")
    expect(publish?.className).toContain("text-accent-foreground")
    const publishMenu = container.querySelector('[aria-label="Publish menu"]')
    expect(publishMenu?.className).toContain("bg-accent")
    const saveDraft = buttonByLabel(container, "Save draft")
    expect(saveDraft?.className).toContain("border-am-forest-light")
    expect(saveDraft?.className).toContain("bg-transparent")
    expect(saveDraft?.className).not.toContain("bg-background")
    const saveDraftMenu = container.querySelector('[aria-label="Save draft menu"]')
    expect(saveDraftMenu?.className).toContain("bg-transparent")
    expect(saveDraftMenu?.className).not.toContain("bg-background")
    const files = buttonByLabel(container, "Files")
    expect(files?.className).toContain("bg-transparent")
    expect(files?.className).not.toContain("bg-background")
    const allButtonLabels = Array.from(container.querySelectorAll("button")).map(
      (el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "",
    )
    expect(allButtonLabels.includes("Save & Download All")).toBe(false)
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
    const fileLabels = Array.from(document.body.querySelectorAll('[role="menuitem"]'))
      .map((el) => itemText(el))
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
    const mba = menuItemByLabel(document.body, "Download draft MBA")
    expect(mba?.className).not.toContain("bg-primary")
    expect(mba?.querySelector("svg")).toBeTruthy()
  })

  it("enables draft MBA on create and uses the watermark hint", async () => {
    act(() => {
      root.render(renderBar({ isCreate: true, isPublished: false }))
    })
    await openFiles(container)
    const mba = menuItemByLabel(document.body, "Download draft MBA")
    expect(mba).toBeTruthy()
    expect(itemDisabled(mba)).toBe(false)
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
    const published = menuItemByLabel(document.body, "Published Media Plan (v1)")
    expect(published).toBeTruthy()
    expect(itemDisabled(published)).toBe(false)
    await pointerSelect(published!)
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
    const published = menuItemByLabel(document.body, "Published Media Plan (AA) (v2)")
    expect(published).toBeTruthy()
    expect(itemDisabled(published)).toBe(false)
    await pointerSelect(published!)
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
    const labels = Array.from(document.body.querySelectorAll('[role="menuitem"]')).map(
      (el) => itemText(el),
    )
    expect(labels).toContain("Draft MBA")
    expect(labels).toContain("Published MBA (v33)")
    const draft = menuItemByLabel(document.body, "Draft MBA")
    expect(draft?.className).not.toContain("bg-primary")
  })

  it("shows Generating MBA… while busy", async () => {
    act(() => {
      root.render(renderBar({ isPublished: true, mbaBusy: true }))
    })
    await openFiles(container)
    const mba = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((el) =>
      el.textContent?.includes("Generating MBA"),
    )
    expect(mba?.textContent).toContain("Generating MBA…")
  })

  it("keeps idle MBA label when downloads are locked for page load", async () => {
    act(() => {
      root.render(renderBar({ mbaBusy: false, downloadsLocked: true, isPublished: true }))
    })
    await openFiles(container)
    const mba = menuItemByLabel(document.body, "MBA")
    expect(mba).toBeTruthy()
    expect(itemDisabled(mba)).toBe(true)
    expect(mba?.textContent).not.toContain("Generating MBA")
  })

  it("disables draft downloads when the end date is before the start", async () => {
    act(() => {
      root.render(
        renderBar({
          isCreate: true,
          isPublished: false,
          draftDownloadsBlocked: true,
          onExportDraft: NOOP,
        }),
      )
    })
    await openFiles(container)
    for (const label of ["Download draft MBA", "Download draft Media Plan"]) {
      const item = menuItemByLabel(document.body, label)
      expect(item).toBeTruthy()
      expect(itemDisabled(item)).toBe(true)
      expect(item?.getAttribute("title")).toBe(END_BEFORE_START_MESSAGE)
    }
    const exportDraft = menuItemByLabel(document.body, "Export draft")
    expect(exportDraft).toBeTruthy()
    expect(itemDisabled(exportDraft)).toBe(false)
    expect(exportDraft?.getAttribute("title")).not.toBe(END_BEFORE_START_MESSAGE)
  })

  it("disables draft AA and leaves published downloads enabled when dates are out of order", async () => {
    act(() => {
      root.render(
        renderBar({
          isPublished: true,
          hasWorkingDraftOrDirty: true,
          publishedVersionNumber: 3,
          hasAdvertisingAssociatesBilling: true,
          draftDownloadsBlocked: true,
        }),
      )
    })
    await openFiles(container)
    for (const label of ["Draft MBA", "Draft Media Plan", "Draft Media Plan (AA)"]) {
      const item = menuItemByLabel(document.body, label)
      expect(item).toBeTruthy()
      expect(itemDisabled(item)).toBe(true)
      expect(item?.getAttribute("title")).toBe(END_BEFORE_START_MESSAGE)
    }
    for (const label of [
      "Published MBA (v3)",
      "Published Media Plan (v3)",
      "Published Media Plan (AA) (v3)",
    ]) {
      const item = menuItemByLabel(document.body, label)
      expect(item).toBeTruthy()
      expect(itemDisabled(item)).toBe(false)
      expect(item?.getAttribute("title")).not.toBe(END_BEFORE_START_MESSAGE)
    }
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

  it("first Files select fires the handler once and downloads once", async () => {
    let draftCalls = 0
    const downloads: string[] = []
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:menu")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download)
      })
    act(() => {
      root.render(
        renderBar({
          isPublished: true,
          hasWorkingDraftOrDirty: true,
          publishedVersionNumber: 2,
          onDraftMba: () => {
            draftCalls += 1
            clickBlobDownload(new Blob(["draft"]), "draft-mba.pdf")
          },
        }),
      )
    })
    await openFiles(container)
    const draft = menuItemByLabel(document.body, "Draft MBA")
    expect(draft).toBeTruthy()
    await pointerSelect(draft!)
    expect(draftCalls).toBe(1)
    expect(downloads).toEqual(["draft-mba.pdf"])
    click.mockRestore()
    vi.restoreAllMocks()
  })

  it("clickBlobDownload clicks an attached anchor and revokes after the timeout", () => {
    vi.useFakeTimers()
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:plan-test")
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(document.body.contains(this)).toBe(true)
      })
    try {
      clickBlobDownload(new Blob(["pdf"]), "draft.pdf")
      expect(click).toHaveBeenCalledTimes(1)
      expect(document.body.querySelector("a[download='draft.pdf']")).toBeNull()
      expect(revoke).not.toHaveBeenCalled()
      vi.advanceTimersByTime(BLOB_DOWNLOAD_REVOKE_MS)
      expect(revoke).toHaveBeenCalledTimes(1)
      expect(revoke).toHaveBeenCalledWith("blob:plan-test")
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })
})
