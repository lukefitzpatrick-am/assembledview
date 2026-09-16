import "server-only"

import { and, eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { CampaignPacingRow, PortfolioPacingCounts } from "@/lib/pacing/portfolio/types"
import type { PortfolioSnapshotRecord } from "@/lib/pacing/portfolio/servePortfolioSnapshot"

function isMissingTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /pacing_portfolio_snapshots|42703|42P01/i.test(message)
}

function asRows(value: unknown): CampaignPacingRow[] {
  return Array.isArray(value) ? (value as CampaignPacingRow[]) : []
}

function asCounts(value: unknown): PortfolioPacingCounts {
  const rec = value && typeof value === "object" ? (value as Record<string, number>) : {}
  return {
    live: Number(rec.live) || 0,
    behind: Number(rec.behind) || 0,
    on_track: Number(rec.on_track) || 0,
    ahead: Number(rec.ahead) || 0,
    over_pacing: Number(rec.over_pacing) || 0,
    attention: Number(rec.attention) || 0,
  }
}

function mapRow(row: {
  asOfDate: string
  scopeKey: string
  liveOnly: boolean
  rows: unknown
  counts: unknown
  generatedAt: string
  durationMs: number | null
}): PortfolioSnapshotRecord {
  return {
    asOfDate: row.asOfDate,
    scopeKey: row.scopeKey,
    liveOnly: row.liveOnly,
    rows: asRows(row.rows),
    counts: asCounts(row.counts),
    generatedAt: row.generatedAt,
    durationMs: row.durationMs,
  }
}

export async function readPortfolioSnapshot(key: {
  asOfDate: string
  scopeKey: string
  liveOnly: boolean
}): Promise<PortfolioSnapshotRecord | null> {
  try {
    const [row] = await getDb()
      .select({
        asOfDate: schema.pacingPortfolioSnapshots.asOfDate,
        scopeKey: schema.pacingPortfolioSnapshots.scopeKey,
        liveOnly: schema.pacingPortfolioSnapshots.liveOnly,
        rows: schema.pacingPortfolioSnapshots.rows,
        counts: schema.pacingPortfolioSnapshots.counts,
        generatedAt: schema.pacingPortfolioSnapshots.generatedAt,
        durationMs: schema.pacingPortfolioSnapshots.durationMs,
      })
      .from(schema.pacingPortfolioSnapshots)
      .where(
        and(
          eq(schema.pacingPortfolioSnapshots.asOfDate, key.asOfDate),
          eq(schema.pacingPortfolioSnapshots.scopeKey, key.scopeKey),
          eq(schema.pacingPortfolioSnapshots.liveOnly, key.liveOnly)
        )
      )
      .limit(1)
    return row ? mapRow(row) : null
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("[pacing/portfolio] snapshot table missing (0081 not applied)")
      return null
    }
    throw err
  }
}

export async function upsertPortfolioSnapshot(input: {
  asOfDate: string
  scopeKey: string
  liveOnly: boolean
  rows: CampaignPacingRow[]
  counts: PortfolioPacingCounts
  durationMs: number
}): Promise<PortfolioSnapshotRecord> {
  try {
    return await writePortfolioSnapshot(input)
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("[pacing/portfolio] snapshot table missing (0081 not applied); returning in-memory row")
      return {
        asOfDate: input.asOfDate,
        scopeKey: input.scopeKey,
        liveOnly: input.liveOnly,
        rows: input.rows,
        counts: input.counts,
        generatedAt: new Date().toISOString(),
        durationMs: input.durationMs,
      }
    }
    throw err
  }
}

async function writePortfolioSnapshot(input: {
  asOfDate: string
  scopeKey: string
  liveOnly: boolean
  rows: CampaignPacingRow[]
  counts: PortfolioPacingCounts
  durationMs: number
}): Promise<PortfolioSnapshotRecord> {
  const [row] = await getDb()
    .insert(schema.pacingPortfolioSnapshots)
    .values({
      asOfDate: input.asOfDate,
      scopeKey: input.scopeKey,
      liveOnly: input.liveOnly,
      rows: input.rows,
      counts: input.counts,
      durationMs: input.durationMs,
    })
    .onConflictDoUpdate({
      target: [
        schema.pacingPortfolioSnapshots.asOfDate,
        schema.pacingPortfolioSnapshots.scopeKey,
        schema.pacingPortfolioSnapshots.liveOnly,
      ],
      set: {
        rows: input.rows,
        counts: input.counts,
        generatedAt: new Date().toISOString(),
        durationMs: input.durationMs,
      },
    })
    .returning({
      asOfDate: schema.pacingPortfolioSnapshots.asOfDate,
      scopeKey: schema.pacingPortfolioSnapshots.scopeKey,
      liveOnly: schema.pacingPortfolioSnapshots.liveOnly,
      rows: schema.pacingPortfolioSnapshots.rows,
      counts: schema.pacingPortfolioSnapshots.counts,
      generatedAt: schema.pacingPortfolioSnapshots.generatedAt,
      durationMs: schema.pacingPortfolioSnapshots.durationMs,
    })

  if (!row) {
    throw new Error("pacing_portfolio_snapshots upsert returned no row")
  }
  return mapRow(row)
}
