/**
 * B22fix R1: the fee boxes on the edit client form keep what is typed.
 *
 * Renders the real EditClientForm and types key by key: each key goes in at
 * the caret (or replaces the selection), the way a browser does. When React
 * rewrites the value, jsdom moves the caret to the end, as a browser does.
 * The old boxes reformatted on every key, so 1 then 0 gave "1.00%0" and the
 * PUT carried 1. The PUT body is read from the fetch mock.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setClientFeatureSnapshot } from "@/lib/features/client"
import { CHANNEL_CLIENT_FEE_FIELDS, LEGACY_CLIENT_FEE_FIELDS } from "@/lib/finance/clientFeeChannels"

const auth = vi.hoisted(() => ({ isAdmin: true }))
const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({ isAdmin: auth.isAdmin }),
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

/** A Humanforce-shaped row (the 8 old fees at 15, the 12 from 0113 blank). */
function clientRow(extra: Record<string, unknown> = {}) {
  return {
    id: 58,
    mp_client_name: "Humanforce",
    mbaidentifier: "HUMFOR",
    clientcategory: "Software",
    payment_days: 30,
    monthlyretainer: 1000,
    organicsocial: 0,
    feesocial: 15,
    feesearch: 15,
    feeprogdisplay: 15,
    feeprogvideo: 15,
    feeprogbvod: 15,
    feeprogaudio: 15,
    feeprogooh: 15,
    feecontentcreator: 15,
    adservvideo: 0.89,
    adservimp: 0.12,
    adservdisplay: 0.12,
    adservaudio: 0.4,
    ...Object.fromEntries(CHANNEL_CLIENT_FEE_FIELDS.map((f) => [f, null])),
    ...extra,
  }
}

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!

/** Puts `next` in the box with the caret at `caret`, then fires input (a browser keystroke). */
function keystroke(input: HTMLInputElement, next: string, caret: number) {
  act(() => {
    setValue.call(input, next)
    input.setSelectionRange(caret, caret)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

/** Types each character at the caret, replacing any selection. */
function typeKeys(input: HTMLInputElement, text: string) {
  for (const ch of text) {
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    keystroke(input, input.value.slice(0, start) + ch + input.value.slice(end), start + 1)
  }
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

describe("EditClientForm fee boxes keep what is typed (B22fix R1)", () => {
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
    auth.isAdmin = true
    setClientFeatureSnapshot({ channel_client_fees: true })
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

  function render(extra: Record<string, unknown> = {}) {
    act(() => {
      root.render(<EditClientForm client={clientRow(extra) as never} onSuccess={() => {}} />)
    })
  }

  function box(name: string): HTMLInputElement {
    const el = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)
    expect(el, name).toBeTruthy()
    return el!
  }

  async function save(): Promise<Record<string, unknown>> {
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Save Changes"))
    expect(button).toBeTruthy()
    await act(async () => {
      button!.click()
      for (let i = 0; i < 10; i++) await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(toastMock, JSON.stringify(toastMock.mock.calls)).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/clients/58")
    return JSON.parse(String(init.body)) as Record<string, unknown>
  }

  it("all 20 fee boxes are typed-number boxes", () => {
    render()
    for (const f of [...LEGACY_CLIENT_FEE_FIELDS, ...CHANNEL_CLIENT_FEE_FIELDS]) {
      const input = box(f)
      expect(input.type, f).toBe("text")
    }
  })

  it("old fee box: 1 then 0 saves 10, and shows 10.00% after blur", async () => {
    render()
    const input = box("feesearch")
    expect(input.value).toBe("15.00%")
    focus(input)
    expect(input.value).toBe("15")
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    typeKeys(input, "1")
    expect(input.value).toBe("1")
    typeKeys(input, "0")
    expect(input.value).toBe("10")
    blur(input)
    expect(input.value).toBe("10.00%")
    const body = await save()
    expect(body.feesearch).toBe(10)
    expect(body.feesocial).toBe(15)
  })

  it("new fee box (OOH): 1 then 0 saves 10, 12.5 saves 12.5", async () => {
    render()
    const ooh = box("feeooh")
    expect(ooh.value).toBe("")
    expect(ooh.placeholder).toBe("No fee")
    focus(ooh)
    typeKeys(ooh, "10")
    expect(ooh.value).toBe("10")
    blur(ooh)
    expect(ooh.value).toBe("10.00%")
    const audio = box("feedigiaudio")
    focus(audio)
    typeKeys(audio, "12.5")
    expect(audio.value).toBe("12.5")
    blur(audio)
    expect(audio.value).toBe("12.50%")
    const body = await save()
    expect(body.feeooh).toBe(10)
    expect(body.feedigiaudio).toBe(12.5)
    for (const f of CHANNEL_CLIENT_FEE_FIELDS) {
      if (f === "feeooh" || f === "feedigiaudio") continue
      expect(f in body, f).toBe(false)
    }
  })

  it("typing at the end of the plain number appends (caret stays where it is)", async () => {
    render()
    const input = box("feeprogdisplay")
    focus(input)
    act(() => input.setSelectionRange(2, 2))
    typeKeys(input, ".5")
    expect(input.value).toBe("15.5")
    blur(input)
    expect((await save()).feeprogdisplay).toBe(15.5)
  })

  it("backspace edits the number, not the % sign", async () => {
    render()
    const input = box("feeprogvideo")
    focus(input)
    act(() => input.setSelectionRange(2, 2))
    backspace(input)
    expect(input.value).toBe("1")
    typeKeys(input, "8")
    expect(input.value).toBe("18")
    blur(input)
    expect((await save()).feeprogvideo).toBe(18)
  })

  it("cleared: an old fee saves 0 (as before), one of the 12 saves null", async () => {
    render({ feeooh: 10 })
    const search = box("feesearch")
    focus(search)
    backspace(search)
    expect(search.value).toBe("")
    blur(search)
    expect(search.value).toBe("0.00%")
    const ooh = box("feeooh")
    expect(ooh.value).toBe("10.00%")
    focus(ooh)
    backspace(ooh)
    blur(ooh)
    expect(ooh.value).toBe("")
    const body = await save()
    expect(body.feesearch).toBe(0)
    expect(body.feeooh).toBeNull()
  })

  it("focus and blur without typing changes nothing in the body", async () => {
    render({ feeinfluencers: 12.345 })
    const untouched = JSON.stringify(await save())
    fetchMock.mockClear()
    for (const f of [...LEGACY_CLIENT_FEE_FIELDS, ...CHANNEL_CLIENT_FEE_FIELDS]) {
      const input = box(f)
      const before = input.value
      focus(input)
      blur(input)
      expect(input.value, f).toBe(before)
    }
    expect(JSON.stringify(await save())).toBe(untouched)
  })

  it("Influencers keeps the Content Creator placeholder", () => {
    render()
    expect(box("feeinfluencers").placeholder).toBe("Uses Content Creator (15.00%)")
  })

  it("text that isn't one number is refused, not saved as something else", async () => {
    render()
    const input = box("feesocial")
    focus(input)
    typeKeys(input, "1..5")
    blur(input)
    expect(input.value).toBe("1..5")
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Save Changes"))
    await act(async () => {
      button!.click()
      for (let i = 0; i < 10; i++) await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(toastMock.mock.calls[0])).toContain("Social Media")
  })
  it("money boxes: retainer, organic social and ad serving keep what is typed", async () => {
    render()
    const retainer = box("monthlyretainer")
    expect(retainer.value).toBe("$1,000.00")
    focus(retainer)
    expect(retainer.value).toBe("1000")
    typeKeys(retainer, "2500")
    expect(retainer.value).toBe("2500")
    blur(retainer)
    expect(retainer.value).toBe("$2,500.00")
    const imp = box("adservimp")
    focus(imp)
    typeKeys(imp, "0.15")
    blur(imp)
    expect(imp.value).toBe("$0.15")
    const video = box("adservvideo")
    focus(video)
    act(() => video.setSelectionRange(4, 4))
    typeKeys(video, "5")
    blur(video)
    const organic = box("organicsocial")
    focus(organic)
    backspace(organic)
    blur(organic)
    const body = await save()
    expect(body.monthlyretainer).toBe(2500)
    expect(body.adservimp).toBe(0.15)
    expect(body.adservvideo).toBe(0.895)
    expect(body.organicsocial).toBe(0)
    expect(body.adservdisplay).toBe(0.12)
    expect(body.adservaudio).toBe(0.4)
  })
})
