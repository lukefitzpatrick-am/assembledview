/**
 * client_platform_accounts (migration 0096). SQL is source of truth.
 * The platform check includes ga4 and gsc. Requires 0098 applied.
 * RLS is on, with no policies. Do not db.select() this table against live
 * Postgres before 0096 is applied (C-76). Do not rely on ga4 or gsc until
 * 0098 is applied.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { clients } from "./ported"

export const clientPlatformAccounts = pgTable(
  "client_platform_accounts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    clientId: bigint("client_id", { mode: "number" })
      .notNull()
      .references(() => clients.id),
    platform: text("platform").notNull(),
    accountRef: text("account_ref").notNull(),
    label: text("label"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    check(
      "client_platform_accounts_platform_chk",
      sql`${table.platform} in ('meta_ads','google_ads','cm360','dv360','tiktok','reddit','taboola','vistar','channel_factory','linkedin','pinterest','snapchat','ga4','gsc')`,
    ),
    uniqueIndex("uq_client_platform_accounts_active_ref")
      .on(table.platform, sql`lower(${table.accountRef})`)
      .where(sql`${table.active}`),
    index("idx_client_platform_accounts_client_id").on(table.clientId),
  ],
)
