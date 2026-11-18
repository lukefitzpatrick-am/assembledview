/**
 * B57: a dialog opened from state (no Radix Trigger) puts focus back on the
 * control that opened it, for Dialog, AlertDialog and Sheet. Escape closes it
 * and Tab stays inside while it is open.
 *
 * @vitest-environment jsdom
 */
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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

/** Radix returns focus in a timeout after the content unmounts. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find((el) => el.textContent?.trim() === label)
  expect(found, label).toBeTruthy()
  return found as HTMLButtonElement
}

function pressEscape() {
  const target = document.activeElement ?? document.body
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  })
}

async function openFrom(label: string) {
  const opener = button(label)
  opener.focus()
  act(() => opener.click())
  await settle()
  return opener
}

function StateDialog({ kind }: { kind: "dialog" | "alert" | "sheet" }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Elsewhere</button>
      {kind === "dialog" ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Plain</DialogTitle>
            <button type="button">Inside</button>
          </DialogContent>
        </Dialog>
      ) : null}
      {kind === "alert" ? (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent aria-describedby={undefined}>
            <AlertDialogTitle>Sure?</AlertDialogTitle>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Yes</AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {kind === "sheet" ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent aria-describedby={undefined}>
            <SheetTitle>Side</SheetTitle>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  )
}

describe("shared dialogs return focus to the opener (B57)", () => {
  it.each(["dialog", "alert", "sheet"] as const)("%s opened from state: Escape closes it and focus returns", async (kind) => {
    act(() => root.render(<StateDialog kind={kind} />))
    const opener = await openFrom("Open")
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeTruthy()
    expect(document.activeElement).not.toBe(opener)

    pressEscape()
    await settle()
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it("an action button closes the alert and focus returns", async () => {
    act(() => root.render(<StateDialog kind="alert" />))
    const opener = await openFrom("Open")
    act(() => button("Yes").click())
    await settle()
    expect(document.activeElement).toBe(opener)
  })

  it("Tab stays inside while open", async () => {
    act(() => root.render(<StateDialog kind="alert" />))
    await openFrom("Open")
    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement
    // Radix moves focus back in when it lands outside (its focus trap listens for focusin).
    act(() => button("Elsewhere").focus())
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it("a dialog unmounted by its parent still returns focus", async () => {
    function Conditional() {
      const [shown, setShown] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setShown(true)}>
            Open
          </button>
          {shown ? (
            <Dialog open onOpenChange={(next) => (next ? undefined : setShown(false))}>
              <DialogContent aria-describedby={undefined}>
                <DialogTitle>Mounted while shown</DialogTitle>
              </DialogContent>
            </Dialog>
          ) : null}
        </>
      )
    }
    act(() => root.render(<Conditional />))
    const opener = await openFrom("Open")
    pressEscape()
    await settle()
    expect(document.activeElement).toBe(opener)
  })

  it("keeps the first opener when the page re-renders while the dialog is open", async () => {
    function Rerender() {
      const [open, setOpen] = useState(false)
      const [count, setCount] = useState(0)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>Counter {count}</DialogTitle>
              <button type="button" onClick={() => setCount((n) => n + 1)}>
                Add one
              </button>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    act(() => root.render(<Rerender />))
    const opener = await openFrom("Open")
    const inside = button("Add one")
    inside.focus()
    act(() => inside.click())
    expect(document.body.textContent).toContain("Counter 1")
    pressEscape()
    await settle()
    expect(document.activeElement).toBe(opener)
  })

  it("a caller's own onCloseAutoFocus wins", async () => {
    function Own() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <button type="button" id="target">
            Target
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                document.getElementById("target")?.focus()
              }}
            >
              <DialogTitle>Own</DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    act(() => root.render(<Own />))
    await openFrom("Open")
    pressEscape()
    await settle()
    expect(document.activeElement).toBe(button("Target"))
  })

  it("a Trigger still gets focus back", async () => {
    act(() =>
      root.render(
        <Dialog>
          <DialogTrigger>Trigger</DialogTrigger>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>With trigger</DialogTitle>
          </DialogContent>
        </Dialog>,
      ),
    )
    const trigger = await openFrom("Trigger")
    pressEscape()
    await settle()
    expect(document.activeElement).toBe(trigger)
  })
})
