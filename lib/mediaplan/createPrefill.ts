/**
 * Query-param contract for `/mediaplans/create` planning handoff (v1).
 * Params: audienceId (frozen split), clientId, campaignName, start, end (YYYY-MM-DD).
 * Never put split/$/% in the query string — load via audienceId only.
 */

export type CreateCampaignPrefill = {
  /** Saved planning audience id — create loads frozen recommended_split from API. */
  audienceId?: string | number | null
  clientId?: string | number | null
  campaignName?: string | null
  /** YYYY-MM-DD */
  start?: string | null
  /** YYYY-MM-DD */
  end?: string | null
}

export function buildCreateCampaignHref(prefill: CreateCampaignPrefill = {}): string {
  const params = new URLSearchParams()
  if (prefill.audienceId != null && String(prefill.audienceId).trim() !== "") {
    params.set("audienceId", String(prefill.audienceId).trim())
  }
  if (prefill.clientId != null && String(prefill.clientId).trim() !== "") {
    params.set("clientId", String(prefill.clientId).trim())
  }
  const name = (prefill.campaignName ?? "").trim()
  if (name) params.set("campaignName", name)
  const start = (prefill.start ?? "").trim()
  if (start) params.set("start", start)
  const end = (prefill.end ?? "").trim()
  if (end) params.set("end", end)
  const q = params.toString()
  return q ? `/mediaplans/create?${q}` : "/mediaplans/create"
}

/** Strict YYYY-MM-DD → local midnight Date, or null if malformed. */
export function parsePrefillYmd(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const date = new Date(y, m - 1, d, 0, 0, 0, 0)
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null
  }
  return date
}
