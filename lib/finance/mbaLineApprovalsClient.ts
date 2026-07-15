/**
 * Browser client for mba_line_approvals (absence = approved / all-in).
 * Hits Next.js proxies — fail-soft when the API is unavailable.
 */

export type MbaLineApprovalRow = {
  line_item_id: string
  media_type: string
  approved: boolean
  approved_in_version?: number | null
}

export type MbaLineApprovalPatchLine = {
  line_item_id: string
  media_type: string
  approved: boolean
}

export type FetchMbaLineApprovalsResult =
  | { ok: true; rows: MbaLineApprovalRow[]; available: true }
  | { ok: true; rows: []; available: false }
  | { ok: false; error: string; available: false }

/** GET approvals for mba + version number. Absence of rows ⇒ all approved. */
export async function fetchMbaLineApprovalsClient(params: {
  mbaNumber: string
  mediaPlanVersion: number
}): Promise<FetchMbaLineApprovalsResult> {
  try {
    const qs = new URLSearchParams({
      mba_number: params.mbaNumber,
      media_plan_version: String(params.mediaPlanVersion),
    })
    const res = await fetch(`/api/mba-line-approvals?${qs}`, {
      method: "GET",
      cache: "no-store",
    })
    if (res.status === 404) {
      return { ok: true, rows: [], available: false }
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        ok: false,
        error: err.error || `Failed to load approvals (${res.status})`,
        available: false,
      }
    }
    const data = await res.json()
    const rows = Array.isArray(data?.lines)
      ? data.lines
      : Array.isArray(data)
        ? data
        : []
    return { ok: true, rows, available: data?.available !== false }
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message || "Approvals request failed",
      available: false,
    }
  }
}

/** PATCH approvals. `approved: true` deletes the exclusion row (all-in). */
export async function patchMbaLineApprovalsClient(params: {
  mbaNumber: string
  mediaPlanVersion: number
  lines: MbaLineApprovalPatchLine[]
}): Promise<{ ok: true } | { ok: false; error: string; available: false }> {
  try {
    const res = await fetch("/api/mba-line-approvals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mba_number: params.mbaNumber,
        media_plan_version: params.mediaPlanVersion,
        lines: params.lines,
      }),
    })
    if (res.status === 404) {
      return { ok: false, error: "Approvals API unavailable", available: false }
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        ok: false,
        error: err.error || `PATCH approvals failed (${res.status})`,
        available: false,
      }
    }
    return { ok: true }
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message || "PATCH approvals failed",
      available: false,
    }
  }
}

/**
 * Convert approval rows → selected line-item ids by media.
 * Rows with approved:false are exclusions; absence = include.
 * When `allLineIdsByMedia` is provided, start from all-in and drop exclusions.
 */
export function selectedLineItemIdsFromApprovalRows(params: {
  rows: MbaLineApprovalRow[]
  allLineIdsByMedia: Record<string, string[]>
}): Record<string, string[]> {
  const excluded = new Set(
    params.rows
      .filter((r) => r.approved === false)
      .map((r) => `${r.media_type}::${r.line_item_id}`)
  )
  const out: Record<string, string[]> = {}
  for (const [mediaType, ids] of Object.entries(params.allLineIdsByMedia)) {
    out[mediaType] = ids.filter((id) => !excluded.has(`${mediaType}::${id}`))
  }
  return out
}

/** Stable fingerprint of the approval selection for version-spawn detection. */
export function approvalSelectionFingerprint(
  selectedByMedia: Record<string, string[]>
): string {
  const keys = Object.keys(selectedByMedia).sort()
  return keys
    .map((k) => `${k}:${[...(selectedByMedia[k] ?? [])].sort().join(",")}`)
    .join("|")
}
