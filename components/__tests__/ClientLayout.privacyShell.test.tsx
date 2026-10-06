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
})
