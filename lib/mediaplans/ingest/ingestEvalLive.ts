/**
 * Live ingest-eval corpus: retained stages with a stored workbook, paired
 * to the master's published (or later) version. sha256 dedupes the same
 * file attached twice to one plan.
 *
 * Version choice: include the pair when published_version_number >=
 * accepted_version_number on the same master (the pointer may have moved
 * forward). Score against the current published lines, not the accepted
 * cut. Pre-IG-14 stages (source_file null) are omitted.
 */
import postgres from "postgres"
import { buildIngestReviewFromBuffer } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  collectDateList,
  INGEST_EVAL_STAMP_MBA,
  scoreFixture,
  snapshotLine,
  type FixtureScore,
  type GoldenDateRange,
  type GoldenFixtureFile,
  type GoldenLine,
} from "@/lib/mediaplans/ingest/ingestEval"
import { ingestSourceRowRefsFromAttrs } from "@/lib/mediaplans/ingest/ingestSourceRowRefs"
import {
  getIngestWorkbookBuffer,
  parseIngestSourceFile,
  type IngestSourceFile,
} from "@/lib/mediaplans/ingest/ingestWorkbookBlob"
import { listPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import { roundCents } from "@/lib/mediaplans/ingest/moneyRules"
import { stampProposalForSave } from "@/lib/mediaplans/ingest/stampProposalForSave"

export type LiveEvalCandidate = {
  stageId: string
  masterId: number | null
  acceptedVersionId: number | null
  acceptedVersionNumber: number | null
  publishedVersionId: number | null
  publishedVersionNumber: number | null
  sourceFile: IngestSourceFile | null
  publisher: string
  fileName: string | null
}

export type LiveEvalPair = {
  stageId: string
  masterId: number
  acceptedVersionId: number
  publishedVersionId: number
  acceptedVersionNumber: number
  publishedVersionNumber: number
  sha256: string
  publisher: string
  fileName: string | null
  sourceFile: IngestSourceFile
}

export function selectLiveEvalPairs(
  candidates: LiveEvalCandidate[],
): LiveEvalPair[] {
  const eligible: LiveEvalPair[] = []
  for (const row of candidates) {
    if (!row.sourceFile) continue
    if (row.masterId == null || row.acceptedVersionId == null) continue
    if (row.publishedVersionId == null) continue
    if (row.acceptedVersionNumber == null || row.publishedVersionNumber == null) {
      continue
    }
    if (row.publishedVersionNumber < row.acceptedVersionNumber) continue
    eligible.push({
      stageId: row.stageId,
      masterId: row.masterId,
      acceptedVersionId: row.acceptedVersionId,
      publishedVersionId: row.publishedVersionId,
      acceptedVersionNumber: row.acceptedVersionNumber,
      publishedVersionNumber: row.publishedVersionNumber,
      sha256: row.sourceFile.sha256,
      publisher: row.publisher,
      fileName: row.fileName ?? row.sourceFile.name,
      sourceFile: row.sourceFile,
    })
  }

  const byKey = new Map<string, LiveEvalPair>()
  for (const pair of eligible) {
    const key = `${pair.masterId}:${pair.sha256}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, pair)
      continue
    }
    const newerPublished =
      pair.publishedVersionNumber > existing.publishedVersionNumber
    const samePublishedNewerAccepted =
      pair.publishedVersionNumber === existing.publishedVersionNumber &&
      pair.acceptedVersionNumber > existing.acceptedVersionNumber
    if (newerPublished || samePublishedNewerAccepted) {
      byKey.set(key, pair)
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.publisher.localeCompare(b.publisher) ||
      a.masterId - b.masterId ||
      (a.fileName ?? "").localeCompare(b.fileName ?? ""),
  )
}

export function formatLiveEvalPairLines(pairs: LiveEvalPair[]): string {
  if (pairs.length === 0) {
    return "live corpus pairs: 0 (no retained stage with source_file + published-or-later version)"
  }
  const header =
    "live corpus pairs (published version >= accepted; sha256 deduped per master):"
  const body = pairs.map((p) => {
    const sha = p.sha256.slice(0, 12)
    return `  ${p.publisher}\tmaster=${p.masterId}\taccepted=v${p.acceptedVersionNumber}(${p.acceptedVersionId})\tpublished=v${p.publishedVersionNumber}(${p.publishedVersionId})\t${p.fileName ?? "?"}\tsha256=${sha}…\tstage=${p.stageId}`
  })
  return [header, ...body].join("\n")
}

export async function listLiveIngestEvalPairs(): Promise<LiveEvalPair[]> {
  const url =
    process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim() || ""
  if (!url) return []
  const sql = postgres(url, { prepare: false, max: 1 })
  try {
    const rows = await sql`
      SELECT
        s.stage_id::text AS stage_id,
        s.master_id::int AS master_id,
        s.accepted_version_id::int AS accepted_version_id,
        av.version_number::int AS accepted_version_number,
        m.published_version_id::int AS published_version_id,
        pv.version_number::int AS published_version_number,
        s.source_file AS source_file,
        s.file_name AS file_name,
        COALESCE(
          NULLIF(s.review_package->>'detected_publisher', ''),
          'unknown'
        ) AS publisher
      FROM ingest_stages s
      JOIN media_plan_masters m ON m.id = s.master_id
      JOIN media_plan_versions av ON av.id = s.accepted_version_id
      JOIN media_plan_versions pv ON pv.id = m.published_version_id
      WHERE s.source_file IS NOT NULL
        AND s.accepted_version_id IS NOT NULL
        AND s.master_id IS NOT NULL
        AND (s.retained_at IS NOT NULL OR s.expires_at IS NULL)
    `
    const candidates: LiveEvalCandidate[] = rows.map((row) => ({
      stageId: String(row.stage_id),
      masterId: Number(row.master_id),
      acceptedVersionId: Number(row.accepted_version_id),
      acceptedVersionNumber: Number(row.accepted_version_number),
      publishedVersionId: Number(row.published_version_id),
      publishedVersionNumber: Number(row.published_version_number),
      sourceFile: parseIngestSourceFile(row.source_file),
      publisher: String(row.publisher ?? "unknown"),
      fileName: row.file_name == null ? null : String(row.file_name),
    }))
    return selectLiveEvalPairs(candidates)
  } catch {
    // 0068 not applied / table missing — overlay-only until then.
    return []
  } finally {
    await sql.end({ timeout: 5 })
  }
}

function strOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const t = value.trim()
  return t ? t : null
}

function moneyAndDatesFromBursts(raw: unknown): {
  money: number
  dates: GoldenDateRange[]
} {
  if (!Array.isArray(raw)) return { money: 0, dates: [] }
  let money = 0
  const dates: GoldenDateRange[] = []
  const seen = new Set<string>()
  for (const burst of raw) {
    if (!burst || typeof burst !== "object") continue
    const rec = burst as Record<string, unknown>
    const amt = Number(rec.buyAmount ?? rec.media_amount ?? rec.mediaAmount ?? 0)
    if (Number.isFinite(amt)) money += amt
    const from = strOrNull(rec.startDate ?? rec.start_date)
    const to = strOrNull(rec.endDate ?? rec.end_date)
    const key = `${from ?? ""}|${to ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    dates.push({ from, to })
  }
  return { money: roundCents(money), dates }
}

export function goldenLinesFromPublishedRows(
  rows: Array<{ buyType: string | null; attrs: unknown; bursts: unknown }>,
): GoldenLine[] {
  const lines: GoldenLine[] = []
  for (const row of rows) {
    const attrs =
      row.attrs && typeof row.attrs === "object" && !Array.isArray(row.attrs)
        ? (row.attrs as Record<string, unknown>)
        : {}
    const refs = ingestSourceRowRefsFromAttrs(attrs)
    if (refs.length === 0) continue
    const { money, dates } = moneyAndDatesFromBursts(row.bursts)
    const resolved = strOrNull(attrs.format)
    const unresolved = strOrNull(attrs.format_unresolved_raw)
    lines.push({
      source_row_ref: refs[0]!,
      money,
      dates,
      format: resolved ?? (unresolved ? `unresolved:${unresolved}` : null),
      placement: strOrNull(attrs.placement),
      buy_type: row.buyType ?? "",
    })
  }
  return lines
}

async function publishedRowsForVersion(
  sql: postgres.Sql,
  versionId: number,
): Promise<Array<{ buyType: string | null; attrs: unknown; bursts: unknown }>> {
  const rows = await sql`
    SELECT buy_type, attrs, bursts
    FROM line_items
    WHERE version_id = ${versionId}
    ORDER BY position NULLS LAST, line_item_id
  `
  return rows.map((row) => ({
    buyType: row.buy_type == null ? null : String(row.buy_type),
    attrs: row.attrs,
    bursts: row.bursts,
  }))
}

export async function scoreLiveIngestEvalPairs(
  pairs: LiveEvalPair[],
): Promise<FixtureScore[]> {
  if (pairs.length === 0) return []
  const url =
    process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim() || ""
  const { profiles } = await listPublisherProfiles()
  const sql = url ? postgres(url, { prepare: false, max: 1 }) : null
  const scores: FixtureScore[] = []
  try {
    for (const pair of pairs) {
      const buffer = await getIngestWorkbookBuffer(pair.sourceFile)
      if (!buffer) continue
      const review = await buildIngestReviewFromBuffer(buffer, profiles, {
        skipAva: true,
        sourceFileName: pair.fileName,
      })
      if (!review.proposal) continue
      const { lineItems } = stampProposalForSave(
        review.proposal,
        INGEST_EVAL_STAMP_MBA,
      )
      if (lineItems.length !== review.proposal.line_items.length) continue
      const actualLines = review.proposal.line_items.map((item, i) =>
        snapshotLine(item, lineItems[i]!),
      )
      const published = sql
        ? await publishedRowsForVersion(sql, pair.publishedVersionId)
        : []
      const expectedLines = goldenLinesFromPublishedRows(published)
      if (expectedLines.length === 0) continue
      const actual: GoldenFixtureFile = {
        id: `live:${pair.stageId}`,
        publisher: pair.publisher,
        file: pair.fileName ?? pair.sourceFile.name,
        line_item_count: review.proposal.reconciliation.line_item_count,
        file_stated_total: review.proposal.reconciliation.file_stated_total,
        total_media_amount: roundCents(
          review.proposal.reconciliation.total_media_amount,
        ),
        dates: collectDateList(actualLines),
        lines: actualLines,
      }
      const expected: GoldenFixtureFile = {
        ...actual,
        line_item_count: expectedLines.length,
        total_media_amount: roundCents(
          expectedLines.reduce((s, l) => s + l.money, 0),
        ),
        dates: collectDateList(expectedLines),
        lines: expectedLines,
      }
      scores.push(scoreFixture(expected, actual))
    }
  } finally {
    if (sql) await sql.end({ timeout: 5 })
  }
  return scores
}
