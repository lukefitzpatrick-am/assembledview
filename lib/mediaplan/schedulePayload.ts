function parseJsonScheduleString(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    // Preserve non-empty opaque strings rather than treating them as empty.
    return value
  }
}

export function hasPersistableSchedulePayload(value: unknown): boolean {
  const parsed = typeof value === "string" ? parseJsonScheduleString(value) : value

  if (parsed == null) return false
  if (Array.isArray(parsed)) return parsed.length > 0
  if (typeof parsed === "string") return parsed.trim().length > 0

  if (typeof parsed === "object") {
    const months = (parsed as { months?: unknown }).months
    if (Array.isArray(months)) return months.length > 0
    return Object.keys(parsed).length > 0
  }

  return true
}

export function resolveSchedulePayloadForVersionSave(
  incoming: unknown,
  fallback: unknown,
): unknown | null {
  if (hasPersistableSchedulePayload(incoming)) return incoming
  if (hasPersistableSchedulePayload(fallback)) return fallback
  return null
}
