const SNAPSHOT = "ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT"
const DEFAULT_SNAPSHOT_PRUNE_MAX = 1000

export type SnapshotPruneMode = "off" | "dryrun" | "active"

export interface SnapshotPruneQueries {
  mode: SnapshotPruneMode
  binds: string[]
  countSql: string
  sampleSql: string
}

export interface SnapshotPruneSampleRow {
  lineItemId: string
  mbaNumber: string
  sourceTable: string
}

export interface SnapshotPruneLogInput {
  mode: SnapshotPruneMode
  orphanCount: number
  fixedCostMediaOrphanCount: number
  sample: SnapshotPruneSampleRow[]
}

export function readSnapshotPruneMax(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_SNAPSHOT_PRUNE_MAX

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_SNAPSHOT_PRUNE_MAX

  return Math.floor(parsed)
}

export function normaliseSnapshotPruneMode(raw: string | undefined): SnapshotPruneMode {
  if (raw === "off" || raw === "dryrun" || raw === "active") return raw
  return "dryrun"
}

function dedupeLineItemIds(lineItemIds: string[]): string[] {
  return Array.from(new Set(lineItemIds.filter((id) => id.trim() !== "")))
}

function buildOrphanCandidatesCte(binds: string[]): string {
  if (binds.length === 0) {
    return `
      orphan_candidates AS (
        SELECT LINE_ITEM_ID, MBA_NUMBER, SOURCE_TABLE, FIXED_COST_MEDIA
        FROM ${SNAPSHOT}
        WHERE LINE_ITEM_ID IS NOT NULL
      )
    `
  }

  const placeholders = binds.map(() => "(?)").join(", ")
  return `
    keep_set AS (
      SELECT column1::VARCHAR AS LINE_ITEM_ID
      FROM VALUES ${placeholders}
    ),
    orphan_candidates AS (
      SELECT s.LINE_ITEM_ID, s.MBA_NUMBER, s.SOURCE_TABLE, s.FIXED_COST_MEDIA
      FROM ${SNAPSHOT} s
      WHERE s.LINE_ITEM_ID IS NOT NULL
        AND s.LINE_ITEM_ID NOT IN (SELECT LINE_ITEM_ID FROM keep_set)
    )
  `
}

export function buildSnapshotPruneQueries(
  lineItemIds: string[],
  mode: SnapshotPruneMode
): SnapshotPruneQueries {
  const binds = dedupeLineItemIds(lineItemIds)
  const orphanCandidatesCte = buildOrphanCandidatesCte(binds)

  const countSql = `
    WITH ${orphanCandidatesCte}
    SELECT
      COUNT(*) AS ORPHAN_COUNT,
      COUNT_IF(FIXED_COST_MEDIA = TRUE) AS FIXED_COST_MEDIA_ORPHAN_COUNT
    FROM orphan_candidates
  `

  const sampleSql = `
    WITH ${orphanCandidatesCte}
    SELECT LINE_ITEM_ID, MBA_NUMBER, SOURCE_TABLE
    FROM orphan_candidates
    ORDER BY LINE_ITEM_ID
    LIMIT 10
  `

  return { mode, binds, countSql, sampleSql }
}

export function buildSnapshotPruneStageCreateSql(stageTable: string): string {
  return `
    CREATE OR REPLACE TRANSIENT TABLE ${stageTable} (
      LINE_ITEM_ID VARCHAR,
      MBA_NUMBER VARCHAR,
      LINE_ITEM_NAME VARCHAR,
      PLATFORM VARCHAR,
      BUY_TYPE VARCHAR,
      FIXED_COST_MEDIA BOOLEAN,
      BURSTS_JSON VARIANT,
      SOURCE_TABLE VARCHAR,
      XANO_ROW_ID NUMBER,
      XANO_CREATED_AT NUMBER
    )
  `
}

export function buildSnapshotPruneStageInsertSql(stageTable: string, rowCount: number): string {
  const valuesPlaceholders = Array(rowCount)
    .fill("(?, ?, ?, ?, ?, ?, PARSE_JSON(?), ?, ?, ?)")
    .join(",\n    ")

  return `
    INSERT INTO ${stageTable} (
      LINE_ITEM_ID,
      MBA_NUMBER,
      LINE_ITEM_NAME,
      PLATFORM,
      BUY_TYPE,
      FIXED_COST_MEDIA,
      BURSTS_JSON,
      SOURCE_TABLE,
      XANO_ROW_ID,
      XANO_CREATED_AT
    )
    VALUES
      ${valuesPlaceholders}
  `
}

export function buildSnapshotPruneDeleteSql(stageTable: string): string {
  return `
    DELETE FROM ${SNAPSHOT}
    WHERE LINE_ITEM_ID IS NOT NULL
      AND LINE_ITEM_ID NOT IN (
        SELECT LINE_ITEM_ID
        FROM ${stageTable}
      )
  `
}

export function buildSnapshotPruneMergeSql(stageTable: string): string {
  return `
    MERGE INTO ${SNAPSHOT} t
    USING ${stageTable} s
    ON t.LINE_ITEM_ID = s.LINE_ITEM_ID
    WHEN MATCHED THEN UPDATE SET
      MBA_NUMBER       = s.MBA_NUMBER,
      LINE_ITEM_NAME   = s.LINE_ITEM_NAME,
      PLATFORM         = s.PLATFORM,
      BUY_TYPE         = s.BUY_TYPE,
      FIXED_COST_MEDIA = s.FIXED_COST_MEDIA,
      BURSTS_JSON      = s.BURSTS_JSON,
      SOURCE_TABLE     = s.SOURCE_TABLE,
      XANO_ROW_ID      = s.XANO_ROW_ID,
      XANO_CREATED_AT  = s.XANO_CREATED_AT,
      SYNCED_AT        = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
      LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME, PLATFORM, BUY_TYPE,
      FIXED_COST_MEDIA, BURSTS_JSON, SOURCE_TABLE, XANO_ROW_ID, XANO_CREATED_AT, SYNCED_AT
    ) VALUES (
      s.LINE_ITEM_ID, s.MBA_NUMBER, s.LINE_ITEM_NAME, s.PLATFORM, s.BUY_TYPE,
      s.FIXED_COST_MEDIA, s.BURSTS_JSON, s.SOURCE_TABLE, s.XANO_ROW_ID, s.XANO_CREATED_AT, CURRENT_TIMESTAMP()
    )
  `
}

export function normaliseSnapshotPruneSampleRow(row: Record<string, unknown>): SnapshotPruneSampleRow {
  return {
    lineItemId: String(row.LINE_ITEM_ID ?? row.line_item_id ?? ""),
    mbaNumber: String(row.MBA_NUMBER ?? row.mba_number ?? ""),
    sourceTable: String(row.SOURCE_TABLE ?? row.source_table ?? ""),
  }
}

export function readSnapshotPruneCount(row: Record<string, unknown> | undefined): {
  orphanCount: number
  fixedCostMediaOrphanCount: number
} {
  return {
    orphanCount: Number(row?.ORPHAN_COUNT ?? row?.orphan_count ?? 0),
    fixedCostMediaOrphanCount: Number(
      row?.FIXED_COST_MEDIA_ORPHAN_COUNT ?? row?.fixed_cost_media_orphan_count ?? 0
    ),
  }
}

export function formatSnapshotPruneLog(input: SnapshotPruneLogInput): string {
  const sample = input.sample
    .map((row) => `${row.lineItemId} (${row.mbaNumber || "no_mba"}, ${row.sourceTable || "no_source_table"})`)
    .join("; ")

  return `[xano-sync] snapshot prune ${input.mode} dry-run: orphan_count=${input.orphanCount}, fixed_cost_media_orphan_count=${input.fixedCostMediaOrphanCount}, sample=${sample || "none"}`
}
