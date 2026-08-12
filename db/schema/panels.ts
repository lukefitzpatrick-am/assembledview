/**
 * OOH panel / pack detail (migration 0023) + per-period flights (0027).
 * ONE panels table for both buy shapes: buy_granularity 'panel' (1:1) or 'pack' (1:N).
 *
 * No FK from panels to a line-item parent — line items live across ~20 per-channel
 * tables; join on the line_item_id text string. No money columns on panels or
 * flights (spend stays on the burst / line item).
 * mba_number is lowercase by DB CHECK — do not fight it in app code.
 *
 * line_item_panel_flights letter convention (matches ingest bursts):
 * paid → is_live; bonus/bonus_display → is_live+is_bonus; N/A·C/C·blank·unmapped → no row.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

export type LineItemPanelBuyGranularity = "panel" | "pack"

export const lineItemPanels = pgTable(
  "line_item_panels",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    /** Join key only — no FK; line items span per-channel tables. */
    lineItemId: text("line_item_id").notNull(),
    mbaNumber: text("mba_number").notNull(),
    buyGranularity: text("buy_granularity").notNull(),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    publisherFormatName: text("publisher_format_name"),
    state: text("state"),
    siteNumber: text("site_number"),
    addressOrPackDetails: text("address_or_pack_details"),
    suburb: text("suburb"),
    /** TEXT — leading zeros are real (e.g. '0800'). */
    postcode: text("postcode"),
    direction: text("direction"),
    geography: text("geography"),
    format: text("format"),
    /** TEXT — e.g. "12.48m x 3.20m". */
    size: text("size"),
    orientation: text("orientation"),
    digitalSpec: text("digital_spec"),
    illumination: text("illumination"),
    digitalOperatingHours: text("digital_operating_hours"),
    rotationSeconds: numeric("rotation_seconds"),
    advertiserShare: numeric("advertiser_share"),
    panelName: text("panel_name"),
    villageName: text("village_name"),
    panelWeight: numeric("panel_weight"),
    sourcePublisher: text("source_publisher"),
    sourceRowRef: text("source_row_ref"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "line_item_panels_mba_number_lowercase",
      sql`${table.mbaNumber} = lower(${table.mbaNumber})`,
    ),
    check(
      "line_item_panels_buy_granularity_check",
      sql`${table.buyGranularity} = ANY (ARRAY['panel'::text, 'pack'::text])`,
    ),
    index("idx_line_item_panels_mba").on(table.mbaNumber),
    index("idx_line_item_panels_line_item_id").on(table.lineItemId),
  ],
)

/** Per-period panel presence (migration 0027). FK cascades with the panel. */
export const lineItemPanelFlights = pgTable(
  "line_item_panel_flights",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    panelId: bigint("panel_id", { mode: "number" })
      .notNull()
      .references(() => lineItemPanels.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    isLive: boolean("is_live").notNull().default(true),
    isBonus: boolean("is_bonus").notNull().default(false),
  },
  (table) => [
    check(
      "line_item_panel_flights_period_order",
      sql`${table.periodEnd} >= ${table.periodStart}`,
    ),
    unique("line_item_panel_flights_panel_period_unique").on(
      table.panelId,
      table.periodStart,
    ),
    index("idx_line_item_panel_flights_panel_id").on(table.panelId),
    index("idx_line_item_panel_flights_period_start").on(table.periodStart),
  ],
)
