/**
 * ingest_eval_runs (migration 0067). SQL is source of truth; this mirror
 * is for generate/diff fidelity. RLS is on. Runtime is
 * `lib/mediaplans/ingest/ingestEvalRuns.ts` and fail-softs until applied.
 * Do not db.select() this table against live Postgres before applying (C-76).
 */
import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { publishers } from "./ported"

export const ingestEvalRuns = pgTable(
  "ingest_eval_runs",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    publisherId: bigint("publisher_id", { mode: "number" }).references(
      () => publishers.id,
    ),
    publisherName: text("publisher_name").notNull(),
    fixtureId: text("fixture_id"),
    corpusKind: text("corpus_kind").notNull(),
    lineCount: integer("line_count").notNull().default(0),
    moneyPct: numeric("money_pct").notNull(),
    datesPct: numeric("dates_pct").notNull(),
    formatPct: numeric("format_pct").notNull(),
    placementPct: numeric("placement_pct").notNull(),
    buyTypePct: numeric("buy_type_pct").notNull(),
    overallPct: numeric("overall_pct").notNull(),
    scores: jsonb("scores").notNull().default({}),
    ranAt: timestamp("ran_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ingest_eval_runs_publisher_ran").on(
      table.publisherName,
      table.ranAt.desc(),
    ),
    index("idx_ingest_eval_runs_ran_at").on(table.ranAt.desc()),
  ],
)
