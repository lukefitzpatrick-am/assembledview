import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { getXanoBaseUrl, xanoPostHeaders } from "@/lib/api/xano"
import {
  buildReplaceListQueryParams,
  collectRowsForVersionReplace,
} from "@/lib/api/replaceChannelLineItems.pure"

export {
  buildReplaceListQueryParams,
  collectRowsForVersionReplace,
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

/**
 * Replace all channel rows for a media_plan_versions.id:
 * GET existing (scoped by mba_number) → DELETE matching version-id rows → POST new rows.
 * Aborts before POST if any DELETE fails (no partial replace).
 *
 * Matching uses media_plan_version === id ONLY — never mp_plannumber/version_number.
 */
export async function replaceChannelLineItems(
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

  // (a) GET existing rows scoped by mba_number (+ media_plan_version query),
  // then filter strictly by media_plan_version === id for deletion.
  let existing: any[] = []
  try {
    existing = await fetchAllXanoPages(baseUrl, listParams, `replace_${slug}`)
  } catch {
    // Fallback single-page fetch (browser proxies / endpoints without pagination).
    const qs = new URLSearchParams({
      mba_number: listParams.mba_number,
      media_plan_version: String(listParams.media_plan_version),
    })
    const response = await fetch(`${baseUrl}?${qs.toString()}`, {
      headers: { Accept: "application/json" },
    })
    if (!response.ok && response.status !== 404) {
      const message = await extractErrorMessage(response)
      throw new Error(`Failed to list ${slug} for replace: ${message}`)
    }
    existing = response.ok ? parseListPayload(await response.json()) : []
  }

  const toDelete = collectRowsForVersionReplace(existing, versionId)

  // (b) DELETE all collected ids; abort before POST if any fail.
  const deleteFailures: string[] = []
  await Promise.all(
    toDelete.map(async (row) => {
      const id = row.id
      const response = await fetch(`${baseUrl}/${id}`, { method: "DELETE" })
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

  // (c) POST the new rows (empty array = delete-only replace).
  const payload = Array.isArray(rows) ? rows : []
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
