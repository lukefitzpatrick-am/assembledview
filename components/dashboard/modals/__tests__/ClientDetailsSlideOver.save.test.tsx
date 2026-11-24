/**
 * A saved client edit stays on screen. The slide-over remounted the form on
 * success with the row the page loaded with, so a new Monthly Retainer went
 * back to the old one and the success message never showed.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const refreshMock = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))
vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({ isAdmin: true }),
}))
vi.mock("@/components/clients/PlatformAccountsSection", () => ({
  PlatformAccountsSection: () => null,
}))
vi.mock("@/components/clients/ConversionSettingsSection", () => ({
  ConversionSettingsSection: () => null,
}))

import { ClientDetailsSlideOver } from "@/components/dashboard/modals/ClientDetailsSlideOver"

const CLIENT = {
  id: 50,
  mp_client_name: "Sinch",
  mbaidentifier: "sinch",
  clientcategory: "Messaging",
  payment_days: 45,
  monthlyretainer: 0,
}

let container: HTMLDivElement
let root: Root
const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))

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
  refreshMock.mockReset()
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
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

function retainerInput(): HTMLInputElement {
  const label = [...document.body.querySelectorAll("label")].find((el) => el.textContent === "Monthly Retainer")
  const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null
  expect(input, "Monthly Retainer input").toBeTruthy()
  return input as HTMLInputElement
}

function type(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  act(() => input.focus())
  act(() => {
    setValue.call(input, text)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  act(() => input.blur())
}

describe("ClientDetailsSlideOver save", () => {
  it("keeps the saved retainer on screen and refreshes the page data", async () => {
    act(() =>
      root.render(<ClientDetailsSlideOver open onOpenChange={() => {}} clientRecord={CLIENT} />),
    )
    type(retainerInput(), "7500")
    act(() => button("Save Changes").click())
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.monthlyretainer).toBe(7500)
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(retainerInput().value).toContain("7,500")
    expect(document.body.textContent).toContain("Client updated successfully")
  })
})
