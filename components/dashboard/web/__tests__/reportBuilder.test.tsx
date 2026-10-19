/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { keyboardMove } from "@/components/dashboard/web/builder/BuilderCanvas"
import { ReportBuilder } from "@/components/dashboard/web/ReportBuilder"
import type { WebReportLayoutItem } from "@/lib/webReport/elements"

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}))

const LAYOUT: WebReportLayoutItem[] = [
  { elementId: "srcmed", settings: { topN: 10, columns: ["sessions"], showChange: true, shade: true } },
  { elementId: "notes", settings: { text: "Hello" } },
]

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((node) => node.textContent?.trim() === text)
  if (!found) throw new Error(`No button "${text}"`)
  return found as HTMLButtonElement
}

describe("ReportBuilder", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <ReportBuilder
          slug="paul-hartmann-pty-ltd"
          clientName="Paul Hartmann Pty Ltd"
          migrationApplied
          initialLayout={LAYOUT}
          currentVersion={0}
          versions={[]}
          ga4PropertyRef="372647707"
          gscSiteRef="https://www.molicare.au/"
          brandTerms={[]}
          defaultPeriod="last_month"
          keyEventNames={[]}
        />,
      )
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it("shows linked accounts read only, with no account selects", () => {
    expect(container.textContent).toContain("372647707")
    expect(container.textContent).toContain("https://www.molicare.au/")
    const link = [...container.querySelectorAll("a")].find((node) => node.textContent === "Edit accounts")
    expect(link?.getAttribute("href")).toBe("/client/paul-hartmann-pty-ltd#platform-accounts")
    expect(container.textContent).not.toContain("Google Analytics 4 property")
  })

  it("selecting an element shows only its allowed displays and widths", () => {
    const settings = container.querySelector('[aria-label="Element settings"]') as HTMLElement
    expect(settings.textContent).toContain("Source / medium")
    for (const label of ["Table", "Bar", "Donut", "Treemap", "Waterfall"]) {
      expect(button(settings, label)).toBeTruthy()
    }
    expect(settings.textContent).not.toContain("Bubble")
    expect(button(settings, "Half").getAttribute("aria-pressed")).toBe("true")

    act(() => button(settings, "Donut").click())
    expect(button(settings, "Donut").getAttribute("aria-pressed")).toBe("true")
    expect(settings.textContent).toContain("Donut shows share of sessions")

    act(() => button(settings, "Third").click())
    const item = container.querySelector('[data-element-key="el-0"]') as HTMLElement
    expect(item.className).toContain("md:col-span-4")

    const notesHeader = [...container.querySelectorAll('[aria-label="Report"] button[aria-pressed]')].find((node) =>
      node.textContent?.includes("Notes"),
    ) as HTMLButtonElement
    act(() => notesHeader.click())
    const after = container.querySelector('[aria-label="Element settings"]') as HTMLElement
    expect(after.textContent).toContain("Notes")
    expect(button(after, "Text").getAttribute("aria-pressed")).toBe("true")
  })

  it("View as client hides the library, settings and outlines", () => {
    expect(container.querySelector('[aria-label="Element library"]')).not.toBeNull()
    act(() => button(container, "View as client").click())
    expect(container.querySelector('[aria-label="Element library"]')).toBeNull()
    expect(container.querySelector('[aria-label="Element settings"]')).toBeNull()
    expect(container.querySelector(".outline-primary")).toBeNull()
    act(() => button(container, "Back to editing").click())
    expect(container.querySelector('[aria-label="Element library"]')).not.toBeNull()
  })

  it("the library marks elements on the report with one Add again action", () => {
    const library = () => container.querySelector('[aria-label="Element library"]') as HTMLElement
    const row = (label: string) =>
      [...library().querySelectorAll("li")].find((node) => node.querySelector(`[aria-label="${label}"]`)) as HTMLElement
    expect(button(library(), "Add again")).toBeTruthy()
    expect([...library().querySelectorAll("button")].some((node) => node.textContent?.trim() === "Remove")).toBe(false)
    const notes = row("Add Notes again")
    expect(notes.textContent).toContain("On report")
    expect(notes.textContent).not.toContain("On report x")
    act(() => (notes.querySelector('[aria-label="Add Notes again"]') as HTMLButtonElement).click())
    expect(row("Add Notes again").textContent).toContain("On report x2")
  })

  it("Move down and Remove change the order and keep a selection", () => {
    const settings = () => container.querySelector('[aria-label="Element settings"]') as HTMLElement
    act(() => button(settings(), "Move down").click())
    const order = [...container.querySelectorAll("[data-element-key]")].map((node) => node.getAttribute("data-element-key"))
    expect(order).toEqual(["el-1", "el-0"])
    act(() => button(settings(), "Remove").click())
    expect(container.querySelectorAll("[data-element-key]").length).toBe(1)
    expect(settings().textContent).toContain("Notes")
  })
})

describe("ReportBuilder without platform accounts", () => {
  it("shows both accounts as Not linked", () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        <ReportBuilder
          slug="golf-australia"
          clientName="Golf Australia"
          migrationApplied
          initialLayout={LAYOUT}
          currentVersion={0}
          versions={[]}
          ga4PropertyRef={null}
          gscSiteRef={null}
          brandTerms={[]}
          defaultPeriod="last_month"
          keyEventNames={[]}
        />,
      )
    })
    expect(host.textContent).toContain("Google Analytics 4 Not linked")
    expect(host.textContent).toContain("Search Console Not linked")
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })
})

describe("keyboardMove", () => {
  it("maps Alt+Up and Alt+Down only", () => {
    expect(keyboardMove({ altKey: true, key: "ArrowUp" })).toBe(-1)
    expect(keyboardMove({ altKey: true, key: "ArrowDown" })).toBe(1)
    expect(keyboardMove({ altKey: false, key: "ArrowUp" })).toBeNull()
    expect(keyboardMove({ altKey: true, key: "Enter" })).toBeNull()
  })
})
