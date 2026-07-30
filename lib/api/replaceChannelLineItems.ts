import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { getXanoBaseUrl, xanoAuthHeaders, xanoPostHeaders } from "@/lib/api/xano"
import {
  buildReplaceListQueryParams,
  collectRowsForVersionReplace,
} from "@/lib/api/replaceChannelLineItems.pure"
import { lineItemWriteSemaphore } from "@/lib/utils/createSemaphore"

export {
  buildReplaceListQueryParams,
  collectRowsForVersionReplace,
  matchesMediaPlanVersionId,
} from "@/lib/api/replaceChannelLineItems.pure"

export type ReplaceChannelOptions = {
  /**
   * Mirror / safe overwrite: POST new rows first, then DELETE previously
   * snapshotted ids. Default (false) keeps legacy delete-then-POST for
   * abort-before-POST semantics on the live Xano save path.
   */
  insertBeforeDelete?: boolean
}

/** Process-local default applied while a mirror run is in flight. */
let insertBeforeDeleteDefault = false

/**
 * Run `fn` with replaceChannelLineItems using insert-then-delete ordering.
 * Used by the Postgres→Xano mirror so a mid-POST failure never blanks the channel.
 */
export async function withInsertBeforeDelete<T>(
  fn: () => Promise<T>
): Promise<T> {
  const prev = insertBeforeDeleteDefault
  insertBeforeDeleteDefault = true
  try {
    return await fn()
  } finally {
    insertBeforeDeleteDefault = prev
  }
}

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

async function listExistingRows(
  baseUrl: string,
  slug: string,
  versionId: number,
  mba: string
): Promise<any[]> {
  const listParams = buildReplaceListQueryParams(versionId, mba)
  try {
    return await fetchAllXanoPages(baseUrl, listParams, `replace_${slug}`)
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
    return response.ok ? parseListPayload(await response.json()) : []
  }
}

async function deleteRows(
  baseUrl: string,
  slug: string,
  toDelete: any[]
): Promise<void> {
  const deleteFailures: string[] = []
  await Promise.all(
    toDelete.map((row) =>
      lineItemWriteSemaphore.run(async () => {
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
  )

  if (deleteFailures.length > 0) {
    throw new Error(
      `Failed to delete existing ${slug} rows during replace: ${deleteFailures.join("; ")}`
    )
  }
}

async function postRows(baseUrl: string, slug: string, payload: any[]): Promise<any[]> {
  if (payload.length === 0) return []

  const headers = xanoPostHeaders()
  return Promise.all(
    payload.map((row, index) =>
      lineItemWriteSemaphore.run(async () => {
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
  )
}

/**
 * Replace all channel rows for a media_plan_versions.id:
 * GET existing (scoped by mba_number) → DELETE matching version-id rows → POST new rows
 * (or insert-then-delete when `insertBeforeDelete` / mirror default is set).
 *
 * Matching uses media_plan_version === id ONLY — never mp_plannumber/version_number.
 */
export async function replaceChannelLineItems(
  endpoint: string,
  mediaPlanVersionId: number,
  rows: any[],
  mbaNumber: string,
  options?: ReplaceChannelOptions
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
  const existing = await listExistingRows(baseUrl, slug, versionId, mba)
  const toDelete = collectRowsForVersionReplace(existing, versionId)
  const payload = Array.isArray(rows) ? rows : []
  const insertFirst =
    options?.insertBeforeDelete === true ||
    (options?.insertBeforeDelete !== false && insertBeforeDeleteDefault)

  if (insertFirst) {
    // Snapshot ids, POST new rows, then delete the previously snapshotted set.
    const snapshotted = toDelete.map((r) => r.id)
    const results = await postRows(baseUrl, slug, payload)
    const deleteTargets = snapshotted
      .filter((id) => id != null)
      .map((id) => ({ id }))
    if (deleteTargets.length > 0) {
      await deleteRows(baseUrl, slug, deleteTargets)
    }
    return results
  }

  // Legacy: DELETE all collected ids; abort before POST if any fail.
  await deleteRows(baseUrl, slug, toDelete)
  return postRows(baseUrl, slug, payload)
}
