import "server-only"

import { desc, eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { RelabelDriftFinding, RelabelDriftReport } from "./drift"

export type RelabelDriftSnapshotRecord = {
  asOfDate: string
  findings: RelabelDriftFinding[]
  legacyCount: number
  driftCount: number
  generatedAt: string
  durationMs: number | null
}

function isMissingTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /relabel_drift_snapshots|42703|42P01/i.test(message)
}

function asFindings(value: unknown): RelabelDriftFinding[] {
  return Array.isArray(value) ? (value as RelabelDriftFinding[]) : []
}

function mapRow(row: {
  asOfDate: string
  findings: unknown
  legacyCount: number
  driftCount: number
  generatedAt: string
  durationMs: number | null
}): RelabelDriftSnapshotRecord {
  return {
    asOfDate: row.asOfDate,
    findings: asFindings(row.findings),
    legacyCount: Number(row.legacyCount) || 0,
    driftCount: Number(row.driftCount) || 0,
    generatedAt: row.generatedAt,
    durationMs: row.durationMs,
  }
}

export async function readLatestRelabelDriftSnapshot(
  asOfDate?: string,
): Promise<RelabelDriftSnapshotRecord | null> {
  try {
    const db = getDb()
    const query = db
      .select({
        asOfDate: schema.relabelDriftSnapshots.asOfDate,
        findings: schema.relabelDriftSnapshots.findings,
        legacyCount: schema.relabelDriftSnapshots.legacyCount,
        driftCount: schema.relabelDriftSnapshots.driftCount,
        generatedAt: schema.relabelDriftSnapshots.generatedAt,
        durationMs: schema.relabelDriftSnapshots.durationMs,
      })
      .from(schema.relabelDriftSnapshots)
    const rows = asOfDate
      ? await query.where(eq(schema.relabelDriftSnapshots.asOfDate, asOfDate)).limit(1)
      : await query.orderBy(desc(schema.relabelDriftSnapshots.asOfDate)).limit(1)
    return rows[0] ? mapRow(rows[0]) : null
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("[pacing/relabel] drift snapshot table missing (0086 not applied)")
      return null
    }
    throw err
  }
}

export async function upsertRelabelDriftSnapshot(input: {
  asOfDate: string
  report: RelabelDriftReport
  durationMs: number
}): Promise<RelabelDriftSnapshotRecord> {
  const record: RelabelDriftSnapshotRecord = {
    asOfDate: input.asOfDate,
    findings: input.report.findings,
    legacyCount: input.report.legacy.length,
    driftCount: input.report.drift.length,
    generatedAt: new Date().toISOString(),
    durationMs: input.durationMs,
  }
  try {
    const [row] = await getDb()
      .insert(schema.relabelDriftSnapshots)
      .values({
        asOfDate: input.asOfDate,
        findings: input.report.findings,
        legacyCount: input.report.legacy.length,
        driftCount: input.report.drift.length,
        durationMs: input.durationMs,
      })
      .onConflictDoUpdate({
        target: [schema.relabelDriftSnapshots.asOfDate],
        set: {
          findings: input.report.findings,
          legacyCount: input.report.legacy.length,
          driftCount: input.report.drift.length,
          generatedAt: new Date().toISOString(),
          durationMs: input.durationMs,
        },
      })
      .returning({
        asOfDate: schema.relabelDriftSnapshots.asOfDate,
        findings: schema.relabelDriftSnapshots.findings,
        legacyCount: schema.relabelDriftSnapshots.legacyCount,
        driftCount: schema.relabelDriftSnapshots.driftCount,
        generatedAt: schema.relabelDriftSnapshots.generatedAt,
        durationMs: schema.relabelDriftSnapshots.durationMs,
      })
    if (!row) throw new Error("relabel_drift_snapshots upsert returned no row")
    return mapRow(row)
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("[pacing/relabel] drift snapshot table missing (0086 not applied); returning in-memory row")
      return record
    }
    throw err
  }
}
