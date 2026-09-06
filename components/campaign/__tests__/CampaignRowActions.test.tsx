/**
 * SM-23 / SM-25 — Open + Download on campaign rows.
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

function findButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((el) =>
    el.textContent?.includes(label),
  )
}

async function openMenu(button: HTMLElement) {
  await act(async () => {
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    button.click()
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

  it("canEdit false → Open menu has View only, no Edit row", async () => {
    act(() => {
      root.render(
        <CampaignRowActions
          layout="stacked"
          mbaNumber="glenda008"
          versionNumber={6}
          clientSlug="glendale"
          canEdit={false}
        />,
      )
    })
    const open = findButton(container, "Open")
    expect(open).toBeTruthy()
    expect(open?.disabled).toBe(false)
    await openMenu(open!)
    const items = [...document.body.querySelectorAll("[role='menuitem']")]
    expect(items.map((el) => el.textContent?.trim())).toEqual(["View campaign"])
    expect(items.find((el) => el.textContent?.includes("Edit media plan"))).toBeUndefined()
  })

  it("canEdit true → Open menu is Edit media plan · v6 then View campaign", async () => {
    act(() => {
      root.render(
        <CampaignRowActions
          layout="stacked"
          mbaNumber="glenda008"
          versionNumber={6}
          clientSlug="glendale"
          canEdit
        />,
      )
    })
    await openMenu(findButton(container, "Open")!)
    const items = [...document.body.querySelectorAll("[role='menuitem']")]
    expect(items.map((el) => el.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "Edit media plan · v6",
      "View campaign",
    ])
  })

  it("layout stacked → flex-col wrapper, both w-full", () => {
    act(() => {
      root.render(
        <CampaignRowActions
          layout="stacked"
          mbaNumber="glenda008"
          versionNumber={6}
          clientSlug="glendale"
          canEdit
        />,
      )
    })
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain("flex-col")
    expect(wrapper?.className).toContain("w-full")
    expect(wrapper?.className).toContain("min-w-[10rem]")
    const pills = [...wrapper!.children]
    expect(pills.length).toBe(2)
    for (const pill of pills) {
      expect(pill.className).toContain("w-full")
    }
  })

  it("layout columns → grid-cols-2", () => {
    act(() => {
      root.render(
        <CampaignRowActions
          layout="columns"
          mbaNumber="glenda008"
          versionNumber={6}
          clientSlug="glendale"
          canEdit
        />,
      )
    })
    expect(container.firstElementChild?.className).toContain("grid-cols-2")
  })

  it("both menus render with data-side=bottom", async () => {
    fetchMock.mockResolvedValue(jsonResponse(twoOfThree))
    act(() => {
      root.render(
        <CampaignRowActions
          layout="stacked"
          mbaNumber="glenda008"
          versionNumber={6}
          clientSlug="glendale"
          canEdit
        />,
      )
    })
    await openMenu(findButton(container, "Open")!)
    expect(document.body.querySelector("[role='menu']")?.getAttribute("data-side")).toBe(
      "bottom",
    )
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    await openMenu(findButton(container, "Download")!)
    await vi.waitFor(() => {
      expect(document.body.querySelector("[role='menu']")?.getAttribute("data-side")).toBe(
        "bottom",
      )
    })
  })

  it("unpublished → Download disabled with tooltip after menu fetch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(unpublished))
    act(() => {
      root.render(
        <CampaignRowActions
          layout="stacked"
          mbaNumber="krusty001"
          versionNumber={1}
          clientSlug="krusty"
          canEdit
        />,
      )
    })
    const download = findButton(container, "Download")
    expect(download).toBeTruthy()
    expect(download?.disabled).toBe(false)

    await openMenu(download!)
    await vi.waitFor(() => {
      const disabledDownload = findButton(container, "Download")
      expect(disabledDownload?.disabled).toBe(true)
      expect(disabledDownload?.getAttribute("title")).toBe("No published version")
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("hasPublishedVersion false → Download disabled, fetch never called", async () => {
    fetchMock.mockResolvedValue(jsonResponse(unpublished))
    act(() => {
      root.render(
        <CampaignRowActions
          layout="stacked"
          mbaNumber="krusty001"
          versionNumber={1}
          clientSlug="krusty"
          canEdit
          hasPublishedVersion={false}
        />,
      )
    })
    const download = findButton(container, "Download")
    expect(download).toBeTruthy()
    expect(download?.disabled).toBe(true)
    expect(download?.getAttribute("title")).toBe("No published version")

    await openMenu(download!)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain("Loading…")
  })

  it("two of three files → third row disabled with reason", async () => {
    fetchMock.mockResolvedValue(jsonResponse(twoOfThree))
    act(() => {
      root.render(
        <CampaignRowActions
          layout="stacked"
          mbaNumber="glenda008"
          versionNumber={6}
          clientSlug="glendale"
          canEdit
        />,
      )
    })
    await openMenu(findButton(container, "Download")!)
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
          layout="stacked"
          mbaNumber="glenda008"
          versionNumber={6}
          clientSlug="glendale"
          canEdit
        />,
      )
    })
    expect(fetchMock).not.toHaveBeenCalled()
    const download = findButton(container, "Download")
    await openMenu(download!)
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/api/mediaplans/mba/glenda008/documents",
    )

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    await openMenu(download!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
