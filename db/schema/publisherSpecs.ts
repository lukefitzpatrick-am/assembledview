/**
 * publisher_specs + spec_runs (migration 0041).
 * Join is explicit publishers.id — never fuzzy on display name.
 * RLS on; no ava_readonly grant. Owner path only.
 * spec_json stays empty until a later import cycle; do not write mi-library/.
 */
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { publishers } from "./ported"

export const publisherSpecs = pgTable(
  "publisher_specs",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    publisherSlug: text("publisher_slug").notNull(),
    publisherId: bigint("publisher_id", { mode: "number" }).references(
      () => publishers.id,
      { onDelete: "restrict" },
    ),
    publisherName: text("publisher_name").notNull(),
    specJson: jsonb("spec_json").notNull().default({}),
    supplyDeadlineMinDays: integer("supply_deadline_min_days"),
    supplyDeadlineMaxDays: integer("supply_deadline_max_days"),
    supplyDeadlineBusinessDays: boolean("supply_deadline_business_days"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("publisher_specs_slug_unique").on(table.publisherSlug),
    index("idx_publisher_specs_publisher_id").on(table.publisherId),
  ],
)

export const specRuns = pgTable(
  "spec_runs",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    publisherSpecsId: bigint("publisher_specs_id", { mode: "number" }).references(
      () => publisherSpecs.id,
      { onDelete: "set null" },
    ),
    publisherId: bigint("publisher_id", { mode: "number" }).references(
      () => publishers.id,
      { onDelete: "restrict" },
    ),
    publisherSlug: text("publisher_slug"),
    fileName: text("file_name"),
    uploadedBy: text("uploaded_by"),
    blobPath: text("blob_path"),
    extracted: jsonb("extracted").notNull().default({}),
    outcome: text("outcome").notNull(),
    outcomeReason: text("outcome_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_spec_runs_publisher_specs_id").on(table.publisherSpecsId),
    index("idx_spec_runs_created_at").on(table.createdAt),
  ],
)
