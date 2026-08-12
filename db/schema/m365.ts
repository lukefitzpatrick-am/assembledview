/**
 * M365 Graph provisioning audit log (migration 0021).
 * SQL is source of truth; this mirror is for generate/diff fidelity.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

export type M365ProvisioningOutcome = "success" | "failure" | "skipped"

export const m365ProvisioningLog = pgTable(
  "m365_provisioning_log",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    requestId: text("request_id"),
    actor: text("actor"),
    outcome: text("outcome").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "m365_provisioning_log_outcome_check",
      sql`${table.outcome} IN ('success', 'failure', 'skipped')`,
    ),
    index("idx_m365_provisioning_log_created").on(table.createdAt.desc()),
    index("idx_m365_provisioning_log_entity").on(table.entityType, table.entityId),
    index("idx_m365_provisioning_log_request")
      .on(table.requestId)
      .where(sql`${table.requestId} IS NOT NULL`),
  ],
)
