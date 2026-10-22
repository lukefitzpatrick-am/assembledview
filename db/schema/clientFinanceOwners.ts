/**
 * client_finance_owners (migration 0105, FP-6). SQL is source of truth.
 * 0105 is authored and not applied. Do not db.select() this table until
 * migration_markers contains 0105_client_finance_owners (C-76).
 * Reads and writes go through lib/finance/financeOwnersStore.ts, which
 * reports not-ready while the table is missing. RLS on; no ava_readonly grant.
 */
import { bigint, index, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { teamMembers } from "./codex"
import { clients } from "./ported"

export const clientFinanceOwners = pgTable(
  "client_finance_owners",
  {
    clientId: bigint("client_id", { mode: "number" })
      .primaryKey()
      .references(() => clients.id, { onDelete: "cascade" }),
    teamMemberId: bigint("team_member_id", { mode: "number" }).references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedBy: bigint("updated_by", { mode: "number" }),
    updatedByName: text("updated_by_name"),
  },
  (table) => [index("client_finance_owners_team_member_idx").on(table.teamMemberId)],
)
