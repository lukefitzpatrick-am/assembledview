/**
 * Replace all channel rows for a media_plan_versions.id.
 *
 * PLANC_REPLACE_SET:
 *   off  — legacy GET→DELETE→POST (today's path)
 *   log  — shadow replace-set checks, then legacy write
 *   on   — stage→verify→bulk_supersede protocol (S2-P1)
 *
 * Matching uses media_plan_version === id ONLY — never mp_plannumber/version_number.
 */

import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { getXanoBaseUrl, xanoAuthHeaders, xanoPostHeaders } from "@/lib/api/xano"
import {
  buildReplaceListQueryParams,
  collectRowsForVersionReplace,
} from "@/lib/api/replaceChannelLineItems.pure"
import { ensureLineUids } from "@/lib/mediaplan/lineUid"
import {
  logReplaceSetShadow,
  replaceSetForChannel,
  resolvePlanCReplaceSetMode,
} from "@/lib/mediaplan/replaceSet"

export {
  buildReplaceListQueryParams,
  collectRowsForVersionReplace,
  isLiveChannelRow,
  matchesMediaPlanVersionId,
} from "@/lib/api/replaceChannelLineItems.pure"

function getMediaPlansBaseUrl(): string {
  if (typeof window !== "undefined") return "/api/media_plans"
  return getXanoBaseUrl(["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
}

function parseListPayload(data: unknown): any[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === "object" && Array.isArray((data as any).items)) {
    return (data as any).items
  }
  return []
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const data = await response.json()
      if (typeof data === "string") return data
      return data?.error || data?.message || JSON.stringify(data)
    }
    return (await response.text()) || response.statusText || "Unknown error"
  } catch {
    return response.statusText || "Unknown error"
  }
}

/** Legacy path: GET existing → DELETE matching version-id rows → POST new rows. */
export async function legacyReplaceChannelLineItems(
  endpoint: string,
  mediaPlanVersionId: number,
  rows: any[],
  mbaNumber: string
): Promise<any[]> {
  const versionId = Number(mediaPlanVersionId)
  if (!Number.isFinite(versionId) || versionId <= 0) {
    throw new Error(`Invalid media_plan_version id: ${mediaPlanVersionId}`)
  }

  const mba = String(mbaNumber ?? "").trim()
  if (!mba) {
    throw new Error("replaceChannelLineItems requires mba_number to scope the list fetch")
  }

  const slug = String(endpoint || "").replace(/^\/+|\/+$/g, "")
  if (!slug) {
    throw new Error("replaceChannelLineItems requires a channel endpoint")
  }

  const baseUrl = `${getMediaPlansBaseUrl()}/${slug}`
  const listParams = buildReplaceListQueryParams(versionId, mba)

  let existing: any[] = []
  try {
    existing = await fetchAllXanoPages(baseUrl, listParams, `replace_${slug}`)
  } catch {
    const qs = new URLSearchParams({
      mba_number: listParams.mba_number,
      media_plan_version: String(listParams.media_plan_version),
    })
    const response = await fetch(`${baseUrl}?${qs.toString()}`, {
      headers: xanoAuthHeaders(),
    })
    if (!response.ok && response.status !== 404) {
      const message = await extractErrorMessage(response)
      throw new Error(`Failed to list ${slug} for replace: ${message}`)
    }
    existing = response.ok ? parseListPayload(await response.json()) : []
  }

  const toDelete = collectRowsForVersionReplace(existing, versionId)

  const deleteFailures: string[] = []
  await Promise.all(
    toDelete.map(async (row) => {
      const id = row.id
      const response = await fetch(`${baseUrl}/${id}`, {
        method: "DELETE",
        headers: xanoAuthHeaders(),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        deleteFailures.push(`${slug}/${id}: ${message}`)
      }
    })
  )

  if (deleteFailures.length > 0) {
    throw new Error(
      `Failed to delete existing ${slug} rows before replace (aborted POST): ${deleteFailures.join("; ")}`
    )
  }

  const payload = ensureLineUids(Array.isArray(rows) ? rows : [])
  if (payload.length === 0) return []

  const headers = xanoPostHeaders()
  const results = await Promise.all(
    payload.map(async (row, index) => {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(row),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(`Failed to POST ${slug} row ${index + 1}: ${message}`)
      }
      const contentType = response.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        return response.json()
      }
      return response.text()
    })
  )

  return results
}

/**
 * Replace all channel rows for a media_plan_versions.id.
 * Dispatches on PLANC_REPLACE_SET (see module doc).
 */
export async function replaceChannelLineItems(
  endpoint: string,
  mediaPlanVersionId: number,
  rows: any[],
  mbaNumber: string
): Promise<any[]> {
  const mode = resolvePlanCReplaceSetMode()
  const slug = String(endpoint || "").replace(/^\/+|\/+$/g, "")

  if (mode === "log") {
    try {
      await logReplaceSetShadow({
        table: slug,
        mediaPlanVersionId,
        mbaNumber,
        rows,
      })
    } catch {
      // shadow must never block legacy write
    }
    return legacyReplaceChannelLineItems(endpoint, mediaPlanVersionId, rows, mbaNumber)
  }

  if (mode === "on") {
    const result = await replaceSetForChannel({
      table: slug,
      mediaPlanVersionId,
      mbaNumber,
      rows,
    })
    return result.staged
  }

  return legacyReplaceChannelLineItems(endpoint, mediaPlanVersionId, rows, mbaNumber)
}
