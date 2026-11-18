/**
 * B58: one announcer. Each `announce()` puts one message in one region, the
 * same words said again are read again, a second Announcer adds no regions,
 * and the regions stay readable while a modal window hides the page.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Announcer, announce } from "@/components/ui/announcer"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function regions(kind: "polite" | "assertive"): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>(`[data-announcer="${kind}"]`)]
}

function region(kind: "polite" | "assertive"): HTMLElement {
  const found = regions(kind)
  expect(found).toHaveLength(1)
  return found[0]
}

describe("announce", () => {
  it("puts one message in the polite region and nothing in the assertive one", () => {
    act(() => root.render(<Announcer />))
    act(() => announce("3 results"))
    expect(region("polite").children).toHaveLength(1)
    expect(region("polite").textContent).toBe("3 results")
    expect(region("assertive").textContent).toBe("")
    expect(region("polite").getAttribute("aria-live")).toBe("polite")
  })

  it("puts an error in the assertive region only", () => {
    act(() => root.render(<Announcer />))
    act(() => announce("2 fields need fixing", "assertive"))
    expect(region("assertive").textContent).toBe("2 fields need fixing")
    expect(region("assertive").getAttribute("aria-live")).toBe("assertive")
    expect(region("polite").textContent).not.toContain("2 fields need fixing")
  })

  it("reads the same words again as a new message, never two at once", () => {
    act(() => root.render(<Announcer />))
    act(() => announce("Saved draft"))
    const first = region("polite").firstElementChild
    act(() => announce("Saved draft"))
    const second = region("polite").firstElementChild
    expect(region("polite").children).toHaveLength(1)
    expect(second?.textContent).toBe("Saved draft")
    expect(second).not.toBe(first)
  })

  it("says nothing for blank text", () => {
    act(() => root.render(<Announcer />))
    act(() => announce("Before", "assertive"))
    const before = region("assertive").firstElementChild
    act(() => announce("   ", "assertive"))
    expect(region("assertive").firstElementChild).toBe(before)
  })

  it("a second Announcer adds no regions, so a message is read once", () => {
    act(() =>
      root.render(
        <>
          <Announcer />
          <Announcer />
        </>,
      ),
    )
    act(() => announce("Once"))
    expect(regions("polite")).toHaveLength(1)
    expect(regions("assertive")).toHaveLength(1)
    expect(document.body.textContent?.split("Once")).toHaveLength(2)
  })

  it("stays readable while a modal window hides the page", () => {
    // The root Announcer is mounted before any window opens, as in ClientLayout.
    act(() => root.render(<Announcer />))
    act(() =>
      root.render(
        <>
          <Announcer />
          <Dialog open>
            <DialogContent>
              <DialogTitle>Add site</DialogTitle>
            </DialogContent>
          </Dialog>
        </>,
      ),
    )
    act(() => announce("Site name is required", "assertive"))
    const assertive = region("assertive")
    expect(document.body.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(assertive.closest('[aria-hidden="true"]')).toBeNull()
    expect(region("polite").closest('[aria-hidden="true"]')).toBeNull()
  })
})
