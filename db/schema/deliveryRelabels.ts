/**
 * delivery_relabels + delivery_relabel_log (migration 0085). SQL is source
 * of truth; this mirror is for generate/diff fidelity. RLS is on. No
 * ava_readonly grant. Do not db.select() these tables against live Postgres
 * before applying (C-76).
 */
import { index, integer, jsonb, pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core"

export const deliveryRelabels = pgTable(
  "delivery_relabels",
  {
    id: serial("id").primaryKey(),
    channel: text("channel").notNull(),
    platformEntityId: text("platform_entity_id").notNull(),
    entityName: text("entity_name"),
    fromLineItemId: text("from_line_item_id"),
    toLineItemId: text("to_line_item_id").notNull(),
    mbaNumber: text("mba_number").notNull(),
    dateFrom: date("date_from", { mode: "string" }),
    dateTo: date("date_to", { mode: "string" }),
    reason: text("reason").notNull(),
    actorEmail: text("actor_email").notNull(),
    status: text("status").notNull().default("applied"),
    beforeState: jsonb("before_state").notNull(),
    applyResult: jsonb("apply_result"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    revertedAt: timestamp("reverted_at", { withTimezone: true, mode: "string" }),
    revertedByEmail: text("reverted_by_email"),
  },
  (table) => [
    index("delivery_relabels_mba_created_idx").on(table.mbaNumber, table.createdAt.desc()),
    index("delivery_relabels_entity_idx").on(
      table.channel,
      table.platformEntityId,
      table.createdAt.desc(),
    ),
  ],
)

export const deliveryRelabelLog = pgTable(
  "delivery_relabel_log",
  {
    id: serial("id").primaryKey(),
    relabelId: integer("relabel_id").references(() => deliveryRelabels.id),
    action: text("action").notNull(),
    actorEmail: text("actor_email").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("delivery_relabel_log_relabel_idx").on(table.relabelId, table.createdAt.desc())],
)
