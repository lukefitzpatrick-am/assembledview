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
import { useToast } from "@/components/ui/use-toast"

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
})
