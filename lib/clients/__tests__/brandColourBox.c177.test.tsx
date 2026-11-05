/**
 * C-177 (B26): the brand colour box on both client forms can be typed in.
 *
 * Renders the real AddClientForm and EditClientForm and types key by key, the
 * way EditClientForm.feeTyping.b22fix does: each key goes in at the caret (or
 * replaces the selection). When React rewrites the value, jsdom moves the
 * caret to the end, as a browser does. The old box padded to 6 digits with 0
 * on every key, so backspace on #1E40AF gave #1E40A0, and select all then 12
 * gave #100000. The saved shape (`#` and 6 upper-case digits) is unchanged:
 * the box pads once typing is done (blur or Enter). Paste and the colour
 * picker work as before. The saved value is read from the fetch mock.
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
  useIsAdmin: () => true,
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

import { AddClientForm } from "@/components/AddClientForm"
import { EditClientForm } from "@/components/EditClientForm"

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!

/** Puts `next` in the box with the caret at `caret`, then fires input (a browser keystroke). */
function keystroke(input: HTMLInputElement, next: string, caret: number) {
  act(() => {
    setValue.call(input, next)
    input.setSelectionRange(caret, caret)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

/** Types each character at the caret, replacing any selection. Honours maxLength like a browser. */
function typeKeys(input: HTMLInputElement, text: string) {
  for (const ch of text) {
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    const next = input.value.slice(0, start) + ch + input.value.slice(end)
    if (input.maxLength > 0 && next.length > input.maxLength) continue
    keystroke(input, next, start + 1)
  }
}

/** Paste: the whole text replaces the selection in one input event. */
function paste(input: HTMLInputElement, text: string) {
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  keystroke(input, input.value.slice(0, start) + text + input.value.slice(end), start + text.length)
}

/** Backspace: deletes the selection, or the character before the caret. */
function backspace(input: HTMLInputElement) {
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  if (start !== end) keystroke(input, input.value.slice(0, start) + input.value.slice(end), start)
  else if (start > 0) keystroke(input, input.value.slice(0, start - 1) + input.value.slice(start), start - 1)
}

function focus(input: HTMLInputElement) {
  act(() => {
    input.focus()
  })
}

function blur(input: HTMLInputElement) {
  act(() => {
    input.blur()
  })
}

function selectAll(input: HTMLInputElement) {
  act(() => {
    input.setSelectionRange(0, input.value.length)
  })
}

function caretAtEnd(input: HTMLInputElement) {
  act(() => {
    input.setSelectionRange(input.value.length, input.value.length)
  })
}

function pressEnter(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  })
}

type FormKind = "add" | "edit"

describe.each<FormKind>(["add", "edit"])("%s client form: brand colour box (C-177)", (kind) => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // jsdom has no ResizeObserver; the form's Radix checkboxes measure themselves.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    setClientFeatureSnapshot({ channel_client_fees: false })
    toastMock.mockReset()
    fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(window, "alert").mockImplementation(() => {})
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    setClientFeatureSnapshot(null)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function box(name: string): HTMLInputElement {
    const el = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)
    expect(el, name).toBeTruthy()
    return el!
  }

  function picker(): HTMLInputElement {
    const el = container.querySelector<HTMLInputElement>('input[type="color"]')
    expect(el).toBeTruthy()
    return el!
  }

  /** Renders the form. Edit gets a stored colour; Add starts on its default. */
  function render(storedColour = "#1E40AF") {
    act(() => {
      root.render(
        kind === "edit" ? (
          <EditClientForm
            client={{ id: 58, mp_client_name: "Humanforce", mbaidentifier: "HUMFOR", brand_colour: storedColour } as never}
            onSuccess={() => {}}
          />
        ) : (
          <AddClientForm onSuccess={() => {}} />
        ),
      )
    })
    if (kind === "add") {
      // The two required boxes, so a save goes through.
      for (const [name, text] of [
        ["clientname_input", "Humanforce"],
        ["mbaidentifier", "HUMFOR"],
      ] as const) {
        const input = box(name)
        focus(input)
        typeKeys(input, text)
        blur(input)
      }
    }
  }

  /** A box that holds #1E40AF: stored on Edit, pasted on Add. */
  function boxAt1E40AF(): HTMLInputElement {
    render()
    const input = box("brand_colour")
    if (kind === "add") {
      focus(input)
      selectAll(input)
      paste(input, "#1E40AF")
      blur(input)
    }
    expect(input.value).toBe("#1E40AF")
    return input
  }

  async function savedColour(): Promise<unknown> {
    const label = kind === "edit" ? "Save Changes" : "Create Client"
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(label))
    expect(button).toBeTruthy()
    await act(async () => {
      button!.click()
      for (let i = 0; i < 10; i++) await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(toastMock, JSON.stringify(toastMock.mock.calls)).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(kind === "edit" ? "/api/clients/58" : "/api/clients")
    return (JSON.parse(String(init.body)) as Record<string, unknown>).brand_colour
  }

  it("backspace on #1E40AF gives #1E40A, then F gives #1E40AF", async () => {
    const input = boxAt1E40AF()
    focus(input)
    caretAtEnd(input)
    backspace(input)
    expect(input.value).toBe("#1E40A")
    typeKeys(input, "F")
    expect(input.value).toBe("#1E40AF")
    blur(input)
    expect(input.value).toBe("#1E40AF")
    expect(await savedColour()).toBe("#1E40AF")
  })

  it("select all and type 12 shows #12 while typing and #120000 after blur", async () => {
    const input = boxAt1E40AF()
    focus(input)
    selectAll(input)
    typeKeys(input, "1")
    expect(input.value).toBe("#1")
    typeKeys(input, "2")
    expect(input.value).toBe("#12")
    blur(input)
    expect(input.value).toBe("#120000")
    expect(await savedColour()).toBe("#120000")
  })

  it("Enter pads an incomplete value before the save, as blur does", async () => {
    const input = boxAt1E40AF()
    focus(input)
    selectAll(input)
    typeKeys(input, "12")
    expect(input.value).toBe("#12")
    pressEnter(input)
    expect(input.value).toBe("#120000")
    expect(await savedColour()).toBe("#120000")
  })

  it("lower case and other characters: upper case, hex only, at most 6 digits", async () => {
    const input = boxAt1E40AF()
    focus(input)
    selectAll(input)
    typeKeys(input, "a")
    expect(input.value).toBe("#A")
    typeKeys(input, "g")
    expect(input.value).toBe("#A")
    typeKeys(input, "bcdef9")
    expect(input.value).toBe("#ABCDEF")
    blur(input)
    expect(await savedColour()).toBe("#ABCDEF")
  })

  it("a digit typed over only the # keeps 6 digits (maxLength 7 lets a 7th digit in)", async () => {
    // B26 review L-1: replacing the `#` with a digit gives `91E40AF`, 7 characters
    // and 7 hex digits, so maxLength does not stop it. Only the 6-digit cap does.
    const input = boxAt1E40AF()
    focus(input)
    act(() => {
      input.setSelectionRange(0, 1)
    })
    typeKeys(input, "9")
    expect(input.value).toBe("#91E40A")
    blur(input)
    expect(input.value).toBe("#91E40A")
    expect(await savedColour()).toBe("#91E40A")
  })

  it("a cleared box shows # while typing and saves #000000 after blur (as before)", async () => {
    const input = boxAt1E40AF()
    focus(input)
    selectAll(input)
    backspace(input)
    expect(input.value).toBe("#")
    blur(input)
    expect(input.value).toBe("#000000")
    expect(await savedColour()).toBe("#000000")
  })

  it("paste 1e40af gives #1E40AF", async () => {
    render()
    const input = box("brand_colour")
    focus(input)
    selectAll(input)
    paste(input, "1e40af")
    expect(input.value).toBe("#1E40AF")
    blur(input)
    expect(input.value).toBe("#1E40AF")
    expect(await savedColour()).toBe("#1E40AF")
  })

  it("the colour picker value passes through, upper case", async () => {
    render()
    const colour = picker()
    act(() => {
      setValue.call(colour, "#1e40af")
      colour.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(box("brand_colour").value).toBe("#1E40AF")
    expect(colour.value).toBe("#1e40af")
    expect(await savedColour()).toBe("#1E40AF")
  })

  it("focus and blur without typing changes nothing", async () => {
    render("#1e40af")
    const input = box("brand_colour")
    const before = input.value
    focus(input)
    blur(input)
    pressEnter(input)
    expect(input.value).toBe(before)
    expect(await savedColour()).toBe(kind === "edit" ? "#1e40af" : "#49C7EB")
  })
})
