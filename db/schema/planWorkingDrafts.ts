/**
 * plan_working_drafts (migration 0012). SQL is source of truth; this mirror
 * is for generate/diff fidelity. RLS is on. Existing callers use raw `sql`
 * templates (`lib/mediaplan/drafts/serverStore.ts`); this pack does not
 * change them.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { mediaPlanMasters, mediaPlanVersions } from "./planCore"

export const planWorkingDrafts = pgTable(
  "plan_working_drafts",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    masterId: bigint("master_id", { mode: "number" })
      .notNull()
      .references(() => mediaPlanMasters.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userLabel: text("user_label"),
    baseVersionId: bigint("base_version_id", { mode: "number" }).references(
      () => mediaPlanVersions.id,
      { onDelete: "set null" },
    ),
    draftStateJson: jsonb("draft_state_json").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    unique("uq_plan_working_drafts_master_user").on(table.masterId, table.userId),
    index("idx_plan_working_drafts_master").on(table.masterId),
    index("idx_plan_working_drafts_updated").on(table.updatedAt),
  ],
)
