/**
 * plan_presence (migration 0064). SQL is source of truth; this mirror
 * is for generate/diff fidelity. RLS is on. Runtime uses raw `sql`
 * (`lib/mediaplan/drafts/presenceStore.ts`) and fail-softs until applied.
 * Do not db.select() this table against live Postgres before applying (C-76).
 */
import {
  bigint,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { mediaPlanMasters } from "./planCore"

export const planPresence = pgTable(
  "plan_presence",
  {
    masterId: bigint("master_id", { mode: "number" })
      .notNull()
      .references(() => mediaPlanMasters.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userLabel: text("user_label"),
    page: text("page").notNull().default("edit"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.masterId, table.userId] }),
    index("idx_plan_presence_last_seen").on(table.lastSeenAt),
  ],
)
