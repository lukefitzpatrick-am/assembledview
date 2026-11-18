/**
 * B58: a template with no name is refused on the Name field (aria-invalid,
 * aria-describedby, focus, one announcement), not in a toast. A named
 * template saves as before.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Announcer } from "@/components/ui/announcer"

const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

import { TemplateFormDialog } from "@/components/tasks/TemplateFormDialog"

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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
  vi.unstubAllGlobals()
})

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find((el) => el.textContent?.trim() === text)
  expect(found, text).toBeTruthy()
  return found as HTMLButtonElement
}

function nameInput(): HTMLInputElement {
  const label = [...document.body.querySelectorAll("label")].find((l) => l.textContent?.trim() === "Name")!
  return document.getElementById(label.getAttribute("for")!) as HTMLInputElement
}

function mount(onSaved = vi.fn(), onOpenChange = vi.fn(), open = true) {
  act(() =>
    root.render(
      <>
        <Announcer />
        <TemplateFormDialog open={open} template={null} onOpenChange={onOpenChange} onSaved={onSaved} />
      </>,
    ),
  )
}

describe("TemplateFormDialog name (B58)", () => {
  it("no name: the error is on the field, focus goes there, said once, no toast, no request", async () => {
    mount()
    await settle()
    await act(async () => button("Create template").click())
    await settle()

    const input = nameInput()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("Templates need a name.")
    expect(document.activeElement).toBe(input)
    const said = container.querySelector('[data-announcer="assertive"]')!
    expect(said.children).toHaveLength(1)
    expect(said.textContent).toBe("Fix 1 field: Name: Templates need a name.")
  })

  it("B58fix R5: closed and opened again, the old error is gone", async () => {
    const onSaved = vi.fn()
    const onOpenChange = vi.fn()
    mount(onSaved, onOpenChange)
    await settle()
    await act(async () => button("Create template").click())
    await settle()
    expect(nameInput().getAttribute("aria-invalid")).toBe("true")

    mount(onSaved, onOpenChange, false)
    await settle()
    mount(onSaved, onOpenChange, true)
    await settle()

    expect(nameInput().getAttribute("aria-invalid")).toBeNull()
    expect(nameInput().hasAttribute("aria-describedby")).toBe(false)
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Templates need a name.")
  })

  it("a named template saves as before", async () => {
    const onSaved = vi.fn()
    mount(onSaved)
    await settle()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(nameInput(), "EOM reporting")
      nameInput().dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => button("Create template").click())
    await settle()

    expect(fetchMock).toHaveBeenCalledWith("/api/codex/templates", expect.objectContaining({ method: "POST" }))
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith({ title: "Template created" })
    expect(nameInput()?.getAttribute("aria-invalid") ?? null).toBeNull()
  })
})
