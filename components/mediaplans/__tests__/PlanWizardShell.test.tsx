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

describe("PlanWizardShell campaign tools rail", () => {
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

  const toolLinks = [
    {
      id: "creative",
      label: "Creative",
      href: "/mediaplans/mba/glenda008/creative",
    },
    {
      id: "trafficking",
      label: "Trafficking",
      href: "/mediaplans/mba/glenda008/trafficking",
    },
  ]

  it("renders two campaign-tool rows in order when toolLinks is set", () => {
    act(() => {
      root.render(<PlanWizardShell {...SHELL_PROPS} toolLinks={toolLinks} />)
    })
    const nav = container.querySelector('nav[aria-label="Campaign tools"]')
    expect(nav).not.toBeNull()
    const rows = nav!.querySelectorAll("button")
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain("Creative")
    expect(rows[1]?.textContent).toContain("Trafficking")
    expect(rows[0]?.getAttribute("aria-label")).toBe("Creative (opens page)")
    expect(rows[1]?.getAttribute("aria-label")).toBe("Trafficking (opens page)")
  })

  it("omits the Campaign tools card when toolLinks is absent or empty", () => {
    act(() => {
      root.render(<PlanWizardShell {...SHELL_PROPS} />)
    })
    expect(container.textContent).not.toContain("Campaign tools")

    act(() => {
      root.render(<PlanWizardShell {...SHELL_PROPS} toolLinks={[]} />)
    })
    expect(container.textContent).not.toContain("Campaign tools")
  })

  it("calls onNavigate with the href and does not render a Link", () => {
    const onNavigate = vi.fn()
    act(() => {
      root.render(
        <PlanWizardShell
          {...SHELL_PROPS}
          toolLinks={toolLinks}
          onNavigate={onNavigate}
        />
      )
    })
    const toolsNav = container.querySelector('nav[aria-label="Campaign tools"]')
    expect(toolsNav?.querySelector("a")).toBeNull()
    const creative = container.querySelector(
      'button[aria-label="Creative (opens page)"]'
    ) as HTMLButtonElement
    act(() => {
      creative.click()
    })
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith("/mediaplans/mba/glenda008/creative")
  })
})
