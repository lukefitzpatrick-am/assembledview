import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
import { normalizeLineItemId } from "./shared/channels"
import {
  compareRelabelMap,
  type RelabelDriftFinding,
  type RelabelDriftReport,
  type RelabelMapRow,
} from "./drift"

export type { RelabelDriftFinding, RelabelDriftReport } from "./drift"
import { LINE_ITEM_LABEL_MAP } from "./shared/types"
import { isMissingRelabelTable, listRelabels } from "./repo"
import {
  readLatestRelabelDriftSnapshot,
  upsertRelabelDriftSnapshot,
  type RelabelDriftSnapshotRecord,
} from "./relabelDriftSnapshotStore"

export const LABEL_MAP_ALL_ACTIVE_SQL = `
  SELECT
    CHANNEL,
    CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR) AS PLATFORM_LINE_ITEM_ID,
    CAST(LINE_ITEM_ID AS VARCHAR) AS LINE_ITEM_ID,
    CAST(LINE_ITEM_NAME AS VARCHAR) AS LINE_ITEM_NAME,
    CAST(MBA_NUMBER AS VARCHAR) AS MBA_NUMBER,
    CAST(NOTES AS VARCHAR) AS NOTES
  FROM ${LINE_ITEM_LABEL_MAP}
  WHERE IS_ACTIVE = TRUE
`

export async function queryAllActiveLabelMap(): Promise<RelabelMapRow[]> {
  const rows = await querySnowflake<Record<string, unknown>>(LABEL_MAP_ALL_ACTIVE_SQL, [], {
    label: "relabel-drift-map",
  })
  return rows.map((row) => ({
    channel: String(row.CHANNEL ?? ""),
    platformLineItemId: String(row.PLATFORM_LINE_ITEM_ID ?? ""),
    lineItemId: normalizeLineItemId(row.LINE_ITEM_ID as string | null) || null,
    mbaNumber: row.MBA_NUMBER == null ? null : String(row.MBA_NUMBER),
  }))
}

export async function computeRelabelDrift(): Promise<RelabelDriftReport> {
  const [mapRows, applied] = await Promise.all([
    queryAllActiveLabelMap(),
    listRelabels({ status: "applied" }),
  ])
  return compareRelabelMap(mapRows, applied)
}

/**
 * Prefer the nightly snapshot; fall back to a live compare so the 7am digest
 * still renders before 0086 is applied.
 */
export async function listRelabelDrift(): Promise<RelabelDriftFinding[]> {
  try {
    const stored = await readLatestRelabelDriftSnapshot()
    if (stored) return stored.findings
  } catch (err) {
    console.error("[relabel-drift] snapshot read failed", err)
  }
  try {
    return (await computeRelabelDrift()).findings
  } catch (err) {
    if (isMissingRelabelTable(err)) return []
    console.error("[relabel-drift] compute failed", err)
    return []
  }
}

export async function runRelabelDriftCheck(asOfDate: string): Promise<RelabelDriftSnapshotRecord> {
  const started = Date.now()
  const report = await computeRelabelDrift()
  return upsertRelabelDriftSnapshot({
    asOfDate,
    report,
    durationMs: Date.now() - started,
  })
}
