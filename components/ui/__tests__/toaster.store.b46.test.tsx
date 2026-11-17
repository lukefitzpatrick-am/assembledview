/**
 * B46: one toast store. The mounted Toaster and every caller share
 * `@/components/ui/use-toast`, so a toast sent from a caller shows.
 *
 * @vitest-environment jsdom
 */
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Toaster } from "@/components/ui/toaster"
import { toast, useToast } from "@/components/ui/use-toast"

// A typical caller: a component that takes `toast` from the hook.
function SaveButtonLike({ title, variant }: { title: string; variant?: "destructive" }) {
  const { toast: send } = useToast()
  useEffect(() => {
    handles.push(send({ title, variant }))
  }, [send, title, variant])
  return null
}

let handles: Array<{ dismiss: () => void }> = []
let container: HTMLDivElement
let root: Root

const shown = () => document.body.textContent ?? ""

beforeEach(() => {
  vi.useFakeTimers()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    handles.forEach((h) => h.dismiss())
    vi.advanceTimersByTime(5_000)
  })
  handles = []
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe("Toaster with the one toast store", () => {
  it("shows a toast sent from a caller component", () => {
    act(() => {
      root.render(
        <>
          <Toaster />
          <SaveButtonLike title="Client name is required" variant="destructive" />
        </>
      )
    })
    expect(shown()).toContain("Client name is required")
  })

  it("auto-closes a default toast and keeps an error until dismissed", () => {
    act(() => {
      root.render(<Toaster />)
    })
    act(() => {
      handles.push(toast({ title: "Saved draft" }))
      handles.push(toast({ title: "Save failed", variant: "destructive" }))
    })
    expect(shown()).toContain("Saved draft")
    expect(shown()).toContain("Save failed")

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(shown()).not.toContain("Saved draft")
    expect(shown()).toContain("Save failed")

    act(() => {
      handles[1].dismiss()
      vi.advanceTimersByTime(2_000)
    })
    expect(shown()).not.toContain("Save failed")
  })

  it("keeps an error open for 10 minutes until the user clicks its close X (B46fix R5)", () => {
    act(() => {
      root.render(<Toaster />)
    })
    act(() => {
      handles.push(toast({ title: "Save failed", variant: "destructive" }))
    })
    act(() => {
      vi.advanceTimersByTime(10 * 60_000)
    })
    expect(shown()).toContain("Save failed")

    const close = document.querySelector<HTMLButtonElement>("button[toast-close]")
    expect(close).not.toBeNull()
    act(() => {
      close!.click()
    })
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(shown()).not.toContain("Save failed")
  })

  it("drops the oldest error when every toast is an open error (B46fix R1)", () => {
    act(() => {
      root.render(<Toaster />)
    })
    act(() => {
      for (const title of ["Error 1", "Error 2", "Error 3", "Error 4"]) {
        handles.push(toast({ title, variant: "destructive" }))
      }
    })
    expect(document.querySelectorAll("li")).toHaveLength(3)
    expect(shown()).toContain("Error 4")
    expect(shown()).not.toContain("Error 1")
  })

  it("shows at most 3 toasts, the newest ones (B46fix R5)", () => {
    act(() => {
      root.render(<Toaster />)
    })
    act(() => {
      for (const title of ["Copied 1", "Copied 2", "Copied 3", "Copied 4", "Copied 5"]) {
        handles.push(toast({ title }))
      }
    })
    expect(document.querySelectorAll("li")).toHaveLength(3)
    expect(shown()).toContain("Copied 5")
    expect(shown()).toContain("Copied 3")
    expect(shown()).not.toContain("Copied 2")
  })

  it("does not let the next toasts replace an open error", () => {
    act(() => {
      root.render(<Toaster />)
    })
    act(() => {
      handles.push(toast({ title: "Burst dates missing", variant: "destructive" }))
    })
    act(() => {
      handles.push(toast({ title: "Copied" }))
      handles.push(toast({ title: "Downloaded" }))
    })
    expect(shown()).toContain("Burst dates missing")
    expect(shown()).toContain("Copied")
    expect(shown()).toContain("Downloaded")
  })

  it("keeps an open error through the plan-save toasts that follow it (B46fix R1)", () => {
    act(() => {
      root.render(<Toaster />)
    })
    // The order the create and edit save handlers send after a publish.
    act(() => {
      handles.push(toast({ variant: "destructive", title: "Plan saved without documents", description: "Document generation failed" }))
      handles.push(toast({ title: "Check the rate", description: "Line 1 has a budget and no deliverables." }))
      handles.push(toast({ title: "Check the rate", description: "Line 2 has a budget and no deliverables." }))
      handles.push(toast({ title: "Removed 2 empty lines with no buy type, budget, or rate." }))
      handles.push(toast({ title: "Success", description: "Saved as version 3" }))
    })
    expect(shown()).toContain("Plan saved without documents")
    expect(shown()).toContain("Success")
    expect(document.querySelectorAll("li")).toHaveLength(3)
  })

  it("shows a repeat of a toast once, and again after it closes (B46fix R3)", () => {
    act(() => {
      root.render(<Toaster />)
    })
    // One publishers outage: every channel container sends the same error.
    act(() => {
      for (let i = 0; i < 13; i++) {
        handles.push(toast({ variant: "destructive", title: "Error loading publishers", description: "Failed to fetch" }))
      }
    })
    expect(document.querySelectorAll("li")).toHaveLength(1)

    act(() => {
      handles.push(toast({ variant: "destructive", title: "Error loading publishers", description: "Timed out" }))
      handles.push(toast({ title: "Error loading publishers", description: "Failed to fetch" }))
    })
    expect(document.querySelectorAll("li")).toHaveLength(3)

    // A repeat sent while the toast is closing shows as a new toast.
    act(() => {
      handles[12].dismiss()
      handles.push(toast({ variant: "destructive", title: "Error loading publishers", description: "Failed to fetch" }))
    })
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(document.querySelectorAll("li")).toHaveLength(3)
  })

  it("restarts the close timer of an open toast when it repeats (WAVE0fix R6)", () => {
    act(() => {
      root.render(<Toaster />)
    })
    act(() => {
      handles.push(toast({ title: "Task created" }))
    })
    act(() => {
      vi.advanceTimersByTime(4_000)
    })
    act(() => {
      handles.push(toast({ title: "Task created" }))
    })
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    // 6 s after the first and 2 s after the repeat: still open, shown once.
    expect(document.querySelectorAll("li")).toHaveLength(1)
    expect(shown()).toContain("Task created")
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(shown()).not.toContain("Task created")
  })

  it("announces a repeated error to screen readers again (WAVE0fix R6)", () => {
    const announced = () => [...document.querySelectorAll('[role="status"]')].map((n) => n.textContent).join(" ")
    act(() => {
      root.render(<Toaster />)
    })
    act(() => {
      handles.push(toast({ variant: "destructive", title: "Save failed", description: "Network error" }))
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(announced()).toContain("Save failed")
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(announced()).not.toContain("Save failed")
    act(() => {
      handles.push(toast({ variant: "destructive", title: "Save failed", description: "Network error" }))
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(announced()).toContain("Save failed")
    expect(document.querySelectorAll("li")).toHaveLength(1)
  })

  it("frees the slot of a closed toast, so an open error outlasts many later toasts", () => {
    act(() => {
      root.render(<Toaster />)
    })
    act(() => {
      handles.push(toast({ title: "KPIs not saved", variant: "destructive" }))
    })
    for (const title of ["Copied 1", "Copied 2", "Copied 3", "Copied 4"]) {
      act(() => {
        handles.push(toast({ title }))
      })
      act(() => {
        vi.advanceTimersByTime(10_000)
      })
    }
    expect(shown()).toContain("KPIs not saved")
  })
})
