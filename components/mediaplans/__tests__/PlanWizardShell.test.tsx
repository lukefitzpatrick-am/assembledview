/**
 * SM-20 — wizard collapses the app sidebar only while mounted.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const sidebarState = vi.hoisted(() => ({
  open: true,
  isMobile: false,
  setOpen: vi.fn(),
}))

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({
    open: sidebarState.open,
    setOpen: sidebarState.setOpen,
    isMobile: sidebarState.isMobile,
  }),
}))

import { PlanWizardShell } from "@/components/mediaplans/PlanWizardShell"

const SHELL_PROPS = {
  header: <div>header</div>,
  steps: [{ id: "s1", label: "One", sub: "1" }],
  summary: {
    title: "T",
    client: "C",
    budget: "$0",
    channels: 0,
    status: "Draft",
    budgetRemaining: "$0",
  },
  onExit: () => undefined,
  bottomBar: <div>bar</div>,
  children: <div>body</div>,
}

describe("PlanWizardShell sidebar collapse", () => {
  let container: HTMLDivElement
  let root: Root
  let mounted = false

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    sidebarState.open = true
    sidebarState.isMobile = false
    sidebarState.setOpen.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    mounted = true
  })

  afterEach(() => {
    if (mounted) {
      act(() => {
        root.unmount()
      })
      mounted = false
    }
    container.remove()
  })

  it("mount with open=true calls setOpen(false); unmount restores true", () => {
    act(() => {
      root.render(<PlanWizardShell {...SHELL_PROPS} />)
    })
    expect(sidebarState.setOpen).toHaveBeenCalledWith(false, { persist: false })

    sidebarState.setOpen.mockClear()
    act(() => {
      root.unmount()
    })
    mounted = false
    expect(sidebarState.setOpen).toHaveBeenCalledTimes(1)
    expect(sidebarState.setOpen).toHaveBeenCalledWith(true)
  })

  it("mount with open=false leaves false on unmount", () => {
    sidebarState.open = false
    act(() => {
      root.render(<PlanWizardShell {...SHELL_PROPS} />)
    })
    expect(sidebarState.setOpen).toHaveBeenCalledWith(false, { persist: false })

    sidebarState.setOpen.mockClear()
    act(() => {
      root.unmount()
    })
    mounted = false
    expect(sidebarState.setOpen).toHaveBeenCalledTimes(1)
    expect(sidebarState.setOpen).toHaveBeenCalledWith(false)
  })
})
