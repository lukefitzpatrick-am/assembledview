/**
 * SM-25 — compact card footer Open must not fire the overlay Link.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children?: React.ReactNode
  } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("framer-motion", () => ({
  motion: {
    article: ({
      children,
      ...props
    }: {
      children?: React.ReactNode
    } & Record<string, unknown>) => {
      const {
        layout: _layout,
        initial: _initial,
        animate: _animate,
        transition: _transition,
        ...dom
      } = props
      return <article {...dom}>{children}</article>
    },
    div: ({
      children,
      ...props
    }: {
      children?: React.ReactNode
    } & Record<string, unknown>) => {
      const { initial: _initial, animate: _animate, transition: _transition, ...dom } = props
      return <div {...dom}>{children}</div>
    },
  },
  useReducedMotion: () => true,
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import { CampaignCardCompact } from "@/components/dashboard/CampaignCardCompact"

function pointerCaptureShim() {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
  }
}

describe("CampaignCardCompact overlay", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    pointerCaptureShim()
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

  it("clicking Open in the footer does not navigate via the overlay Link", async () => {
    act(() => {
      root.render(
        <CampaignCardCompact
          id="1"
          name="Glendale"
          mbaNumber="glenda008"
          status="live"
          mediaTypes={["Social"]}
          spentAmount={100}
          totalBudget={1000}
          href="/dashboard/glendale/glenda008"
          versionNumber={7}
          clientSlug="glendale"
          canEdit
        />,
      )
    })

    const overlay = container.querySelector("a[aria-label='Open campaign Glendale']")
    expect(overlay).toBeTruthy()
    const overlayClick = vi.fn()
    overlay!.addEventListener("click", overlayClick)

    const article = container.querySelector("article")
    const footer = [...(article?.querySelectorAll("div") ?? [])].find((el) =>
      el.className.includes("border-t") && el.textContent?.includes("Open"),
    )
    expect(footer).toBeTruthy()
    const open = [...footer!.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Open"),
    )
    expect(open).toBeTruthy()

    await act(async () => {
      open!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      open!.click()
    })
    expect(overlayClick).not.toHaveBeenCalled()
  })
})
