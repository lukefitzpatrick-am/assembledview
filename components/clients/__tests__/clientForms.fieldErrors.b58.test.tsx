/**
 * B58: the client forms show a failed save on the field. Each error sits
 * under its field (aria-invalid, aria-describedby), focus goes to the first
 * invalid field, one summary is announced, and no toast shows. Edit also names
 * the fields by Save (a field can be hidden or far down). A valid save is
 * unchanged.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Announcer } from "@/components/ui/announcer"
import { setClientFeatureSnapshot } from "@/lib/features/client"

const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({ isAdmin: false }),
  useIsAdmin: () => false,
}))
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))
vi.mock("@/components/clients/PlatformAccountsSection", () => ({
  PlatformAccountsSection: () => null,
}))
vi.mock("@/components/clients/ConversionSettingsSection", () => ({
  ConversionSettingsSection: () => null,
}))

import { AddClientForm } from "@/components/AddClientForm"
import { EditClientForm } from "@/components/EditClientForm"

const VALID_CLIENT = {
  id: 58,
  mp_client_name: "Humanforce",
  mbaidentifier: "HUMFOR",
  clientcategory: "Software",
  payment_days: 30,
  monthlyretainer: 1000,
}

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
  setClientFeatureSnapshot({ channel_client_fees: true })
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

async function save(label: string) {
  await act(async () => button(label).click())
  await settle()
}

describe("Add client: errors on the field (B58)", () => {
  it("a blank save marks client name and MBA identifier, focuses client name, announces once", async () => {
    act(() =>
      root.render(
        <>
          <Announcer />
          <AddClientForm onSuccess={vi.fn()} />
        </>,
      ),
    )
    await settle()
    await save("Create Client")

    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    for (const [name, message] of [
      ["clientname_input", "Client name is required"],
      ["mbaidentifier", "MBA Identifier is required"],
    ]) {
      expect(field(name).getAttribute("aria-invalid")).toBe("true")
      expect(describedText(field(name))).toEqual([message])
    }
    expect(document.activeElement).toBe(field("clientname_input"))
    expect(assertive().children).toHaveLength(1)
    expect(assertive().textContent).toMatch(/^Fix 2 fields: Client Name: Client name is required; MBA Identifier: /)
  })
})

describe("Edit client: errors on the field (B58)", () => {
  it("a bad save marks the field, focuses it, announces once and names it by Save; no toast", async () => {
    act(() =>
      root.render(
        <>
          <Announcer />
          <EditClientForm client={{ ...VALID_CLIENT, mbaidentifier: "" } as never} onSuccess={vi.fn()} />
        </>,
      ),
    )
    await settle()
    await save("Save Changes")

    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    const mba = field("mbaidentifier")
    expect(mba.getAttribute("aria-invalid")).toBe("true")
    expect(describedText(mba)).toEqual(["MBA Identifier is required"])
    expect(field("clientname_input").getAttribute("aria-invalid")).toBe("false")
    expect(document.activeElement).toBe(mba)
    const summary = "Fix 1 field: MBA Identifier: MBA Identifier is required"
    expect(assertive().children).toHaveLength(1)
    expect(assertive().textContent).toBe(summary)
    expect(container.querySelector("[data-form-error-summary]")?.textContent).toBe(summary)
  })

  it("B58fix R7: two bad fields: the summary reads them in page order and focus is on the one it names first", async () => {
    act(() =>
      root.render(
        <>
          <Announcer />
          <EditClientForm client={{ ...VALID_CLIENT, mp_client_name: "", mbaidentifier: "" } as never} onSuccess={vi.fn()} />
        </>,
      ),
    )
    await settle()
    await save("Save Changes")

    const invalid = [...container.querySelectorAll<HTMLInputElement>('input[aria-invalid="true"]')].map((el) => el.name)
    expect(invalid).toEqual(["clientname_input", "mbaidentifier"])
    expect(assertive().textContent).toBe(
      "Fix 2 fields: Client Name: Client name is required; MBA Identifier: MBA Identifier is required",
    )
    expect(document.activeElement).toBe(field("clientname_input"))
  })

  it("a valid save is unchanged: it saves and announces nothing", async () => {
    const onSuccess = vi.fn()
    act(() =>
      root.render(
        <>
          <Announcer />
          <EditClientForm client={VALID_CLIENT as never} onSuccess={onSuccess} />
        </>,
      ),
    )
    await settle()
    const before = assertive().innerHTML
    await save("Save Changes")

    expect(fetchMock).toHaveBeenCalledWith("/api/clients/58", expect.objectContaining({ method: "PUT" }))
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(container.querySelector("[data-form-error-summary]")).toBeNull()
    expect(assertive().innerHTML).toBe(before)
  })
})
