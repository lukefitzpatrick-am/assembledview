/**
 * Reap orphaned staged-but-unpublished version rows for one MBA.
 *
 * FIX2 (lower-risk option): cleanup on the next save of the same master —
 * scoped to the MBA that created the orphans, no cron/ops surface, and
 * runs before next-version calculation so max(all versions)+1 cannot keep
 * climbing on abandoned staged rows.
 *
 * A scheduled sweep would need new infra, a global blast radius, and clock
 * skew/N-hour policy; save-path cleanup is enough for the same-master case.
 */

import axios from "axios"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"
import {
  isUnpublishedStagedVersion,
  parseVersionNumber,
} from "@/lib/mediaplan/publishedVersionGuard"

const MEDIA_PLANS_ENV = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

/** Channel tables that store per-version line items (mirrors clearVersionChildren). */
export const STAGED_CHILD_SLUGS = [
  "media_plan_television",
  "media_plan_newspaper",
  "media_plan_social",
  "media_plan_radio",
  "media_plan_magazines",
  "media_plan_ooh",
  "media_plan_cinema",
  "media_plan_digi_display",
  "media_plan_digi_audio",
  "media_plan_digi_video",
  "media_plan_digi_bvod",
  "media_plan_integrations",
  "media_plan_search",
  "media_plan_prog_display",
  "media_plan_prog_video",
  "media_plan_prog_bvod",
  "media_plan_prog_audio",
  "media_plan_prog_ooh",
  "media_plan_influencers",
  "media_plan_production",
] as const

function mediaPlansUrl(path: string): string {
  return xanoUrl(path, [...MEDIA_PLANS_ENV])
}

function asList(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.items)) return o.items
    if (Array.isArray(o.records)) return o.records
  }
  return []
}

export type ReapUnpublishedResult = {
  publishedVersionNumber: number
  orphanVersionNumbers: number[]
  deletedVersionIds: number[]
  deletedChildCount: number
  errors: string[]
}

function rowMatchesStagedVersion(
  row: any,
  mbaNumber: string,
  versionNumber: number,
  versionId: number | null,
): boolean {
  if (String(row?.mba_number ?? "").trim() !== String(mbaNumber).trim()) return false
  const rowVn = parseVersionNumber(row?.version_number ?? row?.mp_plannumber)
  if (rowVn > 0 && rowVn === versionNumber) return true
  if (versionId != null && versionId > 0) {
    const linked = String(row?.media_plan_version ?? "").trim()
    if (linked && linked === String(versionId)) return true
  }
  return false
}

async function deleteChildrenForVersion(
  mbaNumber: string,
  versionNumber: number,
  versionId: number | null,
  timeoutMs: number,
): Promise<{ deleted: number; errors: string[] }> {
  let deleted = 0
  const errors: string[] = []
  const headers = xanoAuthHeaderRecord()

  for (const slug of STAGED_CHILD_SLUGS) {
    try {
      const { data } = await axios.get(mediaPlansUrl(slug), {
        headers,
        params: {
          mba_number: mbaNumber,
          page: 1,
          per_page: 200,
        },
        timeout: timeoutMs,
        validateStatus: () => true,
      })
      if (data == null || (typeof data === "object" && "error" in (data as object) && (data as any).error)) {
        continue
      }
      const rows = asList(data).filter((row) =>
        rowMatchesStagedVersion(row, mbaNumber, versionNumber, versionId),
      )
      for (const row of rows) {
        const id = Number(row?.id)
        if (!Number.isFinite(id) || id <= 0) continue
        try {
          await axios.delete(`${mediaPlansUrl(slug)}/${id}`, {
            headers,
            timeout: timeoutMs,
          })
          deleted += 1
        } catch (err: any) {
          errors.push(`${slug}/${id}: ${err?.message || "delete failed"}`)
        }
      }
    } catch (err: any) {
      // Missing tables / 404s are fine — not every slug exists for every plan
      const status = err?.response?.status
      if (status !== 404 && status !== 403) {
        errors.push(`${slug}: ${err?.message || "list failed"}`)
      }
    }
  }

  return { deleted, errors }
}

/**
 * Delete staged version rows (and their channel children) whose version_number
 * was never published on the master.
 */
export async function reapUnpublishedStagedVersions(opts: {
  mbaNumber: string
  mediaPlanMasterId: number | string
  publishedVersionNumber: number
  timeoutMs?: number
  /** Pre-fetched versions for this master; if omitted, loads from Xano. */
  allVersions?: Array<{ id?: unknown; version_number?: unknown }>
}): Promise<ReapUnpublishedResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000
  const published = Math.max(0, opts.publishedVersionNumber)
  const errors: string[] = []
  const deletedVersionIds: number[] = []
  const orphanVersionNumbers: number[] = []
  let deletedChildCount = 0

  let versions = opts.allVersions
  if (!versions) {
    try {
      const { data } = await axios.get(mediaPlansUrl("media_plan_versions"), {
        headers: xanoAuthHeaderRecord(),
        params: {
          media_plan_master_id: opts.mediaPlanMasterId,
          page: 1,
          per_page: 100,
        },
        timeout: timeoutMs,
      })
      versions = asList(data)
    } catch (err: any) {
      return {
        publishedVersionNumber: published,
        orphanVersionNumbers: [],
        deletedVersionIds: [],
        deletedChildCount: 0,
        errors: [`list versions: ${err?.message || "failed"}`],
      }
    }
  }

  const orphans = (versions || []).filter((v) =>
    isUnpublishedStagedVersion(v?.version_number, published),
  )

  if (orphans.length === 0) {
    return {
      publishedVersionNumber: published,
      orphanVersionNumbers: [],
      deletedVersionIds: [],
      deletedChildCount: 0,
      errors: [],
    }
  }

  for (const orphan of orphans) {
    const vn = parseVersionNumber(orphan.version_number)
    orphanVersionNumbers.push(vn)

    const versionId = Number(orphan.id)
    const versionIdOrNull = Number.isFinite(versionId) && versionId > 0 ? versionId : null

    const childResult = await deleteChildrenForVersion(
      opts.mbaNumber,
      vn,
      versionIdOrNull,
      timeoutMs,
    )
    deletedChildCount += childResult.deleted
    errors.push(...childResult.errors)

    if (versionIdOrNull != null) {
      try {
        await axios.delete(`${mediaPlansUrl("media_plan_versions")}/${versionId}`, {
          headers: xanoAuthHeaderRecord(),
          timeout: timeoutMs,
        })
        deletedVersionIds.push(versionId)
      } catch (err: any) {
        errors.push(`version ${versionId}: ${err?.message || "delete failed"}`)
      }
    }
  }

  console.info("[reapUnpublishedStagedVersions]", {
    mba_number: opts.mbaNumber,
    publishedVersionNumber: published,
    orphanVersionNumbers,
    deletedVersionIds,
    deletedChildCount,
    errorCount: errors.length,
  })

  return {
    publishedVersionNumber: published,
    orphanVersionNumbers,
    deletedVersionIds,
    deletedChildCount,
    errors,
  }
}
