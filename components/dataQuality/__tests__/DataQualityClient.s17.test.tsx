/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Announcer } from "@/components/ui/announcer"
import { DataQualityClient } from "../DataQualityClient"

function item(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    ruleKey: "publish.no_publisher",
    mbaNumber: `MBA00${id}`,
    lineItemId: `mba00${id}-1`,
    clientId: 1,
    clientName: "Client One",
    message: `Line mba00${id}-1 has no publisher.`,
    fixLabel: "Open the plan",
    fixHref: `/mediaplans/mba/MBA00${id}/edit`,
    ownerEmail: "me@am.test",
    ownerName: "Me Person",
    firstSeenAt: "2026-11-23T00:00:00Z",
    lastSeenAt: "2026-11-24T00:00:00Z",
    ...over,
  }
}

const ITEMS = [
  item(1),
  item(2, { ownerEmail: "other@am.test", ownerName: "Other", firstSeenAt: "2026-11-01T00:00:00Z" }),
  item(3, { ownerEmail: null, ownerName: null, firstSeenAt: "2026-11-02T00:00:00Z", ruleKey: "relabel.drift", clientId: 2, clientName: "Client Two" }),
]

describe("DataQualityClient (S17)", () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-24T10:00:00Z"))
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? { ok: true, status: 200, json: async () => ({ ok: true }) }
        : { ok: true, status: 200, json: async () => ({ items: ITEMS }) },
    )
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  async function render(overview: boolean) {
    await act(async () => {
      root.render(
        <>
          <Announcer />
          <DataQualityClient viewerEmail="me@am.test" overviewByDefault={overview} />
        </>,
      )
    })
    await act(async () => {})
  }

  const plans = () => [...container.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent ?? "")
  const select = (id: string) => container.querySelector<HTMLSelectElement>(`#${id}`)!
  const change = async (el: HTMLSelectElement | HTMLInputElement, value: string | boolean) => {
    await act(async () => {
      if (typeof value === "boolean") el.click()
      else {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!
        setter.call(el, value)
        el.dispatchEvent(new Event("change", { bubbles: true }))
      }
    })
  }

  it("a planner opens on their own items (Mine); every control is labelled", async () => {
    await render(false)
    expect(select("dq-owner").value).toBe("me")
    expect(select("dq-owner").selectedOptions[0]!.textContent).toBe("Mine")
    expect(container.querySelector<HTMLInputElement>("#dq-overdue")!.checked).toBe(false)
    expect(plans()).toEqual(["MBA001Client One"])
    for (const id of ["dq-owner", "dq-rule", "dq-client", "dq-overdue"]) {
      expect(container.querySelector(`label[for="${id}"]`)?.textContent).toBeTruthy()
    }
    expect(container.querySelector("caption")?.textContent).toBe("1 of 3 open items")
  })

  it("the ops view opens on every owner's overdue items, unassigned included", async () => {
    await render(true)
    expect(select("dq-owner").value).toBe("")
    expect(plans()).toEqual(["MBA002Client One", "MBA003Client Two"])
    expect(container.textContent).toContain("Unassigned")
    expect(container.querySelectorAll("tbody tr")[0]!.textContent).toContain("23 daysOverdue")
  })

  it("overdue items come first, oldest first within each group", async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ items: [ITEMS[0], ITEMS[2], ITEMS[1]] }) }))
    await render(false)
    await change(select("dq-owner"), "")
    expect(plans()).toEqual(["MBA003Client Two", "MBA002Client One", "MBA001Client One"])
  })

  it("filters by owner, rule and client", async () => {
    await render(true)
    await change(container.querySelector<HTMLInputElement>("#dq-overdue")!, true)
    expect(plans()).toHaveLength(3)
    await change(select("dq-owner"), "none")
    expect(plans()).toEqual(["MBA003Client Two"])
    await change(select("dq-owner"), "")
    await change(select("dq-rule"), "publish.no_publisher")
    expect(plans()).toEqual(["MBA002Client One", "MBA001Client One"])
    await change(select("dq-client"), "2")
    expect(container.textContent).toContain("No open items match these filters.")
  })

  it("each item links to its fix", async () => {
    await render(false)
    const link = container.querySelector<HTMLAnchorElement>("tbody a")!
    expect(link.getAttribute("href")).toBe("/mediaplans/mba/MBA001/edit")
    expect(link.getAttribute("aria-label")).toBe("Open the plan: Line has no publisher on MBA001 line mba001-1")
  })

  const patches = () => fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH")
  const dialogButton = (name: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === name)!

  it("resolve asks first: Cancel sends nothing", async () => {
    await render(false)
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label^="Resolve"]')!.click())
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Resolve this item")
    expect(patches()).toHaveLength(0)
    await act(async () => dialogButton("Cancel").click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(patches()).toHaveLength(0)
    expect(plans()).toEqual(["MBA001Client One"])
  })

  it("resolve, once confirmed, sends the action, removes the row and says so", async () => {
    await render(false)
    const resolve = container.querySelector<HTMLButtonElement>('button[aria-label^="Resolve"]')!
    await act(async () => resolve.click())
    expect(patches()).toHaveLength(0)
    await act(async () => dialogButton("Resolve").click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/data-quality/1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "resolve" }) }),
    )
    expect(plans()).toEqual([])
    expect(document.querySelector('[data-announcer="polite"]')?.textContent).toBe(
      "Resolved: Line has no publisher on MBA001.",
    )
  })

  it("dismiss asks for a reason on the field before it sends", async () => {
    await render(false)
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label^="Dismiss"]')!.click())
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain("Dismiss this item")
    const form = dialog.querySelector("form")!
    await act(async () => form.requestSubmit())
    const reason = dialog.querySelector("textarea")!
    expect(reason.getAttribute("aria-invalid")).toBe("true")
    expect(document.getElementById(reason.getAttribute("aria-describedby")!)?.textContent).toBe("Say why this is not a problem")
    expect(document.activeElement).toBe(reason)
    expect(fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH")).toHaveLength(0)

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
      setter.call(reason, "Booked direct")
      reason.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => form.requestSubmit())
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/data-quality/1",
      expect.objectContaining({ body: JSON.stringify({ action: "dismiss", reason: "Booked direct" }) }),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(plans()).toEqual([])
  })

  it("a failed load offers a retry", async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    await render(false)
    expect(container.querySelector('[role="alert"]:not([data-announcer])')?.textContent).toContain("The queue could not be loaded.")
  })
})
