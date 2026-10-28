/**
 * Campaign commercial status vocabularies.
 *
 * Selectable = what a human may choose in the editor (PATCH /status).
 * Persisted  = what may already exist on a row (legacy `draft` / `completed`
 * still parse). Never silently rewrite a persisted-but-unselectable value.
 */
const DRAFT_RETURN_ERROR = "A campaign cannot be returned to Draft once it has left Draft."

/** Stored vocabulary — lowercase. Includes legacy `draft` and `completed`. */
export const PERSISTED_CAMPAIGN_STATUSES = [
  "draft",
  "planned",
  "approved",
  "booked",
  "completed",
  "cancelled",
] as const

export type PersistedCampaignStatus = (typeof PERSISTED_CAMPAIGN_STATUSES)[number]

/** What a human may choose. Order is the selector order. */
export const SELECTABLE_CAMPAIGN_STATUSES = [
  "planned",
  "approved",
  "booked",
  "cancelled",
] as const

export type SelectableCampaignStatus = (typeof SELECTABLE_CAMPAIGN_STATUSES)[number]

const PERSISTED_SET = new Set<string>(PERSISTED_CAMPAIGN_STATUSES)
const SELECTABLE_SET = new Set<string>(SELECTABLE_CAMPAIGN_STATUSES)

export const SELECTABLE_CAMPAIGN_STATUS_OPTIONS = SELECTABLE_CAMPAIGN_STATUSES.map(
  (value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })
)

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

/**
 * The stored form of a campaign status on every write (DQ-6): trimmed lower
 * case, so "Draft" and "draft" are one value. Known values match
 * {@link mapCampaignStatusForPersist}. An unknown value is lower-cased too,
 * never written as typed. Empty or missing is null. Write paths: create
 * master (POST /api/mediaplans, ensureMaster on POST /api/plans/save),
 * PATCH /api/mediaplans/mba/[mba_number], PATCH .../status, and the version
 * row's snapshot of the master status in savePlanVersion.
 */
export function campaignStatusForWrite(status: unknown): string | null {
  const lower = normaliseStatus(status)
  return lower || null
}

export function isSelectableCampaignStatus(
  status: unknown
): status is SelectableCampaignStatus {
  return SELECTABLE_SET.has(normaliseStatus(status))
}

export function campaignStatusDisplayLabel(status: unknown): string {
  const lower = normaliseStatus(status)
  if (!lower) return ""
  return lower.charAt(0).toUpperCase() + lower.slice(1)
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
