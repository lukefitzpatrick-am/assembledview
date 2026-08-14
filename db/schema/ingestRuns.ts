/**
 * ingest_runs — per-upload history (migration 0037).
 * RLS on; no ava_readonly grant. Owner path only.
 */
import {
  bigint,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { publishers } from "./ported"

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    publisherId: bigint("publisher_id", { mode: "number" }).references(
      () => publishers.id,
    ),
    publisherName: text("publisher_name"),
    fileName: text("file_name"),
    uploadedBy: text("uploaded_by"),
    detectedConfidence: numeric("detected_confidence"),
    requiredCoverage: numeric("required_coverage"),
    lineItemCount: integer("line_item_count").notNull().default(0),
    panelCount: integer("panel_count").notNull().default(0),
    burstCount: integer("burst_count").notNull().default(0),
    moneyDelta: numeric("money_delta"),
    outcome: text("outcome").notNull(),
    outcomeReason: text("outcome_reason"),
    acceptedVersionId: bigint("accepted_version_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ingest_runs_publisher_id").on(table.publisherId),
    index("idx_ingest_runs_created_at").on(table.createdAt),
  ],
)
