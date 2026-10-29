import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"

/**
 * `view_as_audit` (migration 0108, AUTHOR ONLY until Luke applies it).
 * One row per start, exit, expire and blocked_write. Raw SQL: the table has
 * no Drizzle mirror yet (see the 0108 header).
 */
export type ViewAsAuditAction = "start" | "exit" | "expire" | "blocked_write"

export type ViewAsAuditRow = {
  action: ViewAsAuditAction
  adminSub: string
  adminEmail: string | null
  clientId: number | null
  clientSlug: string
  asUserId?: string | null
  path?: string | null
  method?: string | null
  durationMinutes?: number | null
  userAgent?: string | null
}

function clip(value: string | null | undefined, max: number): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed.slice(0, max) : null
}

/** Throws on failure. The start route refuses to start without an audit row. */
export async function insertViewAsAudit(row: ViewAsAuditRow): Promise<void> {
  await getDb().execute(sql`
    INSERT INTO public.view_as_audit
      (admin_sub, admin_email, client_id, client_slug, as_user_id, action, path, method, duration_minutes, user_agent)
    VALUES (
      ${clip(row.adminSub, 200)},
      ${clip(row.adminEmail, 320)},
      ${row.clientId},
      ${clip(row.clientSlug, 120)},
      ${clip(row.asUserId ?? null, 200)},
      ${row.action},
      ${clip(row.path ?? null, 500)},
      ${clip(row.method ?? null, 10)},
      ${row.durationMinutes ?? null},
      ${clip(row.userAgent ?? null, 500)}
    )
  `)
}

/** Exit, expire and blocked_write: never block the caller on the audit write. */
export async function insertViewAsAuditSoft(row: ViewAsAuditRow): Promise<boolean> {
  try {
    await insertViewAsAudit(row)
    return true
  } catch (err) {
    console.error("[view-as] audit write failed", { action: row.action, slug: row.clientSlug, err })
    return false
  }
}
