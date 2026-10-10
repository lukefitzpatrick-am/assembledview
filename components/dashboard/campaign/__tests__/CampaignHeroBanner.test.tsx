/**
 * BR-6 — Edit plan and More sit on the ink band. Outline's bg-background
 * must not win over the transparent on-ink fill.
 *
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children?: ReactNode
  } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({ isAdmin: false }),
}))

import CampaignHeroBanner from "@/components/dashboard/campaign/CampaignHeroBanner"

describe("CampaignHeroBanner secondary actions", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    host?.remove()
    root = null
    host = null
  })

  function render(node: ReactNode) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root?.render(node)
    })
    return host
  }

  it("keeps Edit plan and More transparent on the ink band", () => {
    const view = render(
      <CampaignHeroBanner
        campaign={{
          campaignName: "Bic",
          clientName: "Bic",
          mbaNumber: "BICAU002",
          status: "In Progress",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          budget: 1000,
        }}
        daysRemaining={10}
        onOpenDetails={() => undefined}
        onDownload={() => undefined}
        canEdit
      />,
    )

    const edit = [...view.querySelectorAll("a")].find((el) => el.textContent?.trim() === "Edit plan")
    const more = [...view.querySelectorAll("button")].find((el) => el.textContent?.trim() === "More")

    expect(edit).toBeTruthy()
    expect(more).toBeTruthy()
    for (const button of [edit, more]) {
      expect(button?.className).not.toContain("bg-background")
      expect(button?.className).toContain("bg-transparent")
      expect(button?.className).toContain("border-am-forest-light")
      expect(button?.className).toContain("text-am-white")
      expect(button?.className).toContain("hover:bg-am-panel")
    }
  })
})
