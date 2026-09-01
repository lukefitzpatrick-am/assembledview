/**
 * T0-10 / T0-4 — Periods hydrates finance scope from ?fy= on mount.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildDefaultFinanceScope } from "@/lib/finance/sections/defaultScope"
import { useFinanceScopeStore } from "@/lib/finance/sections/useFinanceScope"

const { searchParams } = vi.hoisted(() => ({
  searchParams: new URLSearchParams("fy=2024"),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/finance/periods",
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={typeof href === "string" ? href : "#"}>{children}</a>,
}))

vi.mock("@/components/finance/sections/periods/usePeriodsData", () => ({
  usePeriodsData: () => ({
    data: null,
    loading: true,
    error: null,
    busy: false,
    reload: vi.fn(),
    postReview: vi.fn(),
    runPeriod: vi.fn(),
    lockPeriod: vi.fn(),
  }),
}))

import { PeriodsPageClient } from "../PeriodsPageClient"

describe("PeriodsPageClient URL scope hydrate", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    const defaults = buildDefaultFinanceScope(new Date(2026, 8, 1))
    useFinanceScopeStore.setState({
      applied: defaults,
      draft: defaults,
      scopeVersion: 0,
    })
    expect(useFinanceScopeStore.getState().applied.fy).not.toBe(2024)
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

  it("mount with ?fy=2024 applies FY 2024 and the notice renders FY2024", async () => {
    await act(async () => {
      root.render(<PeriodsPageClient />)
    })

    expect(useFinanceScopeStore.getState().applied.fy).toBe(2024)
    expect(container.textContent).toContain("FY2024")
  })
})
