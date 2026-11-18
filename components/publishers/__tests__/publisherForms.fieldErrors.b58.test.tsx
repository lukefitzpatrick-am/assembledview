/**
 * B58: the publisher forms show a failed save on the field. A blank save and
 * a server name or ID clash (409 `fieldErrors`) put each message under its
 * field (aria-invalid, aria-describedby), focus the first and announce one
 * summary, with no toast. A save that fails for another reason still toasts
 * (the result of the action). A valid save is unchanged.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Announcer } from "@/components/ui/announcer"
import { PUBLISHER_FIELD_LABELS } from "@/lib/validations/publisher"

const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))
vi.mock("@/components/best-practice/BestPracticeEditor", () => ({
  BestPracticeEditor: () => null,
}))

import { AddPublisherForm } from "@/components/AddPublisherForm"
import { EditPublisherForm } from "@/components/EditPublisherForm"

const PUBLISHER = {
  id: 7,
  publisher_name: "Nine",
  publisherid: "nine",
  publishertype: "direct",
  billingagency: "assembled media",
  financecode: "NIN01",
  pub_television: true,
}

const CLASH = "Publisher ID \"seven\" is already used by Seven (id 3). Publisher IDs must be unique (case and spaces are ignored)."

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
  toastMock.mockReset()
  fetchMock = vi.fn(async () => new Response(JSON.stringify(PUBLISHER), { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(console, "error").mockImplementation(() => {})
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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

const field = (name: string) => container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
const assertive = () => container.querySelector<HTMLElement>('[data-announcer="assertive"]')!

function describedText(el: HTMLElement): string[] {
  return (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => (id ? document.getElementById(id)?.textContent ?? "" : ""))
    .filter(Boolean)
}

async function type(name: string, value: string) {
  const el = field(name)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function save(label: string) {
  await act(async () => button(label).click())
  await settle()
}

function mount(node: React.ReactNode) {
  act(() =>
    root.render(
      <>
        <Announcer />
        {node}
      </>,
    ),
  )
}

describe("Add publisher: errors on the field (B58)", () => {
  it("a blank save marks the three required fields, focuses the first, announces once", async () => {
    mount(<AddPublisherForm onSuccess={vi.fn()} />)
    await settle()
    await save("Create Publisher")

    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    for (const [name, message] of [
      ["publisher_name", "Publisher name is required"],
      ["publisherid", "Publisher ID is required"],
      ["financecode", "Finance code is required"],
    ]) {
      expect(field(name).getAttribute("aria-invalid")).toBe("true")
      expect(describedText(field(name))).toEqual([message])
    }
    expect(document.activeElement).toBe(field("publisher_name"))
    expect(assertive().children).toHaveLength(1)
    expect(assertive().textContent).toBe(
      "Fix 3 fields: Publisher Name: Publisher name is required; Publisher ID: Publisher ID is required; Finance Code: Finance code is required",
    )
  })

  it("a server ID clash shows on the ID field, focuses it, announces once, no toast", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: CLASH, code: "PUBLISHER_IDENTITY_CONFLICT", fieldErrors: { publisherid: CLASH } }), {
        status: 409,
      }),
    )
    const onSuccess = vi.fn()
    mount(<AddPublisherForm onSuccess={onSuccess} />)
    await settle()
    await type("publisher_name", "Seven West")
    await type("publisherid", "seven")
    await type("financecode", "SEV01")
    await save("Create Publisher")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    expect(field("publisherid").getAttribute("aria-invalid")).toBe("true")
    expect(describedText(field("publisherid"))).toEqual([CLASH])
    expect(field("publisher_name").getAttribute("aria-invalid")).toBe("false")
    expect(document.activeElement).toBe(field("publisherid"))
    expect(assertive().children).toHaveLength(1)
    expect(assertive().textContent).toBe(`Fix 1 field: Publisher ID: ${CLASH}`)
    expect(button("Create Publisher").disabled).toBe(false)
  })

  it("a save that fails for another reason still toasts and marks no field", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Database unavailable" }), { status: 500 }))
    mount(<AddPublisherForm onSuccess={vi.fn()} />)
    await settle()
    const before = assertive().innerHTML
    await type("publisher_name", "Seven West")
    await type("publisherid", "seven")
    await type("financecode", "SEV01")
    await save("Create Publisher")

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(toastMock.mock.calls[0])).toContain("Database unavailable")
    expect(container.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(assertive().innerHTML).toBe(before)
  })
})

describe("Edit publisher: errors on the field (B58)", () => {
  it("a server name clash shows on the name field, focuses it, announces once, no toast", async () => {
    const message = "Publisher name \"Nine\" is already used by Nine Network (id 2)."
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: message, fieldErrors: { publisher_name: message } }), { status: 409 }),
    )
    const onSuccess = vi.fn()
    mount(<EditPublisherForm publisher={PUBLISHER as never} onSuccess={onSuccess} />)
    await settle()
    await save("Save")

    expect(onSuccess).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    expect(describedText(field("publisher_name"))).toEqual([message])
    expect(document.activeElement).toBe(field("publisher_name"))
    expect(assertive().textContent).toBe(`Fix 1 field: Publisher Name: ${message}`)
  })

  it("a blank name is refused on the field before any request", async () => {
    mount(<EditPublisherForm publisher={PUBLISHER as never} onSuccess={vi.fn()} />)
    await settle()
    await type("publisher_name", "")
    await save("Save")

    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    expect(field("publisher_name").getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(field("publisher_name"))
    expect(assertive().textContent).toBe("Fix 1 field: Publisher Name: Publisher name is required")
  })

  it("a valid save is unchanged: it saves and announces nothing", async () => {
    const onSuccess = vi.fn()
    mount(<EditPublisherForm publisher={PUBLISHER as never} onSuccess={onSuccess} />)
    await settle()
    const before = assertive().innerHTML
    await save("Save")

    expect(fetchMock).toHaveBeenCalledWith("/api/publishers/nine", expect.objectContaining({ method: "PUT" }))
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(assertive().innerHTML).toBe(before)
  })
})

describe("PUBLISHER_FIELD_LABELS", () => {
  it("names every commission field as the form does", () => {
    expect(PUBLISHER_FIELD_LABELS.radio_comms).toBe("Radio Commission")
    expect(PUBLISHER_FIELD_LABELS.progooh_comms).toBe("Progooh Commission")
    expect(PUBLISHER_FIELD_LABELS.financecode).toBe("Finance Code")
  })
})
