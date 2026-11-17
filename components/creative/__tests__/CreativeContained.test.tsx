/** @vitest-environment jsdom */
/**
 * B44 (C-200, switch codex_contained_writes): the creative admin landing.
 * Off: Create Codex task opens the task dialog on this page, as before.
 * On: New task in Tasks links to /tasks filled in from the client and
 * campaign; the dialog is not rendered and the roster is not read.
 */
import fs from "node:fs"
import path from "node:path"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const dialogRenders: Array<Record<string, unknown>> = []
const toasts: Array<{ title?: string; description?: string }> = []
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: (t: { title?: string; description?: string }) => toasts.push(t) }),
}))
vi.mock("@/components/tasks/TaskFormDialog", () => ({
  TaskFormDialog: (props: Record<string, unknown>) => {
    dialogRenders.push(props)
    return null
  },
}))

import { parseTasksComposeParams } from "@/lib/codex/composeLink"
import {
  CreativeAdminLanding,
  buildScreenshotTaskPrefill,
  screenshotTaskComposeHref,
} from "@/components/creative/CreativeAdminLanding"

describe("Creative admin landing containment (B44, C-200)", () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    dialogRenders.length = 0
    toasts.length = 0
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/clients") return { ok: true, json: async () => [{ id: 42, mp_client_name: "Bic" }] }
      if (url === "/api/mediaplans") return { ok: true, json: async () => [] }
      return { ok: true, json: async () => ({ items: [] }) }
    })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  async function mount(props: { codexEnabled: boolean; containedWrites?: boolean }) {
    await act(async () => {
      root.render(<CreativeAdminLanding {...props} />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    const tile = [...container.querySelectorAll("button")].find((el) => el.textContent?.includes("Create screenshots"))
    await act(async () => tile!.click())
  }

  const buttonsText = () => [...document.body.querySelectorAll("button, a")].map((el) => el.textContent?.trim())

  it("switch off: Create Codex task and the task dialog on this page, as before", async () => {
    await mount({ codexEnabled: true, containedWrites: false })
    expect(buttonsText()).toContain("Create Codex task")
    expect(buttonsText()).not.toContain("New task in Tasks")
    expect(dialogRenders.length).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain("/api/codex/team?active=0&per_page=100")
  })

  it("switch on: New task in Tasks, no task dialog, no roster read", async () => {
    await mount({ codexEnabled: true, containedWrites: true })
    expect(buttonsText()).toContain("New task in Tasks")
    expect(buttonsText()).not.toContain("Create Codex task")
    expect(dialogRenders).toHaveLength(0)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith("/api/codex"))).toBe(false)
  })

  it("switch on, nothing picked: New task in Tasks is a button that asks for a client and campaign, not a link (B44fix R7)", async () => {
    await mount({ codexEnabled: true, containedWrites: true })
    const controls = [...document.body.querySelectorAll("button, a")].filter((el) => el.textContent?.trim() === "New task in Tasks")
    expect(controls).toHaveLength(1)
    expect(controls[0].tagName).toBe("BUTTON")
    expect(controls[0].getAttribute("href")).toBeNull()
    expect(document.body.querySelector('a[href^="/tasks"]')).toBeNull()
    await act(async () => (controls[0] as HTMLButtonElement).click())
    expect(toasts.map((t) => t.title)).toEqual(["Select client and campaign"])
    expect(dialogRenders).toHaveLength(0)
  })

  it("codex off: neither control (process copy only), switch or not", async () => {
    await mount({ codexEnabled: false, containedWrites: true })
    expect(buttonsText()).not.toContain("New task in Tasks")
    expect(buttonsText()).not.toContain("Create Codex task")
    expect(dialogRenders).toHaveLength(0)
  })

  it("the link carries the screenshot task the dialog would get", () => {
    const prefill = buildScreenshotTaskPrefill({
      clientName: "Bic",
      campaignLabel: "BICAU002 Summer",
      clientId: 42,
      mbaNumber: "BICAU002",
    })
    const parsed = parseTasksComposeParams(new URL(screenshotTaskComposeHref(prefill), "https://app.test").searchParams)
    expect(parsed).toEqual({
      compose: "task",
      prefill: {
        title: "Screenshots requested: Bic/BICAU002 Summer",
        description: "Screenshot request from Creative landing.\nClient: Bic\nCampaign: BICAU002 Summer\nMBA: BICAU002",
        clientId: 42,
        mbaNumber: "BICAU002",
        category: "creative",
      },
      notes: [],
    })
  })

  it("a non-ASCII campaign name reads back whole through the link (B44fix R9)", () => {
    // Campaign names are free text; this one carries a dash (U+2014) and an accent.
    const label = "BICAU002 \u2014 \u00c9t\u00e9 2026"
    const prefill = buildScreenshotTaskPrefill({ clientName: "Bic", campaignLabel: label, clientId: 42, mbaNumber: "BICAU002" })
    const parsed = parseTasksComposeParams(new URL(screenshotTaskComposeHref(prefill), "https://app.test").searchParams)
    expect(parsed.notes).toEqual([])
    expect(parsed.prefill.title).toBe(`Screenshots requested: Bic/${label}`)
    expect(parsed.prefill.description).toContain(`Campaign: ${label}`)
  })

  it("source: the page reads the switch on the server; the dialog renders only with it off", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "app/creative/page.tsx"), "utf8")
    expect(page).toContain(`isFeatureOn("codex_contained_writes")`)
    expect(page).toContain("containedWrites={containedWrites}")
    const src = fs.readFileSync(path.join(process.cwd(), "components/creative/CreativeAdminLanding.tsx"), "utf8")
    expect(src).toContain("{codexEnabled && !containedWrites ? (\n        <TaskFormDialog")
  })
})
