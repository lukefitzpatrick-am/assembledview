/**
 * Browser client for mba_line_approvals (absence = approved / all-in).
 * Hits Next.js proxies — fail-soft when the API is unavailable.
 *
 * GET uses `coalescedGetJson` (URL-keyed in-flight + ≤30s TTL) so edit-page
 * hydrate effect re-runs share one network call. PATCH invalidates that key.
 */

import {
  coalescedGetJson,
  invalidateCoalescedGetJson,
} from "@/lib/api/coalescedGetJson"

/** Same-render-cycle window for approvals hydrate churn (≤30s). */
const MBA_LINE_APPROVALS_GET_TTL_MS = 30_000

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

/** Stable GET URL — also the coalescedGetJson cache key. */
export function mbaLineApprovalsGetUrl(
  mbaNumber: string,
  mediaPlanVersion: number
): string {
  const qs = new URLSearchParams({
    mba_number: mbaNumber,
    media_plan_version: String(mediaPlanVersion),
  })
  return `/api/mba-line-approvals?${qs}`
}

async function parseMbaLineApprovalsResponse(
  res: Response
): Promise<FetchMbaLineApprovalsResult> {
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
}

/** GET approvals for mba + version number. Absence of rows ⇒ all approved. */
export async function fetchMbaLineApprovalsClient(params: {
  mbaNumber: string
  mediaPlanVersion: number
}): Promise<FetchMbaLineApprovalsResult> {
  const url = mbaLineApprovalsGetUrl(params.mbaNumber, params.mediaPlanVersion)
  try {
    return await coalescedGetJson<FetchMbaLineApprovalsResult>(url, {
      ttlMs: MBA_LINE_APPROVALS_GET_TTL_MS,
      init: { method: "GET", cache: "no-store" },
      parseResponse: parseMbaLineApprovalsResponse,
    })
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
    invalidateCoalescedGetJson(
      mbaLineApprovalsGetUrl(params.mbaNumber, params.mediaPlanVersion)
    )
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

/**
 * Stable fingerprint of the exclusion set for version-spawn detection (SV-3).
 * Omits channels with an empty excluded list so all-in and "no exclusions after
 * deleting an approved line" share the same fingerprint (`""`).
 */
export function approvalExclusionFingerprint(
  excludedByMedia: Record<string, string[]>
): string {
  const keys = Object.keys(excludedByMedia)
    .filter((k) => (excludedByMedia[k] ?? []).length > 0)
    .sort()
  return keys
    .map((k) => `${k}:${[...(excludedByMedia[k] ?? [])].sort().join(",")}`)
    .join("|")
}

/** Line ids present in `all` but not in `selected` — empty channels omitted. */
export function excludedLineItemIdsByMedia(params: {
  allLineIdsByMedia: Record<string, string[]>
  selectedByMedia: Record<string, string[]>
}): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [mediaType, ids] of Object.entries(params.allLineIdsByMedia)) {
    const selected = new Set(params.selectedByMedia[mediaType] ?? [])
    const excluded = ids.filter((id) => !selected.has(id))
    if (excluded.length > 0) out[mediaType] = excluded
  }
  return out
}
