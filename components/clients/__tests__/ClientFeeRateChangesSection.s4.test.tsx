/**
 * S4: the client page Fee rate changes panel. Renders the real component
 * with fetch mocked: lists changes and marks the one in force today, every
 * control has a label, Add posts the typed change, bad input is refused in
 * the browser with an announced error, Delete names its change, asks first,
 * removes it and focuses the heading, a failed delete errs on its row, a past
 * date warns, a saved change whose re-read failed says so, and no button
 * submits a surrounding form.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ClientFeeRateChangesSection } from "@/components/clients/ClientFeeRateChangesSection"

const CHANGES = [
  { id: 1, field: "feesearch", ratePct: 12, effectiveFrom: "2020-01-01" },
  { id: 2, field: "feesearch", ratePct: 14, effectiveFrom: "2099-01-01" },
]

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!

function type(input: HTMLInputElement, value: string) {
  act(() => {
    setValue.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe("ClientFeeRateChangesSection (S4)", () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>
  let submitted = 0

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ changes: [...CHANGES, { id: 3, field: "feesearch", ratePct: 9.5, effectiveFrom: "2027-03-01" }] }), { status: 201 })
      }
      if (init?.method === "DELETE") return new Response(JSON.stringify({ changes: [CHANGES[1]] }), { status: 200 })
      return new Response(JSON.stringify({ changes: CHANGES }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)
    submitted = 0
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <form onSubmit={(e) => { e.preventDefault(); submitted++ }}>
          <ClientFeeRateChangesSection clientId={58} channelFeesOn={false} />
        </form>,
      )
    })
    await flush()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  const input = (label: string) => {
    const l = [...container.querySelectorAll("label")].find((x) => x.textContent?.trim() === label)
    expect(l, label).toBeTruthy()
    const el = document.getElementById(l!.htmlFor)
    expect(el, `${label} control`).toBeTruthy()
    return el!
  }
  const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!

  it("lists each change and marks only the one in force today", () => {
    expect(fetchMock.mock.calls[0][0]).toBe("/api/clients/58/fee-rates")
    const items = [...container.querySelectorAll("li")].map((li) => li.textContent ?? "")
    expect(items).toHaveLength(2)
    expect(items[0]).toContain("Search")
    expect(items[0]).toContain("12%")
    expect(items[0]).toContain("in force today")
    expect(items[1]).not.toContain("in force today")
  })

  it("every control has a label; every button is type=button, so nothing submits the client form", () => {
    expect(input("Fee").getAttribute("role")).toBe("combobox")
    expect((input("Rate (%)") as HTMLInputElement).type).toBe("number")
    expect((input("Effective from") as HTMLInputElement).type).toBe("date")
    for (const b of container.querySelectorAll("button")) {
      if (b.getAttribute("role") !== "combobox") expect(b.getAttribute("type")).toBe("button")
    }
    act(() => button("Add rate change").click())
    expect(submitted).toBe(0)
  })

  it("Add posts the typed change and shows the new list", async () => {
    type(input("Rate (%)") as HTMLInputElement, "9.5")
    type(input("Effective from") as HTMLInputElement, "2027-03-01")
    await act(async () => button("Add rate change").click())
    await flush()
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")!
    expect(post[0]).toBe("/api/clients/58/fee-rates")
    expect(JSON.parse(String(post[1].body))).toEqual({ field: "feesocial", ratePct: 9.5, effectiveFrom: "2027-03-01" })
    expect(container.querySelectorAll("li")).toHaveLength(3)
  })

  it("a rate over 100 or no date is refused in the browser, announced, and nothing is posted", async () => {
    type(input("Rate (%)") as HTMLInputElement, "101")
    type(input("Effective from") as HTMLInputElement, "2027-03-01")
    await act(async () => button("Add rate change").click())
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toMatch(/0 to 100/)
    expect(input("Rate (%)").getAttribute("aria-describedby")).toBe(alert!.id)
    type(input("Rate (%)") as HTMLInputElement, "10")
    type(input("Effective from") as HTMLInputElement, "")
    await act(async () => button("Add rate change").click())
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/date/)
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "POST")).toBe(false)
  })

  const dialogButton = (text: string) =>
    [...document.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined
  const firstDelete = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Delete")!

  it("Delete names its change, asks first, removes that id only, then focuses the list heading", async () => {
    const del = firstDelete()
    expect(del.getAttribute("aria-label")).toMatch(/^Delete Search 12% from /)
    await act(async () => del.click())
    await flush()
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false)
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toMatch(/Search 12% from/)
    await act(async () => dialogButton("Delete")!.click())
    await flush()
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === "DELETE")!
    expect(call[0]).toBe("/api/clients/58/fee-rates?changeId=1")
    expect(container.querySelectorAll("li")).toHaveLength(1)
    expect(document.activeElement?.tagName).toBe("H3")
    expect(document.activeElement?.textContent).toMatch(/Fee rate changes/)
  })

  it("Cancel on the question deletes nothing", async () => {
    await act(async () => firstDelete().click())
    await flush()
    await act(async () => dialogButton("Cancel")!.click())
    await flush()
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false)
    expect(container.querySelectorAll("li")).toHaveLength(2)
  })

  it("a failed delete shows its error on that row only, tied to its button", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Response(JSON.stringify({ error: "Rate change not found" }), { status: 404 })
        : new Response(JSON.stringify({ changes: CHANGES }), { status: 200 }),
    )
    await act(async () => firstDelete().click())
    await flush()
    await act(async () => dialogButton("Delete")!.click())
    await flush()
    const rows = [...container.querySelectorAll("li")]
    const alert = rows[0].querySelector('[role="alert"]')
    expect(alert?.textContent).toBe("Rate change not found")
    expect(rows[1].querySelector('[role="alert"]')).toBeNull()
    expect(rows[0].querySelector("button")!.getAttribute("aria-describedby")).toBe(alert!.id)
    expect(container.querySelector("form > section > p[id][role=alert]")).toBeNull()
  })

  it("a date before today warns that running plans take it on their next save", () => {
    type(input("Effective from") as HTMLInputElement, "2027-03-01")
    expect(container.textContent).not.toMatch(/before today/)
    type(input("Effective from") as HTMLInputElement, "2020-06-01")
    const note = [...container.querySelectorAll("p")].find((p) => /before today/.test(p.textContent ?? ""))!
    expect(note.textContent).toMatch(/already running.*next time they are saved/)
    expect(input("Effective from").getAttribute("aria-describedby")).toBe(note.id)
  })

  it("a saved change whose list re-read failed says it saved and keeps the list", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ changes: null, message: "Saved. The list could not be reloaded: reload the page to see it." }), { status: 201 })
        : new Response(JSON.stringify({ changes: CHANGES }), { status: 200 }),
    )
    type(input("Rate (%)") as HTMLInputElement, "9.5")
    type(input("Effective from") as HTMLInputElement, "2027-03-01")
    await act(async () => button("Add rate change").click())
    await flush()
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/^Saved\./)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelectorAll("li")).toHaveLength(2)
  })
})
