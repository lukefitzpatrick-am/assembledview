/**
 * plan_presence — fail-soft if migration 0064 is not applied (C-76).
 * Callers use raw sql; do not db.select() this table until 0064 is live.
 */

import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import {
  filterFreshPlanPresence,
  toPlanPresenceOther,
  type PlanPresenceOther,
  type PlanPresencePage,
  type PlanPresenceRow,
} from "@/lib/mediaplan/drafts/presence"

function tablesMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "")
  return /plan_presence|does not exist/i.test(msg)
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  const r = res as { rows?: Record<string, unknown>[] }
  if (Array.isArray(r?.rows)) return r.rows
  if (Array.isArray(res)) return res as Record<string, unknown>[]
  return []
}

function mapRow(r: Record<string, unknown>): PlanPresenceRow {
  const page = r.page === "create" ? "create" : "edit"
  return {
    userId: String(r.user_id),
    userLabel: r.user_label == null ? null : String(r.user_label),
    lastSeenAt: String(r.last_seen_at),
    page,
  }
}

export async function upsertPlanPresence(args: {
  masterId: number
  userId: string
  userLabel?: string | null
  page?: PlanPresencePage
}): Promise<PlanPresenceRow | null> {
  try {
    const db = getDb()
    const page: PlanPresencePage = args.page === "create" ? "create" : "edit"
    const res = await db.execute(sql`
      INSERT INTO plan_presence (
        master_id, user_id, user_label, page, last_seen_at
      ) VALUES (
        ${args.masterId},
        ${args.userId},
        ${args.userLabel ?? null},
        ${page},
        now()
      )
      ON CONFLICT (master_id, user_id) DO UPDATE SET
        user_label = EXCLUDED.user_label,
        page = EXCLUDED.page,
        last_seen_at = now()
      RETURNING *
    `)
    const row = rowsOf(res)[0]
    return row ? mapRow(row) : null
  } catch (err) {
    if (tablesMissing(err)) {
      console.warn("[SM-7] plan_presence missing — apply 0064")
      return null
    }
    throw err
  }
}

export async function listOtherPlanPresence(args: {
  masterId: number
  excludeUserId: string
  now?: Date
}): Promise<PlanPresenceOther[]> {
  try {
    const db = getDb()
    const res = await db.execute(sql`
      SELECT user_id, user_label, page, last_seen_at
      FROM plan_presence
      WHERE master_id = ${args.masterId}
        AND user_id <> ${args.excludeUserId}
        AND last_seen_at > now() - interval '90 seconds'
      ORDER BY last_seen_at DESC
    `)
    const mapped = rowsOf(res).map(mapRow)
    return filterFreshPlanPresence(mapped, {
      excludeUserId: args.excludeUserId,
      now: args.now,
    }).map(toPlanPresenceOther)
  } catch (err) {
    if (tablesMissing(err)) return []
    throw err
  }
}

export async function deletePlanPresence(args: {
  masterId: number
  userId: string
}): Promise<void> {
  try {
    const db = getDb()
    await db.execute(sql`
      DELETE FROM plan_presence
      WHERE master_id = ${args.masterId} AND user_id = ${args.userId}
    `)
  } catch (err) {
    if (tablesMissing(err)) return
    throw err
  }
}
