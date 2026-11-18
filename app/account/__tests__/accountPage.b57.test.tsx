/**
 * B57: the account page asks and tells through the shared dialog, not the
 * browser's confirm() and alert(). Delete asks first (destructive); no stops,
 * yes shows the not-built notice. Export shows its notice.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("@/components/AuthWrapper", () => ({
  useUser: () => ({
    user: { name: "Pat Planner", email: "pat@example.com", sub: "auth0|1" },
    isLoading: false,
    error: null,
  }),
}))

import AccountPage from "@/app/account/page"

let container: HTMLDivElement
let root: Root

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
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find((el) => el.textContent?.trim() === label)
  expect(found, label).toBeTruthy()
  return found as HTMLButtonElement
}

const dialogText = () => document.querySelector('[role="alertdialog"]')?.textContent ?? null

async function renderPage() {
  act(() => root.render(<AccountPage />))
  await settle()
}

async function click(label: string) {
  const el = button(label)
  el.focus()
  act(() => el.click())
  await settle()
  return el
}

describe("account page boxes go through useConfirm (B57)", () => {
  it("Delete asks first; Cancel does nothing more and focus returns", async () => {
    await renderPage()
    const opener = await click("Delete Account")
    expect(dialogText()).toContain("Delete your account?")
    expect(dialogText()).toContain("This action cannot be undone.")
    expect(button("Delete account").className).toContain("bg-destructive")
    await click("Cancel")
    expect(dialogText()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it("Delete then yes shows the not-built notice", async () => {
    await renderPage()
    await click("Delete Account")
    await click("Delete account")
    expect(dialogText()).toContain("Account deletion would be implemented here. It needs admin approval.")
    await click("OK")
    expect(dialogText()).toBeNull()
  })

  it("Export shows its notice", async () => {
    await renderPage()
    await click("Export")
    expect(dialogText()).toContain("Data export feature would be implemented here.")
    await click("OK")
    expect(dialogText()).toBeNull()
  })
})
