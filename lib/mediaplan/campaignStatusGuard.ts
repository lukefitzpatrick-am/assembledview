const DRAFT_RETURN_ERROR = "A campaign cannot be returned to Draft once it has left Draft."

export function normaliseStatus(status: unknown): string {
  return String(status ?? "").trim().toLowerCase()
}

export function getDraftReturnRejection(
  persistedStatus: unknown,
  incomingStatus: unknown
): { error: string; status: 422 } | null {
  const current = normaliseStatus(persistedStatus)
  const incoming = normaliseStatus(incomingStatus)

  if (current !== "draft" && incoming === "draft") {
    return {
      error: DRAFT_RETURN_ERROR,
      status: 422,
    }
  }

  return null
}
