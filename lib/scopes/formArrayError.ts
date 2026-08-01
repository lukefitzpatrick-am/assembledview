/** Extract a react-hook-form / zod array-level error message for Field. */
export function formArrayErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const e = error as { message?: unknown; root?: { message?: unknown } }
  if (typeof e.message === "string" && e.message.trim()) return e.message
  if (typeof e.root?.message === "string" && e.root.message.trim()) return e.root.message
  return undefined
}
