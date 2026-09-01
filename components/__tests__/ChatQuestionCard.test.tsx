/**
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChatQuestionCard } from "@/components/ChatQuestionCard"
import { SKIP_ANSWER } from "@/lib/ava/chatInterviewQuestion"
import type { ChatInterviewQuestion } from "@/lib/ava/types"

const CHOICE: ChatInterviewQuestion = {
  kind: "question",
  id: "format:1",
  text: "Which format?",
  type: "choice",
  options: ["Static", "Video"],
  index: 1,
  total: 1,
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

describe("ChatQuestionCard Other and Skip", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("confirms Other as the typed free text, not the literal Other", () => {
    const onConfirm = vi.fn()
    act(() => {
      root.render(<ChatQuestionCard question={CHOICE} onConfirm={onConfirm} />)
    })

    const other = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Other",
    )
    expect(other).toBeTruthy()
    act(() => {
      other!.click()
    })

    const input = container.querySelector("input")
    expect(input).toBeTruthy()
    act(() => {
      setInputValue(input as HTMLInputElement, "300x250")
    })

    const confirm = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Confirm",
    )
    expect(confirm).toBeTruthy()
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    act(() => {
      confirm!.click()
    })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0]?.[0]).toBe("[mi:format:1] 300x250")
    expect(String(onConfirm.mock.calls[0]?.[0])).not.toContain("Other")
  })

  it("Skip is always enabled and locks the card as Skipped", () => {
    const onConfirm = vi.fn()
    act(() => {
      root.render(<ChatQuestionCard question={CHOICE} onConfirm={onConfirm} />)
    })

    const skip = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Skip",
    )
    expect(skip).toBeTruthy()
    expect((skip as HTMLButtonElement).disabled).toBe(false)
    act(() => {
      skip!.click()
    })
    expect(onConfirm).toHaveBeenCalledWith(`[mi:format:1] ${SKIP_ANSWER}`)

    act(() => {
      root.render(
        <ChatQuestionCard
          question={{
            ...CHOICE,
            confirmedAnswer: `[mi:format:1] ${SKIP_ANSWER}`,
          }}
          onConfirm={onConfirm}
        />,
      )
    })
    expect(container.textContent).toContain("Skipped")
    expect(container.textContent).not.toContain("Confirmed:")
    const lockedSkip = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Skip",
    )
    expect(lockedSkip).toBeUndefined()
  })
})
