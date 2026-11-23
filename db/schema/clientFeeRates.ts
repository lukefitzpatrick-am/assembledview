/**
 * client_fee_rates (migration 0120, S4). SQL is source of truth.
 * Client fee rate changes with an effective-from Melbourne date. The rate on a
 * date is the latest row on or before it, else the clients column
 * (clientFeeRateOn in lib/finance/clientFeeChannels.ts). Read and written only
 * through lib/data/clientFeeRates.ts, behind the switch client_fee_rate_history,
 * which needs the marker 0120_client_fee_rates. RLS on; no ava_readonly grant.
 */
import { sql } from "drizzle-orm"
import { bigint, check, date, numeric, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"

import { clients } from "./ported"

export const clientFeeRates = pgTable(
  "client_fee_rates",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    clientId: bigint("client_id", { mode: "number" })
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** One of the 20 client fee columns (CLIENT_FEE_FIELDS). */
    feeField: text("fee_field").notNull(),
    /** Whole percent, 0 to 100 (20 = 20%), like the clients columns. */
    ratePct: numeric("rate_pct").notNull(),
    /** Melbourne civil date the rate takes effect from (YYYY-MM-DD). */
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (table) => [
    check(
      "client_fee_rates_fee_field_check",
      sql`${table.feeField} IN ('feetelevision', 'feeradio', 'feenewspapers', 'feemagazines', 'feeooh', 'feecinema', 'feedigidisplay', 'feedigiaudio', 'feedigivideo', 'feebvod', 'feeintegration', 'feesearch', 'feesocial', 'feeprogdisplay', 'feeprogvideo', 'feeprogbvod', 'feeprogaudio', 'feeprogooh', 'feeinfluencers', 'feecontentcreator')`,
    ),
    check("client_fee_rates_rate_pct_check", sql`${table.ratePct} >= 0 AND ${table.ratePct} <= 100`),
    unique("client_fee_rates_client_field_from_unique").on(table.clientId, table.feeField, table.effectiveFrom),
  ],
)
