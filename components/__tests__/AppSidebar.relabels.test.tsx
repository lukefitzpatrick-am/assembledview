/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({
  pathname: "/dashboard",
  isAdmin: true,
  isLoading: false,
  userRoles: ["admin"] as string[],
  clientSlugs: [] as string[],
}))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}))

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => <img alt={props.alt ?? ""} />,
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({
    clientSlugs: nav.clientSlugs,
    userRoles: nav.userRoles,
    isAdmin: nav.isAdmin,
    isLoading: nav.isLoading,
    isClient: nav.userRoles.includes("client"),
    user: { email: "staff@assembledmedia.com.au", name: "Staff User" },
    userRole: nav.isAdmin ? "admin" : "client",
    userClient: nav.clientSlugs[0] ?? null,
    error: null,
    login: () => undefined,
    logout: () => undefined,
  }),
}))

vi.mock("@/components/AuthWrapper", () => ({
  useUser: () => ({
    user: { email: "staff@assembledmedia.com.au", name: "Staff User" },
    isLoading: false,
    error: null,
    login: () => undefined,
    logout: () => undefined,
  }),
}))

vi.mock("@/lib/api/coalescedGetJson", () => ({
  coalescedGetJson: vi.fn(async () => ({ name: "BIC" })),
}))

import { AppSidebar } from "@/components/AppSidebar"
import { SidebarProvider } from "@/components/ui/sidebar"

function relabelLink(container: HTMLElement): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll("a")].find(
    (el) => el.getAttribute("href") === "/pacing/admin/relabels",
  )
}

describe("AppSidebar relabels entry", () => {
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
    nav.pathname = "/dashboard"
    nav.isAdmin = true
    nav.isLoading = false
    nav.userRoles = ["admin"]
    nav.clientSlugs = []
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
  })

  async function settle() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  function renderNav() {
    act(() => {
      root.render(
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>,
      )
    })
  }

  it("renders Relabels for a staff session after MyHours and lights prefix paths", async () => {
    nav.pathname = "/pacing/admin/relabels"
    renderNav()
    await settle()

    const link = relabelLink(container)
    expect(link).toBeTruthy()
    expect(link?.textContent).toContain("Relabels")
    expect(link?.getAttribute("data-active")).toBe("true")

    const hrefs = [...container.querySelectorAll("a")].map((el) => el.getAttribute("href"))
    const myHours = hrefs.indexOf("/admin/myhours-mapping")
    const relabels = hrefs.indexOf("/pacing/admin/relabels")
    const fireflies = hrefs.indexOf("/admin/fireflies-unattributed")
    expect(myHours).toBeGreaterThan(-1)
    expect(relabels).toBe(myHours + 1)
    expect(fireflies).toBe(relabels + 1)

    nav.pathname = "/pacing/admin/relabels/extra"
    renderNav()
    await settle()
    expect(relabelLink(container)?.getAttribute("data-active")).toBe("true")

    nav.pathname = "/pacing"
    renderNav()
    await settle()
    expect(relabelLink(container)?.getAttribute("data-active")).toBe("false")
  })

  it("omits Relabels for a client session", async () => {
    nav.pathname = "/dashboard/bic"
    nav.isAdmin = false
    nav.userRoles = ["client"]
    nav.clientSlugs = ["bic"]
    renderNav()
    await settle()
    expect(relabelLink(container)).toBeUndefined()
    expect(container.textContent).not.toContain("Relabels")
  })
})
