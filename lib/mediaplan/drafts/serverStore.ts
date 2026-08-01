/**
 * Tier 2 — server working drafts (Postgres). Fail-soft if migration not applied.
 */

import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import type { PlanDraftStateV1, PlanWorkingDraftRow } from "@/lib/mediaplan/drafts/types"
import { shouldNudgeStaleDraft } from "@/lib/mediaplan/drafts/pill"

function tablesMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "")
  return /plan_working_drafts|does not exist/i.test(msg)
}

function mapRow(r: Record<string, unknown>): PlanWorkingDraftRow {
  return {
    id: Number(r.id),
    masterId: Number(r.master_id),
    userId: String(r.user_id),
    userLabel: r.user_label == null ? null : String(r.user_label),
    baseVersionId: r.base_version_id == null ? null : Number(r.base_version_id),
    draftStateJson: (r.draft_state_json ?? { v: 1 }) as PlanDraftStateV1,
    updatedAt: String(r.updated_at),
  }
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  const r = res as { rows?: Record<string, unknown>[] }
  if (Array.isArray(r?.rows)) return r.rows
  if (Array.isArray(res)) return res as Record<string, unknown>[]
  return []
}

export async function upsertWorkingDraft(args: {
  masterId: number
  userId: string
  userLabel?: string | null
  baseVersionId: number | null
  state: PlanDraftStateV1
}): Promise<PlanWorkingDraftRow | null> {
  try {
    const db = getDb()
    const res = await db.execute(sql`
      INSERT INTO plan_working_drafts (
        master_id, user_id, user_label, base_version_id, draft_state_json, updated_at
      ) VALUES (
        ${args.masterId},
        ${args.userId},
        ${args.userLabel ?? null},
        ${args.baseVersionId},
        ${JSON.stringify(args.state)}::jsonb,
        now()
      )
      ON CONFLICT (master_id, user_id) DO UPDATE SET
        user_label = EXCLUDED.user_label,
        base_version_id = EXCLUDED.base_version_id,
        draft_state_json = EXCLUDED.draft_state_json,
        updated_at = now()
      RETURNING *
    `)
    const row = rowsOf(res)[0]
    return row ? mapRow(row) : null
  } catch (err) {
    if (tablesMissing(err)) {
      console.warn("[PC7] plan_working_drafts missing — apply 0012")
      return null
    }
    throw err
  }
}

export async function getWorkingDraft(args: {
  masterId: number
  userId: string
}): Promise<PlanWorkingDraftRow | null> {
  try {
    const db = getDb()
    const res = await db.execute(sql`
      SELECT * FROM plan_working_drafts
      WHERE master_id = ${args.masterId} AND user_id = ${args.userId}
      LIMIT 1
    `)
    const row = rowsOf(res)[0]
    return row ? mapRow(row) : null
  } catch (err) {
    if (tablesMissing(err)) return null
    throw err
  }
}

export async function listOtherWorkingDrafts(args: {
  masterId: number
  excludeUserId: string
}): Promise<PlanWorkingDraftRow[]> {
  try {
    const db = getDb()
    const res = await db.execute(sql`
      SELECT * FROM plan_working_drafts
      WHERE master_id = ${args.masterId}
        AND user_id <> ${args.excludeUserId}
      ORDER BY updated_at DESC
    `)
    return rowsOf(res).map(mapRow)
  } catch (err) {
    if (tablesMissing(err)) return []
    throw err
  }
}

export async function deleteWorkingDraft(args: {
  masterId: number
  userId: string
}): Promise<void> {
  try {
    const db = getDb()
    await db.execute(sql`
      DELETE FROM plan_working_drafts
      WHERE master_id = ${args.masterId} AND user_id = ${args.userId}
    `)
  } catch (err) {
    if (tablesMissing(err)) return
    throw err
  }
}

/** 30-day nudge via app_notifications when PC5 table exists; else console TODO. */
export async function nudgeStaleDrafts(now = new Date()): Promise<number> {
  try {
    const db = getDb()
    const res = await db.execute(sql`
      SELECT id, master_id, user_id, user_label, updated_at, draft_state_json
      FROM plan_working_drafts
      WHERE updated_at < now() - interval '30 days'
    `)
    let n = 0
    for (const row of rowsOf(res)) {
      const updatedAt = String(row.updated_at)
      if (!shouldNudgeStaleDraft({ updatedAt, now })) continue
      const mba =
        (row.draft_state_json as { mbaNumber?: string } | null)?.mbaNumber ?? ""
      try {
        await db.execute(sql`
          INSERT INTO app_notifications (audience, kind, payload)
          VALUES (
            ${String(row.user_id)},
            'plan_draft_stale_30d',
            ${JSON.stringify({
              masterId: Number(row.master_id),
              mbaNumber: mba,
              updatedAt,
            })}::jsonb
          )
        `)
        n += 1
      } catch {
        console.log(
          "[PC7 TODO] 30-day draft nudge (app_notifications unavailable)",
          { masterId: row.master_id, userId: row.user_id, updatedAt }
        )
      }
    }
    return n
  } catch (err) {
    if (tablesMissing(err)) {
      console.log("[PC7 TODO] plan_working_drafts missing — skip 30d nudge")
      return 0
    }
    throw err
  }
}

export async function resolvePublishedVersionId(masterId: number): Promise<number | null> {
  const db = getDb()
  const res = await db.execute(sql`
    SELECT published_version_id AS id
    FROM media_plan_masters
    WHERE id = ${masterId}
    LIMIT 1
  `)
  const row = rowsOf(res)[0]
  return row?.id == null ? null : Number(row.id)
}

export async function countVersionLines(versionId: number): Promise<number> {
  const db = getDb()
  const res = await db.execute(sql`
    SELECT count(*)::int AS n FROM line_items WHERE version_id = ${versionId}
  `)
  return Number(rowsOf(res)[0]?.n ?? 0)
}
