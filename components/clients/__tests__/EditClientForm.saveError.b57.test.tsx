/**
 * B57: a failed client save tells the user in the shared dialog (it was the
 * browser's alert()). The save stays in progress until the message is read,
 * as before: Save comes back only after OK.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setClientFeatureSnapshot } from "@/lib/features/client"

const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({ isAdmin: true }),
}))
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}))
vi.mock("@/components/clients/PlatformAccountsSection", () => ({
  PlatformAccountsSection: () => null,
}))
vi.mock("@/components/clients/ConversionSettingsSection", () => ({
  ConversionSettingsSection: () => null,
}))

import { EditClientForm } from "@/components/EditClientForm"

const CLIENT = {
  id: 58,
  mp_client_name: "Humanforce",
  mbaidentifier: "HUMFOR",
  clientcategory: "Software",
  payment_days: 30,
  monthlyretainer: 1000,
}

let container: HTMLDivElement
let root: Root
const onSuccess = vi.fn()

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
  onSuccess.mockReset()
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })))
  vi.spyOn(console, "error").mockImplementation(() => {})
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

describe("EditClientForm save error (B57)", () => {
  it("shows the failure in the shared dialog and holds the save until OK", async () => {
    act(() => root.render(<EditClientForm client={CLIENT as never} onSuccess={onSuccess} />))
    act(() => button("Save Changes").click())
    await settle()

    const dialog = document.querySelector('[role="alertdialog"]')
    expect(dialog?.textContent).toContain("Could not update the client")
    expect(dialog?.textContent).toContain("Failed to update client: Failed to update client")
    expect(toastMock).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(button("Saving...").disabled).toBe(true)

    act(() => button("OK").click())
    await settle()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(button("Save Changes").disabled).toBe(false)
  })
})
