/**
 * Ingest evaluation harness — parser vs checked-in goldens.
 * CI scores the five fixture publishers. Never writes media_plan_*.
 * Live Anthropic audit is opt-in (`--audit`); golden CI skips it.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import { buildIngestReviewFromFile } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  datesFromProposedLine,
  moneyAmountFromProposedLine,
} from "@/lib/mediaplans/ingest/lineAudit"
import { loadSeedPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import { roundCents } from "@/lib/mediaplans/ingest/moneyRules"
import type { ProposedLineItem } from "@/lib/mediaplans/ingest/proposeLineItems"
import { stampProposalForSave } from "@/lib/mediaplans/ingest/stampProposalForSave"
import type { SavePlanLineItem } from "@/lib/data/savePlan"

export const INGEST_EVAL_STAMP_MBA = "INGESTEVAL"

export const AVA_PLANS_FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
export const GOLDEN_DIR = path.join(process.cwd(), "tests/fixtures/ingest-golden")

export type GoldenFixtureId = "jcd" | "qms" | "sca-v1" | "sca-v2" | "sen"

export type GoldenFixtureMeta = {
  id: GoldenFixtureId
  /** Short profile name (publisher_profiles.publisher_name). */
  publisher: "JCDecaux" | "QMS" | "SCA" | "SEN"
  file: string
  expectedLineCount: number | null
  expectedStatedTotal: number | null
}

export const GOLDEN_FIXTURES: readonly GoldenFixtureMeta[] = [
  {
    id: "jcd",
    publisher: "JCDecaux",
    file: "jcd_strength-meals_ooh.xlsx",
    expectedLineCount: 95,
    expectedStatedTotal: 131250.01,
  },
  {
    id: "qms",
    publisher: "QMS",
    file: "qms_strength-meals_esb-ooh.xlsx",
    expectedLineCount: 41,
    expectedStatedTotal: null,
  },
  {
    id: "sca-v1",
    publisher: "SCA",
    file: "sca_boss-engineering_fy26_v1.xlsx",
    expectedLineCount: null,
    expectedStatedTotal: 60097,
  },
  {
    id: "sca-v2",
    publisher: "SCA",
    file: "sca_boss-engineering_fy26_v2-rev.xlsx",
    expectedLineCount: null,
    expectedStatedTotal: null,
  },
  {
    id: "sen",
    publisher: "SEN",
    file: "sen_boss-engineering_fy26.xlsx",
    expectedLineCount: null,
    expectedStatedTotal: 120000,
  },
]

export type GoldenDateRange = { from: string | null; to: string | null }

export type GoldenLine = {
  source_row_ref: string
  money: number
  dates: GoldenDateRange[]
  format: string | null
  placement: string | null
  buy_type: string
}

export type GoldenFixtureFile = {
  id: string
  publisher: string
  file: string
  line_item_count: number
  file_stated_total: number | null
  total_media_amount: number
  /** Unique sorted burst civil dates (start and end). */
  dates: string[]
  lines: GoldenLine[]
}

export type LineFieldScore = {
  money: boolean
  dates: boolean
  format: boolean
  placement: boolean
  buy_type: boolean
}

export type LineDiff = {
  source_row_ref: string
  expected: GoldenLine | null
  actual: GoldenLine | null
  fields: LineFieldScore
}

export type FixtureScore = {
  id: string
  publisher: string
  file: string
  line_count: number
  expected_line_count: number | null
  file_stated_total: number | null
  total_media_amount: number
  n_compared: number
  n_extra: number
  n_missing: number
  money: number
  dates: number
  format: number
  placement: number
  buy_type: number
  overall: number
  diffs: LineDiff[]
}

export type PublisherScore = {
  publisher: string
  fixtures: string[]
  line_count: number
  money: number
  dates: number
  format: number
  placement: number
  buy_type: number
  overall: number
}

const FIELD_KEYS = [
  "money",
  "dates",
  "format",
  "placement",
  "buy_type",
] as const

function strAttr(attrs: Record<string, unknown>, key: string): string | null {
  const v = attrs[key]
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t : null
}

export function snapshotLine(
  item: ProposedLineItem,
  stamped: SavePlanLineItem,
): GoldenLine {
  const ref = item.panels[0]?.source_row_ref ?? ""
  const attrs = (stamped.attrs ?? {}) as Record<string, unknown>
  const resolved = strAttr(attrs, "format")
  const unresolved = strAttr(attrs, "format_unresolved_raw")
  const format = resolved ?? (unresolved ? `unresolved:${unresolved}` : null)
  return {
    source_row_ref: ref,
    money: roundCents(moneyAmountFromProposedLine(item)),
    dates: datesFromProposedLine(item),
    format,
    placement: strAttr(attrs, "placement"),
    buy_type: stamped.buyType ?? "",
  }
}

export function collectDateList(lines: GoldenLine[]): string[] {
  const set = new Set<string>()
  for (const line of lines) {
    for (const d of line.dates) {
      if (d.from) set.add(d.from)
      if (d.to) set.add(d.to)
    }
  }
  return [...set].sort()
}

export async function parseFixtureToGolden(
  meta: GoldenFixtureMeta,
): Promise<GoldenFixtureFile> {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(AVA_PLANS_FIX, meta.file),
    profiles,
    { skipAva: true, sourceFileName: meta.file },
  )
  const proposal = review.proposal
  if (!proposal) {
    throw new Error(`ingest-eval: no proposal for ${meta.id} (${meta.file})`)
  }
  const { lineItems } = stampProposalForSave(proposal, INGEST_EVAL_STAMP_MBA)
  if (lineItems.length !== proposal.line_items.length) {
    throw new Error(
      `ingest-eval: stamp count ${lineItems.length} != proposal ${proposal.line_items.length} (${meta.id})`,
    )
  }
  const lines = proposal.line_items.map((item, i) =>
    snapshotLine(item, lineItems[i]!),
  )
  const recon = proposal.reconciliation
  return {
    id: meta.id,
    publisher: meta.publisher,
    file: meta.file,
    line_item_count: recon.line_item_count,
    file_stated_total: recon.file_stated_total,
    total_media_amount: roundCents(recon.total_media_amount),
    dates: collectDateList(lines),
    lines,
  }
}

function datesEqual(a: GoldenDateRange[], b: GoldenDateRange[]): boolean {
  if (a.length !== b.length) return false
  return a.every((d, i) => d.from === b[i]!.from && d.to === b[i]!.to)
}

function norm(s: string | null): string {
  return (s ?? "").trim().toLowerCase()
}

export function scoreLine(expected: GoldenLine, actual: GoldenLine): LineFieldScore {
  return {
    money: expected.money === actual.money,
    dates: datesEqual(expected.dates, actual.dates),
    format: norm(expected.format) === norm(actual.format),
    placement: norm(expected.placement) === norm(actual.placement),
    buy_type: norm(expected.buy_type) === norm(actual.buy_type),
  }
}

const ALL_FALSE: LineFieldScore = {
  money: false,
  dates: false,
  format: false,
  placement: false,
  buy_type: false,
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, n) => s + n, 0) / values.length
}

function fieldRate(diffs: LineDiff[], key: (typeof FIELD_KEYS)[number]): number {
  if (diffs.length === 0) return 1
  return diffs.filter((d) => d.fields[key]).length / diffs.length
}

export function scoreFixture(
  expected: GoldenFixtureFile,
  actual: GoldenFixtureFile,
): FixtureScore {
  const expectedByRef = new Map(expected.lines.map((l) => [l.source_row_ref, l]))
  const actualByRef = new Map(actual.lines.map((l) => [l.source_row_ref, l]))
  const refs = new Set([...expectedByRef.keys(), ...actualByRef.keys()])
  const diffs: LineDiff[] = []
  for (const ref of [...refs].sort()) {
    const exp = expectedByRef.get(ref) ?? null
    const act = actualByRef.get(ref) ?? null
    if (exp && act) {
      diffs.push({ source_row_ref: ref, expected: exp, actual: act, fields: scoreLine(exp, act) })
    } else {
      diffs.push({
        source_row_ref: ref,
        expected: exp,
        actual: act,
        fields: ALL_FALSE,
      })
    }
  }
  const nCompared = diffs.filter((d) => d.expected && d.actual).length
  const nMissing = diffs.filter((d) => d.expected && !d.actual).length
  const nExtra = diffs.filter((d) => !d.expected && d.actual).length
  const money = fieldRate(diffs, "money")
  const dates = fieldRate(diffs, "dates")
  const format = fieldRate(diffs, "format")
  const placement = fieldRate(diffs, "placement")
  const buy_type = fieldRate(diffs, "buy_type")
  return {
    id: expected.id,
    publisher: expected.publisher,
    file: expected.file,
    line_count: actual.line_item_count,
    expected_line_count: expected.line_item_count,
    file_stated_total: actual.file_stated_total,
    total_media_amount: actual.total_media_amount,
    n_compared: nCompared,
    n_extra: nExtra,
    n_missing: nMissing,
    money,
    dates,
    format,
    placement,
    buy_type,
    overall: mean([money, dates, format, placement, buy_type]),
    diffs,
  }
}

export function rollupPublishers(scores: FixtureScore[]): PublisherScore[] {
  const byPub = new Map<string, FixtureScore[]>()
  for (const s of scores) {
    const list = byPub.get(s.publisher) ?? []
    list.push(s)
    byPub.set(s.publisher, list)
  }
  const out: PublisherScore[] = []
  for (const [publisher, list] of byPub) {
    const weighted = (key: (typeof FIELD_KEYS)[number]) => {
      const n = list.reduce((s, row) => s + row.diffs.length, 0)
      if (n === 0) return 1
      const hit = list.reduce(
        (s, row) => s + row.diffs.filter((d) => d.fields[key]).length,
        0,
      )
      return hit / n
    }
    const money = weighted("money")
    const dates = weighted("dates")
    const format = weighted("format")
    const placement = weighted("placement")
    const buy_type = weighted("buy_type")
    out.push({
      publisher,
      fixtures: list.map((r) => r.id),
      line_count: list.reduce((s, r) => s + r.line_count, 0),
      money,
      dates,
      format,
      placement,
      buy_type,
      overall: mean([money, dates, format, placement, buy_type]),
    })
  }
  return out.sort((a, b) => a.overall - b.overall || a.publisher.localeCompare(b.publisher))
}

export function formatPublisherTable(rows: PublisherScore[]): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const header = [
    "publisher",
    "fixtures",
    "lines",
    "money",
    "dates",
    "format",
    "placement",
    "buy_type",
    "overall",
  ]
  const body = rows.map((r) => [
    r.publisher,
    r.fixtures.join("+"),
    String(r.line_count),
    pct(r.money),
    pct(r.dates),
    pct(r.format),
    pct(r.placement),
    pct(r.buy_type),
    pct(r.overall),
  ])
  const cols = header.map((_, i) =>
    Math.max(header[i]!.length, ...body.map((row) => row[i]!.length)),
  )
  const fmt = (row: string[]) =>
    row.map((cell, i) => cell.padEnd(cols[i]!)).join("  ")
  return [fmt(header), fmt(cols.map((w) => "-".repeat(w))), ...body.map(fmt)].join("\n")
}

export function goldenPath(id: GoldenFixtureId): string {
  return path.join(GOLDEN_DIR, `${id}.json`)
}

export function statedTotalMoved(
  expected: number | null,
  actual: number | null,
  tolerance = 0.005,
): boolean {
  if (expected == null) return false
  if (actual == null) return true
  return Math.abs(expected - actual) > tolerance
}

export function readGoldenFile(id: GoldenFixtureId): GoldenFixtureFile {
  return JSON.parse(readFileSync(goldenPath(id), "utf8")) as GoldenFixtureFile
}

export type GoldenEvalResult = {
  scores: FixtureScore[]
  publishers: PublisherScore[]
  failed: string[]
}

export async function evaluateGoldenSet(): Promise<GoldenEvalResult> {
  const scores: FixtureScore[] = []
  const failed: string[] = []
  for (const meta of GOLDEN_FIXTURES) {
    const actual = await parseFixtureToGolden(meta)
    const expected = readGoldenFile(meta.id)
    const score = scoreFixture(expected, actual)
    scores.push(score)
    if (score.n_extra > 0 || score.n_missing > 0 || score.overall < 1) {
      failed.push(
        `${meta.id}: overall=${(score.overall * 100).toFixed(1)}% extra=${score.n_extra} missing=${score.n_missing}`,
      )
    }
    if (
      meta.expectedLineCount != null &&
      actual.line_item_count !== meta.expectedLineCount
    ) {
      failed.push(
        `${meta.id}: line_item_count ${actual.line_item_count} != ${meta.expectedLineCount}`,
      )
    }
    if (statedTotalMoved(meta.expectedStatedTotal, actual.file_stated_total, 1)) {
      failed.push(
        `${meta.id}: file_stated_total ${actual.file_stated_total} != ${meta.expectedStatedTotal}`,
      )
    }
  }
  return { scores, publishers: rollupPublishers(scores), failed }
}
