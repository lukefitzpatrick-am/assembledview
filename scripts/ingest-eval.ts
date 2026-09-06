/**
 * Ingest eval CLI — parser vs goldens, per-publisher table + per-line diff.
 *
 *   npx tsx scripts/ingest-eval.ts
 *   npx tsx scripts/ingest-eval.ts --write-golden
 *   npx tsx scripts/ingest-eval.ts --diff tmp/ingest-eval-diff.jsonl
 *   npx tsx scripts/ingest-eval.ts --dry-run
 *   npx tsx scripts/ingest-eval.ts --full
 *   npx tsx scripts/ingest-eval.ts --report-live
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import postgres from "postgres"
import {
  GOLDEN_FIXTURES,
  evaluateGoldenSet,
  formatPublisherTable,
  goldenPath,
  parseFixtureToGolden,
  rollupPublishers,
  type FixtureScore,
} from "@/lib/mediaplans/ingest/ingestEval"
import {
  formatLiveEvalPairLines,
  listLiveIngestEvalPairs,
  scoreLiveIngestEvalPairs,
} from "@/lib/mediaplans/ingest/ingestEvalLive"

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue
      const i = line.indexOf("=")
      const key = line.slice(0, i).trim()
      const val = line.slice(i + 1).replace(/^["']|["']$/g, "")
      if (key && process.env[key] == null) process.env[key] = val
    }
  } catch {
    /* no .env.local */
  }
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

const FIELD_KEYS = [
  "money",
  "dates",
  "format",
  "placement",
  "buy_type",
] as const

async function reportLive(): Promise<void> {
  loadEnvLocal()
  const url =
    process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim() || ""
  if (!url) {
    console.log(
      JSON.stringify({
        ok: false,
        reason: "no DATABASE_URL",
        note: "There is no ingest_stage_id column on versions. Join is ingest_stages.accepted_version_id / ingest_runs.accepted_version_id / line_item_panels.source_row_ref. Live pairs need ingest_stages.source_file (0068).",
      }),
    )
    return
  }
  const sql = postgres(url, { prepare: false, max: 1 })
  try {
    const stagesPublished = await sql`
      SELECT
        COALESCE(NULLIF(ir.publisher_name, ''), 'unknown') AS publisher,
        count(DISTINCT s.accepted_version_id)::int AS published_versions,
        count(*)::int AS stages,
        count(*) FILTER (WHERE s.retained_at IS NOT NULL OR s.expires_at IS NULL)::int AS retained
      FROM ingest_stages s
      JOIN media_plan_masters m
        ON m.published_version_id = s.accepted_version_id
      LEFT JOIN LATERAL (
        SELECT publisher_name
        FROM ingest_runs r
        WHERE r.accepted_version_id = s.accepted_version_id
          AND r.outcome = 'accepted'
        ORDER BY r.created_at DESC
        LIMIT 1
      ) ir ON true
      WHERE s.accepted_version_id IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `
    const runsPublished = await sql`
      SELECT
        COALESCE(NULLIF(publisher_name, ''), 'unknown') AS publisher,
        count(DISTINCT accepted_version_id)::int AS published_versions,
        count(*)::int AS runs
      FROM ingest_runs
      WHERE outcome = 'accepted'
        AND accepted_version_id IS NOT NULL
        AND accepted_version_id IN (
          SELECT published_version_id
          FROM media_plan_masters
          WHERE published_version_id IS NOT NULL
        )
      GROUP BY 1
      ORDER BY 1
    `
    const panelsPublished = await sql`
      SELECT
        COALESCE(NULLIF(p.source_publisher, ''), 'unknown') AS publisher,
        count(DISTINCT li.version_id)::int AS published_versions,
        count(DISTINCT p.line_item_id)::int AS lines,
        count(*)::int AS panels
      FROM line_item_panels p
      JOIN line_items li ON li.line_item_id = p.line_item_id
      JOIN media_plan_masters m ON m.published_version_id = li.version_id
      WHERE p.source_row_ref IS NOT NULL
        AND btrim(p.source_row_ref) <> ''
      GROUP BY 1
      ORDER BY 1
    `
    const totals = await sql`
      SELECT
        (SELECT count(*)::int FROM ingest_stages) AS stages_all,
        (SELECT count(*)::int FROM ingest_stages WHERE accepted_version_id IS NOT NULL) AS stages_accepted,
        (SELECT count(*)::int FROM ingest_stages WHERE retained_at IS NOT NULL OR expires_at IS NULL) AS stages_retained,
        (SELECT count(*)::int FROM ingest_runs WHERE outcome = 'accepted' AND accepted_version_id IS NOT NULL) AS runs_accepted,
        (SELECT count(DISTINCT published_version_id)::int FROM media_plan_masters WHERE published_version_id IS NOT NULL) AS published_masters
    `
    const pairs = await listLiveIngestEvalPairs()
    const liveScores = await scoreLiveIngestEvalPairs(pairs)
    console.log(
      JSON.stringify(
        {
          ok: true,
          source_xlsx_retrievable: pairs.length,
          version_choice:
            "published_version_number >= accepted_version_number on the same master; score vs current published lines; sha256 deduped per master",
          live_pairs: pairs.map((p) => ({
            publisher: p.publisher,
            masterId: p.masterId,
            acceptedVersionId: p.acceptedVersionId,
            publishedVersionId: p.publishedVersionId,
            fileName: p.fileName,
            sha256: p.sha256,
            stageId: p.stageId,
          })),
          live_scores: liveScores.map((s) => ({
            id: s.id,
            publisher: s.publisher,
            overall: s.overall,
            n_compared: s.n_compared,
          })),
          note: "ingest_stage_id is a save-body field only — not a version column. Retained stages keep source_file (private Blob ingest/{stageId}/{filename}). Pre-IG-14 stages (source_file null) are omitted.",
          totals: totals[0],
          stages_on_published: stagesPublished,
          runs_on_published: runsPublished,
          panels_with_source_row_ref: panelsPublished,
        },
        null,
        2,
      ),
    )
  } finally {
    await sql.end({ timeout: 5 })
  }
}

function writeDiffFile(pathOut: string, scores: FixtureScore[]): void {
  mkdirSync(dirname(pathOut), { recursive: true })
  const lines: string[] = []
  for (const score of scores) {
    for (const diff of score.diffs) {
      const miss = FIELD_KEYS.filter((k) => !diff.fields[k])
      if (miss.length === 0) continue
      lines.push(
        JSON.stringify({
          fixture: score.id,
          publisher: score.publisher,
          source_row_ref: diff.source_row_ref,
          missed: miss,
          expected: diff.expected,
          actual: diff.actual,
        }),
      )
    }
  }
  writeFileSync(pathOut, lines.join("\n") + (lines.length ? "\n" : ""), "utf8")
}

async function writeGoldens(): Promise<void> {
  mkdirSync(dirname(goldenPath("jcd")), { recursive: true })
  for (const meta of GOLDEN_FIXTURES) {
    const golden = await parseFixtureToGolden(meta)
    writeFileSync(
      goldenPath(meta.id),
      `${JSON.stringify(golden, null, 2)}\n`,
      "utf8",
    )
    console.log(
      `wrote ${meta.id}: ${golden.line_item_count} lines, stated=${golden.file_stated_total}, dates=${golden.dates.length}`,
    )
  }
}

async function main(): Promise<void> {
  if (hasFlag("--report-live")) {
    await reportLive()
    return
  }
  if (hasFlag("--write-golden")) {
    await writeGoldens()
    return
  }
  if (hasFlag("--dry-run")) {
    loadEnvLocal()
    const pairs = await listLiveIngestEvalPairs()
    console.log(formatLiveEvalPairLines(pairs))
    console.log(
      `\nversion choice: published_version_number >= accepted_version_number; sha256 deduped per master; pre-IG-14 source_file null omitted`,
    )
    return
  }
  const golden = await evaluateGoldenSet()
  let scores = golden.scores
  let publishers = golden.publishers
  let failed = golden.failed
  if (hasFlag("--full")) {
    loadEnvLocal()
    const pairs = await listLiveIngestEvalPairs()
    console.log(formatLiveEvalPairLines(pairs))
    const liveScores = await scoreLiveIngestEvalPairs(pairs)
    scores = [...golden.scores, ...liveScores]
    publishers = rollupPublishers(scores)
    failed = [
      ...golden.failed,
      ...liveScores
        .filter((s) => s.overall < 1)
        .map(
          (s) =>
            `${s.id}: overall=${(s.overall * 100).toFixed(1)}% extra=${s.n_extra} missing=${s.n_missing}`,
        ),
    ]
  }
  console.log(formatPublisherTable(publishers))
  const diffPath =
    argValue("--diff") ?? resolve(process.cwd(), "tmp/ingest-eval-diff.jsonl")
  writeDiffFile(diffPath, scores)
  console.log(`\nper-line diffs (misses only): ${diffPath}`)
  if (failed.length > 0 && !hasFlag("--full")) {
    console.error(`\ningest-eval FAILED:\n- ${failed.join("\n- ")}`)
    process.exit(1)
  }
  if (hasFlag("--full") && golden.failed.length > 0) {
    console.error(`\ningest-eval golden FAILED:\n- ${golden.failed.join("\n- ")}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
