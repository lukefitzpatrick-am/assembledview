import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import {
  evaluateGoldenSet,
  type PublisherScore,
} from "@/lib/mediaplans/ingest/ingestEval"
import { recordIngestEvalRun } from "@/lib/mediaplans/ingest/ingestEvalRuns"
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"

export const dynamic = "force-dynamic"
export const maxDuration = 120
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Weekly ingest eval — re-parse golden fixtures, score vs locked goldens,
 * write ingest_eval_runs (one row per publisher). Fail-soft until 0067.
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization Bearer.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  const { scores, publishers, failed } = await evaluateGoldenSet()
  const written: Array<{ publisher: string; overall: number }> = []
  for (const pub of publishers) {
    await recordIngestEvalRun({
      publisherId: resolveCatalogueIdForProfileName(pub.publisher),
      publisherName: pub.publisher,
      fixtureId: pub.fixtures.join("+"),
      corpusKind: "golden",
      lineCount: pub.line_count,
      moneyPct: pub.money,
      datesPct: pub.dates,
      formatPct: pub.format,
      placementPct: pub.placement,
      buyTypePct: pub.buy_type,
      overallPct: pub.overall,
      scores: {
        fixtures: pub.fixtures,
        per_fixture: scores
          .filter((s) => s.publisher === pub.publisher)
          .map((s) => ({
            id: s.id,
            line_count: s.line_count,
            money: s.money,
            dates: s.dates,
            format: s.format,
            placement: s.placement,
            buy_type: s.buy_type,
            overall: s.overall,
            n_extra: s.n_extra,
            n_missing: s.n_missing,
          })),
      },
    })
    written.push({ publisher: pub.publisher, overall: pub.overall })
  }

  const lowest = publishers.slice(0, 3).map((p) => p.publisher)
  return NextResponse.json({
    corpus: "golden",
    corpus_size: scores.reduce((n, s) => n + s.line_count, 0),
    publishers: summarise(publishers),
    lowest,
    failed,
    written,
  })
}

function summarise(publishers: PublisherScore[]) {
  return publishers.map((p) => ({
    publisher: p.publisher,
    fixtures: p.fixtures,
    line_count: p.line_count,
    money: p.money,
    dates: p.dates,
    format: p.format,
    placement: p.placement,
    buy_type: p.buy_type,
    overall: p.overall,
  }))
}
