/**
 * The words for a form that will not submit (B58): "Label: message" for each
 * invalid field, and one summary line for the announcer and a visible summary.
 * Reads react-hook-form's errors shape (or any `{ field: { message } }` map).
 */
type ErrorTree = { [key: string]: unknown }

function isTree(value: unknown): value is ErrorTree {
  return typeof value === "object" && value !== null && !(typeof Element !== "undefined" && value instanceof Element)
}

/** The first messages under one field (array rows and nested objects), never the DOM `ref`. */
function messagesIn(error: unknown): string[] {
  if (!isTree(error)) return []
  if (typeof error.message === "string" && error.message) return [error.message]
  const out: string[] = []
  // A DOM `ref` is never read: React keeps its own (circular) state on it.
  for (const child of Object.values(error)) out.push(...messagesIn(child))
  return out
}

/** "Label: message" for each invalid field, in the order of the errors. */
export function invalidFieldList(
  errors: Partial<Record<string, unknown>>,
  labels: Readonly<Record<string, string>> = {},
): string[] {
  const out: string[] = []
  for (const [field, error] of Object.entries(errors)) {
    if (!error) continue
    const label = labels[field] ?? field
    const messages = [...new Set(messagesIn(error))]
    out.push(`${label}: ${messages.length ? messages.join(", ") : "Invalid value"}`)
  }
  return out
}

/** "Fix 2 fields: A: x; B: y". Empty when nothing is invalid. */
export function invalidFieldSummary(
  errors: Partial<Record<string, unknown>>,
  labels: Readonly<Record<string, string>> = {},
): string {
  const list = invalidFieldList(errors, labels)
  if (list.length === 0) return ""
  return `Fix ${list.length === 1 ? "1 field" : `${list.length} fields`}: ${list.join("; ")}`
}
