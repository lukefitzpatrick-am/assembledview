/**
 * SM-23 — Open + Download on campaign rows.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

import {
  CampaignRowActions,
  resetCampaignDocumentsCacheForTests,
} from "@/components/campaign/CampaignRowActions"

function pointerCaptureShim() {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
  }
}

const unpublished = {
  publishedVersionId: null,
  versionNumber: null,
  publishedAt: null,
  files: { mba_pdf: null, media_plan: null, aa_media_plan: null },
}

const twoOfThree = {
  publishedVersionId: 42,
  versionNumber: 6,
  publishedAt: "2026-09-05T04:00:00.000Z",
  files: {
    mba_pdf: { url: "https://example.test/mba.pdf", savedAt: "2026-09-05T04:00:00.000Z" },
    media_plan: { url: "https://example.test/mp.xlsx", savedAt: "2026-09-05T04:00:00.000Z" },
    aa_media_plan: null,
  },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("CampaignRowActions", () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    pointerCaptureShim()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    push.mockReset()
    resetCampaignDocumentsCacheForTests()
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
  })

  it("canEdit false → no caret on Open", () => {
    act(() => {
      root.render(
        <CampaignRowActions
          mbaNumber="glenda008"
          versionNumber={6}
          clientSlug="glendale"
          canEdit={false}
        />,
      )
    })
    const open = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Open"),
    )
    expect(open).toBeTruthy()
    expect(open?.getAttribute("aria-haspopup")).not.toBe("menu")
    const openCaret = [...container.querySelectorAll("button")].find(
      (el) => el.getAttribute("aria-label") === "Open menu",
    )
    expect(openCaret).toBeUndefined()
  })

  it("unpublished → Download disabled with tooltip after menu fetch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(unpublished))
    act(() => {
      root.render(
        <CampaignRowActions
          mbaNumber="krusty001"
          versionNumber={1}
          clientSlug="krusty"
          canEdit
        />,
      )
    })
    const download = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Download"),
    )
    expect(download).toBeTruthy()
    expect(download?.disabled).toBe(false)

    await act(async () => {
      download!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      download!.click()
    })
    await vi.waitFor(() => {
      const disabledDownload = [...container.querySelectorAll("button")].find((el) =>
        el.textContent?.includes("Download"),
      )
      expect(disabledDownload?.disabled).toBe(true)
      expect(disabledDownload?.getAttribute("title")).toBe("No published version")
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("two of three files → third row disabled with reason", async () => {
    fetchMock.mockResolvedValue(jsonResponse(twoOfThree))
    act(() => {
      root.render(
        <CampaignRowActions
          mbaNumber="glenda008"
          versionNumber={6}
          clientSlug="glendale"
          canEdit
        />,
      )
    })
    const download = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Download"),
    )
    await act(async () => {
      download!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      download!.click()
    })
    await vi.waitFor(() => {
      const items = [...document.body.querySelectorAll("[role='menuitem']")]
      expect(items.find((el) => el.textContent?.includes("AA media plan"))).toBeTruthy()
    })

    const items = [...document.body.querySelectorAll("[role='menuitem']")]
    const aa = items.find((el) => el.textContent?.includes("AA media plan"))
    expect(aa).toBeTruthy()
    expect(aa?.getAttribute("data-disabled") === "" || aa?.getAttribute("aria-disabled") === "true").toBe(
      true,
    )
    expect(aa?.textContent).toContain("not saved for v6")
    expect(items.find((el) => el.textContent?.includes("MBA"))?.getAttribute("aria-disabled")).not.toBe(
      "true",
    )
  })

  it("menu fetch happens on open, once", async () => {
    fetchMock.mockResolvedValue(jsonResponse(twoOfThree))
    act(() => {
      root.render(
        <CampaignRowActions
          mbaNumber="glenda008"
          versionNumber={6}
          clientSlug="glendale"
          canEdit
        />,
      )
    })
    expect(fetchMock).not.toHaveBeenCalled()
    const download = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Download"),
    )
    await act(async () => {
      download!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      download!.click()
    })
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/api/mediaplans/mba/glenda008/documents",
    )

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    await act(async () => {
      download!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      download!.click()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
