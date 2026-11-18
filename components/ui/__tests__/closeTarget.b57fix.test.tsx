/**
 * B57fix (review R3): the X in every shared Dialog and Sheet is a 24 by 24 CSS
 * px target (WCAG 2.2 AA). jsdom has no layout, so this reads the classes. The
 * size is in px because `html` is 80%, where `h-6` is only 19.2 px.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

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

function closeButton(): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].filter((el) => el.textContent === "Close")
  expect(found).toHaveLength(1)
  return found[0] as HTMLButtonElement
}

function expectTarget(button: HTMLButtonElement) {
  expect(button.classList).toContain("h-[24px]")
  expect(button.classList).toContain("w-[24px]")
  expect(button.classList).toContain("items-center")
  expect(button.classList).toContain("justify-center")
}

describe("shared window X (B57fix)", () => {
  it("Dialog: the X is a 24 px target", () => {
    act(() =>
      root.render(
        <Dialog open>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Window</DialogTitle>
          </DialogContent>
        </Dialog>,
      ),
    )
    expectTarget(closeButton())
  })

  it("Sheet: the X is a 24 px target", () => {
    act(() =>
      root.render(
        <Sheet open>
          <SheetContent aria-describedby={undefined}>
            <SheetTitle>Panel</SheetTitle>
          </SheetContent>
        </Sheet>,
      ),
    )
    expectTarget(closeButton())
  })
})
