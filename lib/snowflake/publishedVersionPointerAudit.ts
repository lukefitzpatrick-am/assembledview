import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import type { PublishedTipPointer } from "@/lib/snowflake/tipScopeLineItems"

export type PointerAuditIssue =
  | {
      kind: "null_published_version_id"
      mba_number: string
      master_id: number
      latest_booked_version_id: number | null
      latest_booked_version_number: number | null
    }
  | {
      kind: "stale_published_version_id"
      mba_number: string
      master_id: number
      published_version_id: number
      published_version_number: number
      published_campaign_status: string | null
      latest_booked_version_id: number
      latest_booked_version_number: number
      latest_booked_campaign_status: string | null
    }

export type PublishedVersionPointerAudit = {
  tip_pointers: PublishedTipPointer[]
  masters_total: number
  tips_with_pointer: number
  null_published: PointerAuditIssue[]
  stale_vs_latest_booked: PointerAuditIssue[]
}

type MasterPointerRow = {
  master_id: number
  mba_number: string
  published_version_id: number | null
  published_version_number: number | null
  published_campaign_status: string | null
  latest_booked_version_id: number | null
  latest_booked_version_number: number | null
  latest_booked_campaign_status: string | null
}

/**
 * Load every master's published tip pointer + whether it matches the latest
 * booked/approved/completed version (by version_number).
 */
export async function auditPublishedVersionPointers(): Promise<PublishedVersionPointerAudit> {
  const db = getDb()

  const result = await db.execute(sql`
    WITH booked AS (
      SELECT
        v.master_id,
        v.id AS version_id,
        v.version_number,
        v.campaign_status,
        ROW_NUMBER() OVER (
          PARTITION BY v.master_id
          ORDER BY v.version_number DESC, v.id DESC
        ) AS rn
      FROM media_plan_versions v
      WHERE lower(trim(coalesce(v.campaign_status, ''))) IN ('booked', 'approved', 'completed')
    ),
    latest_booked AS (
      SELECT
        master_id,
        version_id AS latest_booked_version_id,
        version_number AS latest_booked_version_number,
        campaign_status AS latest_booked_campaign_status
      FROM booked
      WHERE rn = 1
    )
    SELECT
      m.id AS master_id,
      m.mba_number,
      m.published_version_id,
      pv.version_number AS published_version_number,
      pv.campaign_status AS published_campaign_status,
      lb.latest_booked_version_id,
      lb.latest_booked_version_number,
      lb.latest_booked_campaign_status
    FROM media_plan_masters m
    LEFT JOIN media_plan_versions pv ON pv.id = m.published_version_id
    LEFT JOIN latest_booked lb ON lb.master_id = m.id
    ORDER BY m.mba_number
  `)

  const rows = (
    (result as { rows?: MasterPointerRow[] }).rows ?? result
  ) as MasterPointerRow[]

  const tip_pointers: PublishedTipPointer[] = []
  const null_published: PointerAuditIssue[] = []
  const stale_vs_latest_booked: PointerAuditIssue[] = []

  for (const row of Array.isArray(rows) ? rows : []) {
    const mba = String(row.mba_number ?? "").trim()
    const masterId = Number(row.master_id)
    const publishedId =
      row.published_version_id == null ? null : Number(row.published_version_id)
    const publishedVn =
      row.published_version_number == null
        ? null
        : Number(row.published_version_number)
    const latestId =
      row.latest_booked_version_id == null
        ? null
        : Number(row.latest_booked_version_id)
    const latestVn =
      row.latest_booked_version_number == null
        ? null
        : Number(row.latest_booked_version_number)

    if (publishedId == null || !Number.isFinite(publishedId) || publishedVn == null) {
      null_published.push({
        kind: "null_published_version_id",
        mba_number: mba,
        master_id: masterId,
        latest_booked_version_id: latestId,
        latest_booked_version_number: latestVn,
      })
      continue
    }

    tip_pointers.push({
      mba_number: mba,
      master_id: masterId,
      published_version_id: publishedId,
      version_number: publishedVn,
      published_campaign_status: row.published_campaign_status,
    })

    if (
      latestId != null &&
      latestVn != null &&
      (latestId !== publishedId || latestVn !== publishedVn)
    ) {
      stale_vs_latest_booked.push({
        kind: "stale_published_version_id",
        mba_number: mba,
        master_id: masterId,
        published_version_id: publishedId,
        published_version_number: publishedVn,
        published_campaign_status: row.published_campaign_status,
        latest_booked_version_id: latestId,
        latest_booked_version_number: latestVn,
        latest_booked_campaign_status: row.latest_booked_campaign_status,
      })
    }
  }

  return {
    tip_pointers,
    masters_total: rows.length,
    tips_with_pointer: tip_pointers.length,
    null_published,
    stale_vs_latest_booked,
  }
}
