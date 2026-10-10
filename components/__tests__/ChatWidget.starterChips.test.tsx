/**
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChatWidget } from "@/components/ChatWidget"

const PACING = "How is pacing looking for this client?"

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

describe("AVA starter chips", () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ replyText: "On track." }),
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

  function render() {
    act(() => {
      root.render(<ChatWidget />)
    })
  }

  function open() {
    const launcher = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Ask Ava",
    )
    expect(launcher).toBeTruthy()
    act(() => {
      launcher!.click()
    })
  }

  function chipButton(label: string) {
    return Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === label,
    )
  }

  it("sends the chip text through the same request as Send, then hides the chips", async () => {
    render()
    open()

    const chip = chipButton(PACING)
    expect(chip).toBeTruthy()
    expect(chip!.closest("[role='log']")).toBeNull()

    await act(async () => {
      chip!.click()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/chat-v2")
    expect(init.method).toBe("POST")
    const body = JSON.parse(String(init.body)) as {
      messages: { role: string; content: string }[]
    }
    expect(body.messages).toEqual([{ role: "user", content: PACING }])
    expect(chipButton(PACING)).toBeUndefined()
    expect(container.textContent).toContain(PACING)
  })

  it("Send posts the typed text on the same endpoint", async () => {
    render()
    open()

    const input = container.querySelector("input[placeholder='Ask a question or drop an xlsx']")
    expect(input).toBeTruthy()
    act(() => {
      setInputValue(input as HTMLInputElement, "What is the fee?")
    })
    const send = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Send",
    )
    expect(send).toBeTruthy()

    await act(async () => {
      send!.click()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      messages: { role: string; content: string }[]
    }
    expect(body.messages[0]).toEqual({ role: "user", content: "What is the fee?" })
  })
})
