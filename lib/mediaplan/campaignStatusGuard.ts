const DRAFT_RETURN_ERROR = "A campaign cannot be returned to Draft once it has left Draft."

/** Stored vocabulary (Xano PUT `normalise` + editor Combobox values) — lowercase. */
export const PERSISTED_CAMPAIGN_STATUSES = [
  "draft",
  "planned",
  "approved",
  "booked",
  "completed",
  "cancelled",
] as const

export type PersistedCampaignStatus = (typeof PERSISTED_CAMPAIGN_STATUSES)[number]

const PERSISTED_SET = new Set<string>(PERSISTED_CAMPAIGN_STATUSES)

export function normaliseStatus(status: unknown): string {
  return String(status ?? "").trim().toLowerCase()
}

/**
 * Map UI / form campaign status onto the stored value (lowercase), matching
 * Xano MBA PUT `normalise(mp_campaignstatus)`. Title-case labels ("Booked")
 * and already-lowercase Combobox values ("booked") both land as "booked".
 * Empty / unknown → null (caller must not invent "Approved").
 */
export function mapCampaignStatusForPersist(
  status: unknown
): PersistedCampaignStatus | null {
  const lower = normaliseStatus(status)
  if (!lower) return null
  if (PERSISTED_SET.has(lower)) return lower as PersistedCampaignStatus
  return null
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
