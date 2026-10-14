/**
 * report_runs and report_digest_sends (migration 0095). SQL is source of truth.
 * 0097 is applied: requested_by_email, and the two partial unique indexes.
 * RLS is on, with no policies.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { clients } from "./ported"

export const reportRuns = pgTable(
  "report_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull().default("monthly_campaign"),
    mbaNumber: text("mba_number").notNull(),
    clientId: bigint("client_id", { mode: "number" }),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    blobPathname: text("blob_pathname"),
    fileName: text("file_name"),
    error: text("error"),
    skipReason: text("skip_reason"),
    commentaryGenerated: boolean("commentary_generated"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "string" }),
    requestedByEmail: text("requested_by_email"),
  },
  (table) => [
    check(
      "report_runs_status_check",
      sql`${table.status} = ANY (ARRAY['queued'::text, 'generating'::text, 'generated'::text, 'failed'::text, 'skipped'::text])`,
    ),
    foreignKey({
      columns: [table.clientId],
      foreignColumns: [clients.id],
      name: "report_runs_client_id_fkey",
    }),
    uniqueIndex("uq_report_runs_kind_mba_period")
      .on(table.kind, table.mbaNumber, table.periodStart)
      .where(sql`${table.kind} <> 'on_demand_deck'`),
    uniqueIndex("uq_report_runs_on_demand_inflight")
      .on(table.kind, table.mbaNumber, table.periodStart)
      .where(
        sql`${table.kind} = 'on_demand_deck' AND ${table.status} IN ('queued', 'generating')`,
      ),
    index("idx_report_runs_kind_period_status").on(
      table.kind,
      table.periodStart,
      table.status,
    ),
  ],
)

export const reportDigestSends = pgTable(
  "report_digest_sends",
  {
    kind: text("kind").notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    recipients: text("recipients").array().notNull(),
    runCount: integer("run_count").notNull(),
  },
  (table) => [
    primaryKey({
      name: "report_digest_sends_pkey",
      columns: [table.kind, table.periodStart],
    }),
  ],
)
