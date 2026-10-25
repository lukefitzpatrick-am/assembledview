import type { PublisherIdentityField } from "@/lib/publisher/publisherUniqueness"

export type PublisherSaveError = {
  message: string
  /** Server messages for the name / publisherid inputs (409 duplicate). */
  fieldErrors: Partial<Record<PublisherIdentityField, string>>
}

const FIELDS: readonly PublisherIdentityField[] = ["publisher_name", "publisherid"]

/**
 * Reads a failed publisher create/edit response. A 409 duplicate carries
 * `fieldErrors` for the name and publisherid inputs; anything else falls back
 * to the API `error` text, then `fallback`.
 */
export async function readPublisherSaveError(
  response: Pick<Response, "json">,
  fallback: string,
): Promise<PublisherSaveError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const fieldErrors: Partial<Record<PublisherIdentityField, string>> = {}
  const raw = record.fieldErrors
  if (raw && typeof raw === "object") {
    for (const field of FIELDS) {
      const value = (raw as Record<string, unknown>)[field]
      if (typeof value === "string" && value.trim()) fieldErrors[field] = value
    }
  }
  const error = typeof record.error === "string" && record.error.trim() ? record.error : ""
  const detail = typeof record.message === "string" && record.message.trim() ? record.message : ""
  return { message: error || detail || fallback, fieldErrors }
}
