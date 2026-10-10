/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({
  pathname: "/privacy",
}))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: () => undefined }),
}))

vi.mock("@/components/AppSidebar", () => ({
  AppSidebar: () => <nav data-testid="app-sidebar">Sidebar</nav>,
}))

vi.mock("@/contexts/AuthContext", () => ({
  AuthContextProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuthContext: () => ({
    user: null,
    isLoading: false,
    isAdmin: false,
  }),
}))

import { ClientLayout } from "@/components/ClientLayout"
import { shellUserIdentity } from "@/components/UserMenu"

describe("shell user card identity", () => {
  it("uses the name, and the email local part when the name is an address", () => {
    expect(shellUserIdentity({ name: "Luke Fitzpatrick", email: "luke.fitzpatrick@assembledmedia.com.au" })).toEqual({
      name: "Luke Fitzpatrick",
      initials: "LF",
    })
    expect(shellUserIdentity({ name: "luke.fitzpatrick@assembledmedia.com.au", email: "luke.fitzpatrick@assembledmedia.com.au" })).toEqual({
      name: "Luke Fitzpatrick",
      initials: "LF",
    })
  })
})

describe("ClientLayout privacy shell", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
      }) as MediaQueryList
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

  it("hides the sidebar on /privacy", () => {
    nav.pathname = "/privacy"
    act(() => {
      root.render(
        <ClientLayout clientSlugs={[]}>
          <p>Policy</p>
        </ClientLayout>,
      )
    })
    expect(container.querySelector("[data-testid='app-sidebar']")).toBeNull()
    expect(container.textContent).toContain("Policy")
  })

  it("hides the sidebar on /data-deletion", () => {
    nav.pathname = "/data-deletion"
    act(() => {
      root.render(
        <ClientLayout clientSlugs={[]}>
          <p>Deletion</p>
        </ClientLayout>,
      )
    })
    expect(container.querySelector("[data-testid='app-sidebar']")).toBeNull()
    expect(container.textContent).toContain("Deletion")
  })

  it("shows the sidebar on an authenticated route", () => {
    nav.pathname = "/dashboard"
    act(() => {
      root.render(
        <ClientLayout clientSlugs={[]}>
          <p>Dashboard</p>
        </ClientLayout>,
      )
    })
    expect(container.querySelector("[data-testid='app-sidebar']")).not.toBeNull()
  })

  it("opens the command palette from the search pill", () => {
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = () => undefined
    }
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => undefined
    }
    if (typeof globalThis.ResizeObserver === "undefined") {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver
    }
    nav.pathname = "/dashboard"
    act(() => {
      root.render(
        <ClientLayout clientSlugs={[]}>
          <p>Dashboard</p>
        </ClientLayout>,
      )
    })
    const pill = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Search campaigns, clients and publishers"]',
    )
    expect(pill?.textContent).toContain("Search")
    expect(pill?.textContent).toContain("Ctrl K")
    expect(container.textContent).not.toContain("Hi ")
    expect(document.body.textContent).not.toContain("Command menu")
    act(() => {
      pill?.click()
    })
    expect(document.body.textContent).toContain("Command menu")
  })
})
