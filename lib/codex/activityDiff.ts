/**
 * Human-readable diffs for `codex_activity` before/after payloads.
 * Never dump raw JSON into the task detail feed.
 */

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  status: "status",
  priority: "priority",
  category: "category",
  due_date: "due date",
  assignee_email: "assignee",
  assignee_name: "assignee name",
  client_id: "client",
  mba_number: "MBA",
  description: "description",
  client_visible: "client visible",
  deleted_at: "deleted",
}

const SKIP_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "created_by_email",
  "source",
])

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "yes" : "no"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * Returns lines like `status: todo → in_progress`.
 * Falls back to action-level copy when payloads are missing or non-objects.
 */
export function formatActivityDiff(args: {
  action: string
  before?: unknown
  after?: unknown
}): string[] {
  const before = asRecord(args.before)
  const after = asRecord(args.after)

  if (args.action === "create" && after) {
    const title = displayValue(after.title)
    return title !== "—" ? [`created “${title}”`] : ["created"]
  }
  if (args.action === "soft_delete") {
    return ["soft-deleted"]
  }
  if (args.action === "checklist_reorder") {
    return ["reordered checklist"]
  }

  if (!before && !after) {
    return [args.action.replace(/_/g, " ")]
  }
  if (!before && after) {
    return [`${args.action.replace(/_/g, " ")}`]
  }
  if (before && !after) {
    return [`${args.action.replace(/_/g, " ")}`]
  }
  if (!before || !after) return [args.action.replace(/_/g, " ")]

  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const lines: string[] = []
  for (const key of [...keys].sort()) {
    if (SKIP_KEYS.has(key)) continue
    const b = before[key]
    const a = after[key]
    if (Object.is(b, a)) continue
    if (JSON.stringify(b) === JSON.stringify(a)) continue
    const label = FIELD_LABELS[key] ?? key.replace(/_/g, " ")
    // Description can be long — truncate for the feed.
    const left = key === "description" ? truncate(displayValue(b), 40) : displayValue(b)
    const right =
      key === "description" ? truncate(displayValue(a), 40) : displayValue(a)
    lines.push(`${label}: ${left} → ${right}`)
  }
  if (lines.length === 0) {
    return [`${args.action.replace(/_/g, " ")} (no field changes)`]
  }
  return lines
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}
