/**
 * Plan C S2-P3 — replace-set write protocol for all 20 line tables.
 *
 * Per (channel table, version):
 *   1. Stage incoming rows (all carry line_uid, superseded=false)
 *   2. Verify staged count == payload count
 *   3. Mark prior live rows superseded=true via bulk_supersede
 *      (S2-P1 choice; fallback delete only when transport.deletePrior is used
 *       for tables that lack supersede — not the default channel path)
 *   4. On any failure after stage: delete staged rows and abort (hard fail)
 *
 * Flag PLANC_REPLACE_SET=off|log|on
 *   off  — callers use legacy delete-then-POST
 *   log  — protocol checks run; legacy write; log [planc-replaceset] discrepancies
 *   on   — this protocol IS the write path
 */

import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { getXanoBaseUrl, xanoAuthHeaders, xanoPostHeaders } from "@/lib/api/xano"
import {
  buildReplaceListQueryParams,
  collectRowsForVersionReplace,
  isLiveChannelRow,
} from "@/lib/api/replaceChannelLineItems.pure"
import { ensureLineUids, pickLineUid } from "@/lib/mediaplan/lineUid"

export const PLANC_REPLACESET_LOG_PREFIX = "[planc-replaceset]"

export type PlanCReplaceSetMode = "off" | "log" | "on"

export function resolvePlanCReplaceSetMode(
  raw: string | undefined = process.env.PLANC_REPLACE_SET
): PlanCReplaceSetMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (v === "log" || v === "on") return v
  return "off"
}

export type ReplaceSetRow = Record<string, unknown> & {
  id?: number | string
  line_uid?: string
  superseded?: boolean
  media_plan_version?: number | string
}

export type ReplaceSetTransport = {
  list(versionId: number, mbaNumber: string): Promise<ReplaceSetRow[]>
  stage(rows: ReplaceSetRow[]): Promise<ReplaceSetRow[]>
  bulkSupersede(ids: Array<number | string>): Promise<void>
  deleteRows(ids: Array<number | string>): Promise<void>
}

export type ReplaceSetResult = {
  staged: ReplaceSetRow[]
  supersededIds: Array<number | string>
  mode: "replace-set"
}

export type ReplaceSetLogCheck = {
  table: string
  versionId: number
  payloadCount: number
  priorLiveCount: number
  payloadLineUids: string[]
  duplicateLineUids: string[]
  missingLineUids: number
}

function getMediaPlansBaseUrl(): string {
  if (typeof window !== "undefined") return "/api/media_plans"
  return getXanoBaseUrl(["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
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

function parseListPayload(data: unknown): ReplaceSetRow[] {
  if (Array.isArray(data)) return data as ReplaceSetRow[]
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: ReplaceSetRow[] }).items
  }
  return []
}

export function analyseReplaceSetPayload(rows: unknown[]): {
  prepared: ReplaceSetRow[]
  duplicateLineUids: string[]
  missingLineUids: number
  lineUids: string[]
} {
  const prepared = ensureLineUids(
    (Array.isArray(rows) ? rows : []).map((r) =>
      r && typeof r === "object" ? { ...(r as Record<string, unknown>) } : {}
    )
  ) as ReplaceSetRow[]

  const seen = new Set<string>()
  const duplicateLineUids: string[] = []
  let missingLineUids = 0
  const lineUids: string[] = []

  for (const row of prepared) {
    const uid = pickLineUid(row)
    if (!uid) {
      missingLineUids += 1
      continue
    }
    lineUids.push(uid)
    if (seen.has(uid)) {
      if (!duplicateLineUids.includes(uid)) duplicateLineUids.push(uid)
    } else {
      seen.add(uid)
    }
  }

  return { prepared, duplicateLineUids, missingLineUids, lineUids }
}

export function createXanoReplaceSetTransport(table: string): ReplaceSetTransport {
  const slug = String(table || "").replace(/^\/+|\/+$/g, "")
  const baseUrl = `${getMediaPlansBaseUrl()}/${slug}`

  return {
    async list(versionId, mbaNumber) {
      const listParams = buildReplaceListQueryParams(versionId, mbaNumber)
      let existing: ReplaceSetRow[] = []
      try {
        existing = (await fetchAllXanoPages(
          baseUrl,
          listParams,
          `replaceset_${slug}`
        )) as ReplaceSetRow[]
      } catch {
        const qs = new URLSearchParams({
          mba_number: listParams.mba_number,
          media_plan_version: String(listParams.media_plan_version),
        })
        const response = await fetch(`${baseUrl}?${qs.toString()}`, {
          headers: xanoAuthHeaders(),
        })
        if (!response.ok && response.status !== 404) {
          throw new Error(`Failed to list ${slug} for replace-set: ${await extractErrorMessage(response)}`)
        }
        existing = response.ok ? parseListPayload(await response.json()) : []
      }
      return collectRowsForVersionReplace(existing, versionId) as ReplaceSetRow[]
    },

    async stage(rows) {
      if (rows.length === 0) return []
      const headers = xanoPostHeaders()
      const results: ReplaceSetRow[] = []
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index]
        const response = await fetch(baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(row),
        })
        if (!response.ok) {
          throw new Error(
            `Failed to stage ${slug} row ${index + 1}: ${await extractErrorMessage(response)}`
          )
        }
        const contentType = response.headers.get("content-type") || ""
        if (contentType.includes("application/json")) {
          const created = (await response.json()) as ReplaceSetRow
          results.push(created && typeof created === "object" ? created : { ...row })
        } else {
          results.push({ ...row })
        }
      }
      return results
    },

    async bulkSupersede(ids) {
      if (ids.length === 0) return
      const response = await fetch(`${baseUrl}/bulk_supersede`, {
        method: "PATCH",
        headers: xanoPostHeaders(),
        body: JSON.stringify({ ids, superseded: true }),
      })
      if (!response.ok) {
        throw new Error(
          `Failed bulk_supersede on ${slug}: ${await extractErrorMessage(response)}`
        )
      }
    },

    async deleteRows(ids) {
      const failures: string[] = []
      await Promise.all(
        ids.map(async (id) => {
          const response = await fetch(`${baseUrl}/${encodeURIComponent(String(id))}`, {
            method: "DELETE",
            headers: xanoAuthHeaders(),
          })
          if (!response.ok && response.status !== 404) {
            failures.push(`${slug}/${id}: ${await extractErrorMessage(response)}`)
          }
        })
      )
      if (failures.length > 0) {
        throw new Error(`Failed to delete rows on ${slug}: ${failures.join("; ")}`)
      }
    },
  }
}

/**
 * Pure check used by log mode and preflight: describe what replace-set would see.
 */
export function buildReplaceSetLogCheck(args: {
  table: string
  versionId: number
  rows: unknown[]
  priorLive: ReplaceSetRow[]
}): ReplaceSetLogCheck {
  const analysed = analyseReplaceSetPayload(args.rows)
  return {
    table: args.table,
    versionId: args.versionId,
    payloadCount: analysed.prepared.length,
    priorLiveCount: args.priorLive.filter(isLiveChannelRow).length,
    payloadLineUids: analysed.lineUids,
    duplicateLineUids: analysed.duplicateLineUids,
    missingLineUids: analysed.missingLineUids,
  }
}

/**
 * Execute replace-set for one (table, version). Hard-fails with staged cleanup.
 */
export async function replaceSetForChannel(args: {
  table: string
  mediaPlanVersionId: number
  mbaNumber: string
  rows: unknown[]
  transport?: ReplaceSetTransport
}): Promise<ReplaceSetResult> {
  const versionId = Number(args.mediaPlanVersionId)
  if (!Number.isFinite(versionId) || versionId <= 0) {
    throw new Error(`Invalid media_plan_version id: ${args.mediaPlanVersionId}`)
  }
  const mba = String(args.mbaNumber ?? "").trim()
  if (!mba) {
    throw new Error("replaceSetForChannel requires mba_number")
  }

  const transport = args.transport ?? createXanoReplaceSetTransport(args.table)
  const analysed = analyseReplaceSetPayload(args.rows)

  if (analysed.missingLineUids > 0) {
    throw new Error(
      `replace-set ${args.table}: ${analysed.missingLineUids} row(s) missing line_uid`
    )
  }
  if (analysed.duplicateLineUids.length > 0) {
    throw new Error(
      `replace-set ${args.table}: duplicate line_uid in payload: ${analysed.duplicateLineUids.join(", ")}`
    )
  }

  const priorAll = await transport.list(versionId, mba)
  const priorLive = priorAll.filter(isLiveChannelRow)
  const priorIds = priorLive
    .map((r) => r.id)
    .filter((id): id is number | string => id != null && String(id).trim() !== "")

  const toStage = analysed.prepared.map((row) => ({
    ...row,
    media_plan_version: versionId,
    mba_number: mba,
    superseded: false,
    line_uid: pickLineUid(row),
  }))

  let staged: ReplaceSetRow[] = []
  try {
    staged = await transport.stage(toStage)
    if (staged.length !== toStage.length) {
      throw new Error(
        `replace-set ${args.table}: staged count ${staged.length} != payload ${toStage.length}`
      )
    }

    // Prefer ids returned from POST; fall back to re-list diff if ids absent.
    const stagedIds = staged
      .map((r) => r.id)
      .filter((id): id is number | string => id != null && String(id).trim() !== "")

    if (stagedIds.length !== toStage.length && toStage.length > 0) {
      const after = await transport.list(versionId, mba)
      const liveAfter = after.filter(isLiveChannelRow)
      if (liveAfter.length < priorLive.length + toStage.length) {
        throw new Error(
          `replace-set ${args.table}: verify failed — live rows ${liveAfter.length} < expected ${priorLive.length + toStage.length}`
        )
      }
    }

    await transport.bulkSupersede(priorIds)
  } catch (error) {
    const stagedIds = staged
      .map((r) => r.id)
      .filter((id): id is number | string => id != null && String(id).trim() !== "")
    if (stagedIds.length > 0) {
      try {
        await transport.deleteRows(stagedIds)
      } catch (cleanupError) {
        console.error(PLANC_REPLACESET_LOG_PREFIX, {
          phase: "staged-cleanup-failed",
          table: args.table,
          versionId,
          stagedIds,
          message:
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        })
      }
    }
    throw error
  }

  return {
    staged,
    supersededIds: priorIds,
    mode: "replace-set",
  }
}

/**
 * Log-mode shadow check: compare prior live vs payload; never writes via protocol.
 */
export async function logReplaceSetShadow(args: {
  table: string
  mediaPlanVersionId: number
  mbaNumber: string
  rows: unknown[]
  transport?: ReplaceSetTransport
}): Promise<ReplaceSetLogCheck> {
  const versionId = Number(args.mediaPlanVersionId)
  const mba = String(args.mbaNumber ?? "").trim()
  const transport = args.transport ?? createXanoReplaceSetTransport(args.table)
  let priorLive: ReplaceSetRow[] = []
  try {
    const priorAll = await transport.list(versionId, mba)
    priorLive = priorAll.filter(isLiveChannelRow)
  } catch (error) {
    console.warn(PLANC_REPLACESET_LOG_PREFIX, {
      phase: "shadow-list-failed",
      table: args.table,
      versionId,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const check = buildReplaceSetLogCheck({
    table: args.table,
    versionId,
    rows: args.rows,
    priorLive,
  })

  if (
    check.duplicateLineUids.length > 0 ||
    check.missingLineUids > 0
  ) {
    console.warn(PLANC_REPLACESET_LOG_PREFIX, {
      phase: "payload-issue",
      ...check,
    })
  } else {
    console.warn(PLANC_REPLACESET_LOG_PREFIX, {
      phase: "shadow-ok",
      table: check.table,
      versionId: check.versionId,
      payloadCount: check.payloadCount,
      priorLiveCount: check.priorLiveCount,
    })
  }

  return check
}
