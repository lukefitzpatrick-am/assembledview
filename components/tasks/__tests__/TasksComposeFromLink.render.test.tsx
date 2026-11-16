/** @vitest-environment jsdom */
/**
 * B44 (C-200, switch codex_contained_writes): /tasks opens the dialog a link
 * from another page asks for, filled in and checked, and writes nothing on
 * load. The dialogs are stubbed to record their props.
 */
import fs from "node:fs"
import path from "node:path"
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const formProps: Array<Record<string, unknown>> = []
const helpProps: Array<Record<string, unknown>> = []
const toasts: Array<{ title?: string; description?: string }> = []

vi.mock("@/components/tasks/TaskFormDialog", () => ({
  TaskFormDialog: (props: Record<string, unknown>) => {
    formProps.push(props)
    return props.open ? <div data-testid="task-form">{JSON.stringify(props.createPrefill)}</div> : null
  },
}))
vi.mock("@/components/tasks/TaskAskHelpDialog", () => ({
  TaskAskHelpDialog: (props: Record<string, unknown>) => {
    helpProps.push(props)
    return <div data-testid="help">{String(props.note)}</div>
  },
}))
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: (t: { title?: string; description?: string }) => toasts.push(t) }),
}))

import { TasksComposeFromLink } from "@/components/tasks/TasksComposeFromLink"

type Call = { url: string; method: string }

function routes(opts: { clients?: number[] | "fail"; mbas?: string[]; tasks?: Array<Record<string, unknown>> }) {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: (init?.method ?? "GET").toUpperCase() })
    const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, headers: new Headers(), json: async () => body })
    if (url.startsWith("/api/clients")) {
      if (opts.clients === "fail") return json([], false)
      return json((opts.clients ?? []).map((id) => ({ id, mp_client_name: `Client ${id}` })))
    }
    if (url.startsWith("/api/codex/client-mbas")) return json({ campaigns: (opts.mbas ?? []).map((m) => ({ mba_number: m })) })
    if (url.startsWith("/api/codex/tasks")) return json({ items: opts.tasks ?? [] })
    return json({}, false)
  })
  vi.stubGlobal("fetch", fetchMock)
  return calls
}

describe("TasksComposeFromLink (B44)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    formProps.length = 0
    helpProps.length = 0
    toasts.length = 0
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  async function mount(search: string, onConsumed = vi.fn(), strict = false) {
    const el = (
      <TasksComposeFromLink
        params={new URLSearchParams(search)}
        clients={[{ id: 42, mp_client_name: "Bic" }]}
        teamMembers={[]}
        meEmail="luke@x.au"
        onSaved={() => undefined}
        onConsumed={onConsumed}
      />
    )
    await act(async () => {
      root.render(strict ? <StrictMode>{el}</StrictMode> : el)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    return onConsumed
  }

  it("compose=task opens the new task form filled in from the link, and writes nothing", async () => {
    const calls = routes({ clients: [42], mbas: ["BICAU002"] })
    const consumed = await mount(
      "compose=task&pf_title=Screenshots%20requested&pf_client=42&pf_mba=BICAU002&pf_category=creative&pf_desc=Line",
    )
    const last = formProps.at(-1)!
    expect(last.open).toBe(true)
    expect(last.task).toBe(null)
    expect(last.createPrefill).toEqual({
      title: "Screenshots requested",
      description: "Line",
      client_id: 42,
      mba_number: "BICAU002",
      category: "creative",
    })
    expect(helpProps).toHaveLength(0)
    expect(calls.every((c) => c.method === "GET")).toBe(true)
    expect(toasts).toHaveLength(0)
    expect(consumed).toHaveBeenCalledTimes(1)
  })

  it("compose=help with a task on the MBA opens Ask for help on that task, and writes nothing", async () => {
    const calls = routes({
      clients: [42],
      mbas: ["BICAU002"],
      tasks: [
        { id: 9, title: "Help child", parent_task_id: 3 },
        { id: 3, title: "Bic launch", parent_task_id: null },
      ],
    })
    await mount("compose=help&pf_title=Bic&pf_client=42&pf_mba=BICAU002")
    expect(helpProps.at(-1)!.open).toBe(true)
    expect((helpProps.at(-1)!.task as { id: number }).id).toBe(3)
    expect(container.textContent).toContain('Asking for help on "Bic launch" (BICAU002).')
    expect(calls.some((c) => c.url === "/api/codex/tasks?mba_number=BICAU002&per_page=20")).toBe(true)
    expect(calls.every((c) => c.method === "GET")).toBe(true)
  })

  it("compose=help with no task on the MBA falls back to a new task, with a quiet note", async () => {
    routes({ clients: [42], mbas: ["BICAU002"], tasks: [] })
    await mount("compose=help&pf_title=Bic&pf_client=42&pf_mba=BICAU002")
    expect(helpProps).toHaveLength(0)
    expect(formProps.at(-1)!.open).toBe(true)
    expect(formProps.at(-1)!.createPrefill).toMatchObject({ title: "Bic", client_id: 42, mba_number: "BICAU002" })
    expect(toasts[0]?.description).toContain("No task you can see is attached to BICAU002 yet")
  })

  it("compose=help with an MBA not on the client never looks up a task on it, and opens a new task (B44fix R6)", async () => {
    const calls = routes({
      clients: [42],
      mbas: ["OTHER001"],
      tasks: [{ id: 3, title: "Someone else's launch", parent_task_id: null }],
    })
    const consumed = await mount("compose=help&pf_title=Bic&pf_client=42&pf_mba=BICAU002")
    expect(calls.some((c) => c.url.startsWith("/api/codex/tasks"))).toBe(false)
    expect(helpProps).toHaveLength(0)
    expect(formProps.at(-1)!.open).toBe(true)
    expect(formProps.at(-1)!.createPrefill).toMatchObject({ title: "Bic", client_id: 42, mba_number: undefined })
    expect(toasts[0]?.description).toContain("MBA BICAU002 from the link is not one of this client's campaigns")
    expect(toasts[0]?.description).toContain("No campaign task to ask for help on.")
    expect(consumed).toHaveBeenCalledTimes(1)
  })

  it("compose=help asks about the client's own spelling of the MBA (B44fix R6)", async () => {
    const calls = routes({ clients: [42], mbas: ["BICAU002"], tasks: [{ id: 3, title: "Bic launch", parent_task_id: null }] })
    await mount("compose=help&pf_title=Bic&pf_client=42&pf_mba=bicau002")
    expect(calls.filter((c) => c.url.startsWith("/api/codex/tasks")).map((c) => c.url)).toEqual([
      "/api/codex/tasks?mba_number=BICAU002&per_page=20",
    ])
    expect(helpProps.at(-1)!.open).toBe(true)
  })

  it("an unknown client and an MBA not on the client are left out, with a note", async () => {
    routes({ clients: [7], mbas: [] })
    await mount("compose=task&pf_title=T&pf_client=42&pf_mba=BICAU002")
    expect(formProps.at(-1)!.createPrefill).toEqual({
      title: "T",
      description: undefined,
      client_id: undefined,
      mba_number: undefined,
      category: undefined,
    })
    expect(toasts[0]?.description).toContain("Client 42 from the link was not found")
  })

  it("a hostile link opens an empty form and says what was left out", async () => {
    const calls = routes({ clients: [42] })
    await mount(
      "compose=task&pf_title=" +
        encodeURIComponent("<script>alert(1)</script>") +
        "&pf_client=1%20OR%201%3D1&assignee_email=evil@x.com&status=done",
    )
    expect(formProps.at(-1)!.createPrefill).toEqual({
      title: undefined,
      description: undefined,
      client_id: undefined,
      mba_number: undefined,
      category: undefined,
    })
    expect(toasts[0]?.description).toMatch(/had HTML in it/)
    expect(calls.every((c) => c.method === "GET")).toBe(true)
  })

  it("under React StrictMode (next dev) compose=task opens the form once and cleans the URL once (B44fix R1)", async () => {
    const calls = routes({ clients: [42], mbas: ["BICAU002"] })
    const consumed = await mount("compose=task&pf_title=T&pf_client=42&pf_mba=BICAU002", vi.fn(), true)
    expect(formProps.at(-1)!.open).toBe(true)
    expect(formProps.at(-1)!.createPrefill).toMatchObject({ title: "T", client_id: 42, mba_number: "BICAU002" })
    expect(consumed).toHaveBeenCalledTimes(1)
    expect(toasts).toHaveLength(0)
    expect(calls.every((c) => c.method === "GET")).toBe(true)
  })

  it("under React StrictMode a link with a note opens once and toasts once (B44fix R1)", async () => {
    routes({ clients: [7], mbas: [] })
    const consumed = await mount("compose=task&pf_title=T&pf_client=42", vi.fn(), true)
    expect(formProps.at(-1)!.open).toBe(true)
    expect(consumed).toHaveBeenCalledTimes(1)
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.description).toContain("Client 42 from the link was not found")
  })

  it("under React StrictMode compose=help opens Ask for help once (B44fix R1)", async () => {
    routes({ clients: [42], mbas: ["BICAU002"], tasks: [{ id: 3, title: "Bic launch", parent_task_id: null }] })
    const consumed = await mount("compose=help&pf_title=Bic&pf_client=42&pf_mba=BICAU002", vi.fn(), true)
    expect(helpProps.at(-1)!.open).toBe(true)
    expect(consumed).toHaveBeenCalledTimes(1)
    expect(toasts).toHaveLength(0)
  })

  it("closing the dialog does not reopen it on the next render", async () => {
    routes({ clients: [42], mbas: [] })
    const params = new URLSearchParams("compose=task&pf_title=T")
    const consumed = vi.fn()
    const el = () => (
      <StrictMode>
        <TasksComposeFromLink
          params={params}
          clients={[]}
          teamMembers={[]}
          meEmail={null}
          onSaved={() => undefined}
          onConsumed={consumed}
        />
      </StrictMode>
    )
    await act(async () => root.render(el()))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(formProps.at(-1)!.open).toBe(true)
    await act(async () => (formProps.at(-1)!.onOpenChange as (o: boolean) => void)(false))
    await act(async () => root.render(el()))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(formProps.at(-1)!.open).toBe(false)
    expect(consumed).toHaveBeenCalledTimes(1)
  })

  it("no compose param: nothing opens and nothing is fetched", async () => {
    const calls = routes({ clients: [42] })
    const consumed = await mount("mba=BICAU002&view=list")
    expect(formProps.every((p) => p.open === false)).toBe(true)
    expect(calls).toHaveLength(0)
    expect(consumed).not.toHaveBeenCalled()
  })
})

describe("Tasks page reads the compose link only with the switch on (source)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "app/tasks/TasksPageClient.tsx"), "utf8")
  it("builds the compose params only when codexContainedWritesOn() and renders the component only then", () => {
    expect(src).toMatch(/codexContainedWritesOn\(\) && seededSearchParams\.get\("compose"\)/)
    expect(src).toMatch(/\{composeParams \? \(\s*<TasksComposeFromLink/)
    expect(src.match(/<TasksComposeFromLink/g)).toHaveLength(1)
  })
})
