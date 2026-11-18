/**
 * B58: the Codex task and team member dialogs say a failed save once and
 * focus the first invalid field (the client picker too: its trigger takes
 * the field's ref). Errors stay under each field. A valid save is unchanged.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Announcer } from "@/components/ui/announcer"
import { setClientFeatureSnapshot } from "@/lib/features/client"

const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { TeamMemberFormDialog } from "@/components/tasks/TeamMemberFormDialog"

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  setClientFeatureSnapshot({})
  toastMock.mockReset()
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  setClientFeatureSnapshot(null)
  vi.unstubAllGlobals()
})

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find((el) => el.textContent?.trim() === text)
  expect(found, text).toBeTruthy()
  return found as HTMLButtonElement
}

/** The control a label names (FormLabel's htmlFor is the FormControl id). */
function labelled(text: string): HTMLElement {
  const label = [...document.body.querySelectorAll("label")].find((l) => l.textContent?.trim() === text)!
  return document.getElementById(label.getAttribute("for")!)!
}

function described(el: HTMLElement): string[] {
  return (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => (id ? document.getElementById(id)?.textContent ?? "" : ""))
    .filter(Boolean)
}

async function type(el: HTMLElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

const assertive = () => container.querySelector<HTMLElement>('[data-announcer="assertive"]')!

async function save(label: string) {
  await act(async () => button(label).click())
  await settle()
}

describe("TeamMemberFormDialog (B58)", () => {
  function mount() {
    act(() =>
      root.render(
        <>
          <Announcer />
          <TeamMemberFormDialog open onOpenChange={vi.fn()} member={null} onSaved={vi.fn()} />
        </>,
      ),
    )
  }

  it("a blank save marks name and email, focuses name, says one summary", async () => {
    mount()
    await settle()
    await save("Add member")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    expect(labelled("Name").getAttribute("aria-invalid")).toBe("true")
    expect(described(labelled("Name"))).toEqual(["Name is required"])
    expect(described(labelled("Email"))).toEqual(["Valid email is required"])
    expect(document.activeElement).toBe(labelled("Name"))
    expect(assertive().children).toHaveLength(1)
    expect(assertive().textContent).toBe("Fix 2 fields: Name: Name is required; Email: Valid email is required")
  })

  it("a valid save posts as before and says nothing", async () => {
    mount()
    await settle()
    const before = assertive().innerHTML
    await type(labelled("Name"), "Ash")
    await type(labelled("Email"), "ash@example.com")
    await save("Add member")
    expect(fetchMock).toHaveBeenCalledWith("/api/codex/team", expect.objectContaining({ method: "POST" }))
    expect(assertive().innerHTML).toBe(before)
  })
})

describe("TaskFormDialog (B58)", () => {
  function mount() {
    act(() =>
      root.render(
        <>
          <Announcer />
          <TaskFormDialog
            open
            onOpenChange={vi.fn()}
            task={null}
            clients={[{ id: 4, mp_client_name: "Acme" } as never]}
            teamMembers={[]}
            onSaved={vi.fn()}
          />
        </>,
      ),
    )
  }

  it("a blank save focuses the title and says title and client", async () => {
    mount()
    await settle()
    await save("Create task")
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/codex/tasks"))).toBe(false)
    expect(document.activeElement).toBe(labelled("Title"))
    expect(described(labelled("Title"))).toEqual(["Title is required"])
    expect(assertive().textContent).toBe("Fix 2 fields: Title: Title is required; Client: Client is required")
  })

  it("with a title, a missing client takes focus on the client picker", async () => {
    mount()
    await settle()
    await type(labelled("Title"), "Brief")
    await save("Create task")
    const client = labelled("Client")
    expect(client.getAttribute("role")).toBe("combobox")
    expect(client.getAttribute("aria-invalid")).toBe("true")
    expect(described(client)).toEqual(["Client is required"])
    expect(document.activeElement).toBe(client)
    expect(assertive().textContent).toBe("Fix 1 field: Client: Client is required")
  })
})
