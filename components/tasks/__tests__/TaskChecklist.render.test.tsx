/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { ChecklistItem } from "@/lib/codex/types"
import {
  applyChecklistToggle,
  persistChecklistToggle,
} from "@/lib/codex/checklistToggle"

import { TaskChecklist } from "../TaskChecklist"

const ITEMS: ChecklistItem[] = [
  {
    id: 9,
    task_id: 41,
    label: "Book spots",
    done: false,
    sort: 0,
  },
  {
    id: 10,
    task_id: 41,
    label: "Send IO",
    done: true,
    sort: 1,
  },
]

describe("TaskChecklist toggle persistence", () => {
  it("renders ticks matching done, then optimistic apply flips the unchecked item", () => {
    const htmlBefore = renderToStaticMarkup(
      <TaskChecklist items={ITEMS} onToggle={() => {}} />,
    )
    expect(htmlBefore).toContain("Book spots")
    expect(htmlBefore).toContain('aria-checked="false"')
    expect(htmlBefore).toContain('aria-checked="true"')

    const applied = applyChecklistToggle(ITEMS, 9)
    expect(applied).not.toBeNull()
    expect(applied?.nextDone).toBe(true)
    expect(applied?.items.find((i) => i.id === 9)?.done).toBe(true)
    expect(applied?.items.find((i) => i.id === 10)?.done).toBe(true)

    const htmlAfter = renderToStaticMarkup(
      <TaskChecklist items={applied!.items} onToggle={() => {}} />,
    )
    const bookInput = htmlAfter.match(
      /<input[^>]*aria-label="Book spots"[^>]*>/,
    )?.[0]
    expect(bookInput).toContain('aria-checked="true"')
    expect(bookInput).toContain("checked")
  })

  it("persistChecklistToggle PATCHes { done } and returns the server item", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/codex/tasks/41/checklist/9")
      expect(init?.method).toBe("PATCH")
      expect(JSON.parse(String(init?.body))).toEqual({ done: true })
      return {
        ok: true,
        json: async () => ({
          id: 9,
          task_id: 41,
          label: "Book spots",
          done: true,
          sort: 0,
        }),
      } as Response
    })

    const updated = await persistChecklistToggle({
      taskId: 41,
      itemId: 9,
      done: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(updated.done).toBe(true)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it("persistChecklistToggle throws when the PATCH fails so the UI can revert", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => ({ message: "Could not update item" }),
    }))

    await expect(
      persistChecklistToggle({
        taskId: 41,
        itemId: 9,
        done: true,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/Could not update item/)
  })
})
