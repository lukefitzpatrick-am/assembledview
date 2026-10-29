/**
 * view_as_audit (migration 0108, View as client). SQL is source of truth.
 * 0108 is authored and not applied. The writer (lib/auth/viewAsAudit.ts) uses
 * raw SQL; POST /api/admin/view-as refuses to start a client view until the
 * table exists. RLS on; no ava_readonly grant.
 */
import { sql } from "drizzle-orm"
import { bigint, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const viewAsAudit = pgTable(
  "view_as_audit",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    adminSub: text("admin_sub").notNull(),
    adminEmail: text("admin_email"),
    clientId: bigint("client_id", { mode: "number" }),
    clientSlug: text("client_slug").notNull(),
    asUserId: text("as_user_id"),
    action: text("action").notNull(),
    path: text("path"),
    method: text("method"),
    durationMinutes: integer("duration_minutes"),
    userAgent: text("user_agent"),
  },
  (table) => [
    check("view_as_audit_action_check", sql`${table.action} IN ('start', 'exit', 'expire', 'blocked_write')`),
    check(
      "view_as_audit_duration_check",
      sql`${table.durationMinutes} IS NULL OR ${table.durationMinutes} IN (30, 60, 120)`,
    ),
    check(
      "view_as_audit_ids_check",
      sql`length(btrim(${table.adminSub})) > 0 AND length(btrim(${table.clientSlug})) > 0`,
    ),
    index("idx_view_as_audit_created_at").on(table.createdAt.desc()),
    index("idx_view_as_audit_slug_created_at").on(table.clientSlug, table.createdAt.desc()),
  ],
)
