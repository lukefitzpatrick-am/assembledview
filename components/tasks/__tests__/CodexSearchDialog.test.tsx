/**
 * @vitest-environment jsdom
 *
 * Codex search dialog (F8, B37): debounced fetch to /api/codex/search, the
 * three groups render, a task opens through onOpenTask, an Inbox item opens
 * the Inbox, and only http(s) transcript links render.
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CodexSearchDialog } from "../CodexSearchDialog"

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

const RESULTS = {
  q: "report",
  tasks: {
    items: [
      { id: 7, title: "Pull weekly report", status: "todo", client_id: 3, mba_number: "KRUS015", assignee_email: "alex.james@x.au", assignee_name: "alex.james@x.au", due_date: null, matched_in: "comment", snippet: "the report is late" },
    ],
    more: true,
  },
  inbox: { items: [{ id: 4, title: "Send report", client_id: null, mba_number: null, source_note_id: 11, meeting_title: "WIP", meeting_date: null, snippet: null }], more: false },
  meetings: {
    items: [{ id: 11, title: "Internal stand-up", meeting_date: null, client_id: null, mba_number: null, is_internal: true, attributed_type: "internal", transcript_url: "https://app.fireflies.ai/view/x", task_count: 2, snippet: "We talked about the report" }],
    more: false,
  },
}

describe("CodexSearchDialog", () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => RESULTS }))
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("searches after the debounce, shows the groups, and opens a task or the Inbox", async () => {
    const onOpenTask = vi.fn()
    const onOpenInbox = vi.fn()
    act(() => {
      root.render(
        <CodexSearchDialog clientName={(id) => (id === 3 ? "Krispy Kreme" : null)} onOpenTask={onOpenTask} onOpenInbox={onOpenInbox} />,
      )
    })
    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Search"))!
    act(() => button.click())
    const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Search Codex"]')!
    expect(input).toBeTruthy()

    act(() => setInputValue(input, "r"))
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Type at least 2 characters")

    act(() => setInputValue(input, "  report "))
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/codex/search?q=report")

    const text = document.body.textContent ?? ""
    expect(text).toContain("Pull weekly report")
    expect(text).toContain("in comment")
    expect(text).toContain("Krispy Kreme")
    expect(text).toContain("Alex James")
    expect(text).toContain("More tasks match")
    expect(text).toContain("Send report")
    expect(text).toContain("Internal stand-up")
    expect(text).toContain("Internal")
    expect(text).toContain("2 tasks")
    const link = document.body.querySelector<HTMLAnchorElement>('a[href="https://app.fireflies.ai/view/x"]')
    expect(link?.rel).toContain("noopener")

    const taskButton = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.includes("Pull weekly report"))!
    act(() => taskButton.click())
    expect(onOpenTask).toHaveBeenCalledWith(7)
    expect(onOpenInbox).not.toHaveBeenCalled()
  })
})
