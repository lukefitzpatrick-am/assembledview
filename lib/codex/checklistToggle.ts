import type { ChecklistItem } from "@/lib/codex/types"

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback
  const rec = body as { message?: unknown; error?: unknown }
  if (typeof rec.message === "string" && rec.message.trim()) return rec.message
  if (typeof rec.error === "string" && rec.error.trim()) return rec.error
  return fallback
}

export function applyChecklistToggle(
  items: ChecklistItem[],
  itemId: number,
): { items: ChecklistItem[]; nextDone: boolean } | null {
  const current = items.find((item) => item.id === itemId)
  if (!current) return null
  const nextDone = !Boolean(current.done)
  return {
    nextDone,
    items: items.map((item) =>
      item.id === itemId ? { ...item, done: nextDone } : item,
    ),
  }
}

export async function persistChecklistToggle(opts: {
  taskId: number
  itemId: number
  done: boolean
  fetchImpl?: typeof fetch
}): Promise<ChecklistItem> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const res = await fetchImpl(
    `/api/codex/tasks/${opts.taskId}/checklist/${opts.itemId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: opts.done }),
    },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(errorMessage(body, "Could not update item"))
  }
  return (await res.json()) as ChecklistItem
}
