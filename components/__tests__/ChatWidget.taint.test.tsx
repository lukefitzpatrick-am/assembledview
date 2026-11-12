/**
 * @vitest-environment jsdom
 *
 * F14 (B36): the widget sends its route and conversation id, sends the
 * server's taint marker back on every later turn of the same conversation,
 * and starts a fresh conversation when the route leaves /tasks.
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChatWidget } from "@/components/ChatWidget"

const CHIP = "How is pacing looking for this client?"

type Sent = { route?: string; conversationId?: string; taintMarker?: string; messages: { role: string; content: string }[] }

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

describe("AVA taint marker round trip", () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>
  let replies: Array<Record<string, unknown>>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    replies = []
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => replies.shift() ?? { replyText: "Ok." },
    }))
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
  })

  function render(routePath: string) {
    act(() => {
      root.render(<ChatWidget routePath={routePath} />)
    })
  }

  function open() {
    const launcher = Array.from(container.querySelectorAll("button")).find((el) => el.textContent?.trim() === "Ask Ava")
    act(() => {
      launcher!.click()
    })
  }

  async function send(text: string) {
    const input = container.querySelector("input[placeholder='Ask a question or drop an xlsx']") as HTMLInputElement
    act(() => {
      setInputValue(input, text)
    })
    const button = Array.from(container.querySelectorAll("button")).find((el) => el.textContent?.trim() === "Send")
    await act(async () => {
      button!.click()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
  }

  function sent(i: number): Sent {
    return JSON.parse(String((fetchMock.mock.calls[i] as [string, RequestInit])[1].body)) as Sent
  }

  it("sends route and conversation id, then echoes the marker", async () => {
    replies.push({ replyText: "Read the thread.", meta: { tainted: true, taintMarker: "t1.abc.def" } })
    render("/tasks")
    open()
    await send("Summarise the email")
    await send("And now?")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const first = sent(0)
    const second = sent(1)
    expect(first.route).toBe("/tasks")
    expect(first.conversationId).toMatch(/^[A-Za-z0-9-]{8,64}$/)
    expect(first.taintMarker).toBeUndefined()
    expect(second.conversationId).toBe(first.conversationId)
    expect(second.taintMarker).toBe("t1.abc.def")
  })

  it("never sends a marker in a conversation the server did not taint", async () => {
    render("/clients")
    open()
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((el) => el.textContent?.trim() === CHIP)!
        .click()
      await Promise.resolve()
    })
    await send("Next")
    expect(sent(0).taintMarker).toBeUndefined()
    expect(sent(1).taintMarker).toBeUndefined()
    expect(sent(1).route).toBe("/clients")
  })

  it("leaving /tasks starts a fresh conversation: no history, new id, no marker", async () => {
    replies.push({ replyText: "Captured summary here.", meta: { tainted: true, taintMarker: "t1.abc.def" } })
    render("/tasks")
    open()
    await send("Summarise the email")
    expect(container.textContent).toContain("Captured summary here.")
    const first = sent(0)

    render("/tasks/42")
    expect(container.textContent).toContain("Captured summary here.")

    render("/mediaplans/mba/abc001/edit")
    expect(container.textContent).not.toContain("Captured summary here.")
    expect(container.textContent).toContain(CHIP)

    await send("Change the budget")
    const after = sent(1)
    expect(after.conversationId).not.toBe(first.conversationId)
    expect(after.taintMarker).toBeUndefined()
    expect(after.messages).toEqual([{ role: "user", content: "Change the budget" }])
    expect(after.route).toBe("/mediaplans/mba/abc001/edit")
  })

  it("entering /tasks keeps the conversation", async () => {
    render("/clients")
    open()
    await send("Hello")
    render("/tasks")
    expect(container.textContent).toContain("Hello")
    await send("Again")
    expect(sent(1).conversationId).toBe(sent(0).conversationId)
    expect(sent(1).messages.length).toBe(3)
  })

  it("a reply that lands after the reset is dropped", async () => {
    let release: (v: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    render("/tasks")
    open()
    await send("Slow question")
    render("/clients")
    await act(async () => {
      release({ ok: true, status: 200, json: async () => ({ replyText: "Late captured reply", meta: { taintMarker: "t1.x.y" } }) })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).not.toContain("Late captured reply")
    await send("Fresh")
    expect(sent(1).taintMarker).toBeUndefined()
  })
})
