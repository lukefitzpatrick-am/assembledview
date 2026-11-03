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

/**
 * B23fix: the two B23 columns (FIXED_COST_FROM, FIXED_COST_BURSTS_JSON) are
 * named only when the snapshot has them (Snowflake part A ran). Without them
 * every statement is the pre-B23 text, so part A can run any time before
 * `fixed_cost_report_net` goes on.
 */
const FIXED_COST_STAGE_COLUMNS = `,
      FIXED_COST_FROM DATE,
      FIXED_COST_BURSTS_JSON VARIANT`

/** The two SET lines, shared by the prune merge and the batch merge. */
export const FIXED_COST_MERGE_SET = `      FIXED_COST_FROM  = s.FIXED_COST_FROM,
      FIXED_COST_BURSTS_JSON = s.FIXED_COST_BURSTS_JSON,
`

/** Snapshot columns probe (Snowflake part A adds both). */
export const SNAPSHOT_FIXED_COST_COLUMNS_SQL = `
    SELECT COLUMN_NAME
    FROM ASSEMBLEDVIEW.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'MART'
      AND TABLE_NAME = 'XANO_LINE_ITEMS_SNAPSHOT'
      AND COLUMN_NAME IN ('FIXED_COST_FROM', 'FIXED_COST_BURSTS_JSON')
  `

/** True when the probe found both columns. */
export function snapshotHasFixedCostColumns(rows: ReadonlyArray<Record<string, unknown>>): boolean {
  const names = new Set(rows.map((r) => String(r.COLUMN_NAME ?? r.column_name ?? "").toUpperCase()))
  return names.has("FIXED_COST_FROM") && names.has("FIXED_COST_BURSTS_JSON")
}

export function buildSnapshotPruneStageCreateSql(stageTable: string, fixedCostColumns = true): string {
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
      XANO_CREATED_AT NUMBER,
      NO_ADSERVING BOOLEAN,
      ASSUME_SPEND BOOLEAN${fixedCostColumns ? FIXED_COST_STAGE_COLUMNS : ""}
    )
  `
}

export function buildSnapshotPruneStageInsertSql(
  stageTable: string,
  rowCount: number,
  fixedCostColumns = true,
): string {
  const valuesPlaceholders = Array(rowCount)
    .fill(
      fixedCostColumns
        ? "(?, ?, ?, ?, ?, ?, PARSE_JSON(?), ?, ?, ?, ?, ?, ?, PARSE_JSON(?))"
        : "(?, ?, ?, ?, ?, ?, PARSE_JSON(?), ?, ?, ?, ?, ?)",
    )
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
      XANO_CREATED_AT,
      NO_ADSERVING,
      ASSUME_SPEND${fixedCostColumns ? ",\n      FIXED_COST_FROM,\n      FIXED_COST_BURSTS_JSON" : ""}
    )
    VALUES
      ${valuesPlaceholders}
  `
}

export function buildSnapshotPruneDeleteSql(stageTable: string): string {
  return `
    DELETE FROM ${SNAPSHOT}
    WHERE LINE_ITEM_ID IS NOT NULL
      AND LOWER(TRIM(LINE_ITEM_ID)) NOT IN (
        SELECT LOWER(TRIM(LINE_ITEM_ID))
        FROM ${stageTable}
      )
  `
}

export function buildSnapshotPruneMergeSql(stageTable: string, fixedCostColumns = true): string {
  return `
    MERGE INTO ${SNAPSHOT} t
    USING ${stageTable} s
    ON LOWER(TRIM(t.LINE_ITEM_ID)) = LOWER(TRIM(s.LINE_ITEM_ID))
    WHEN MATCHED THEN UPDATE SET
      LINE_ITEM_ID     = LOWER(TRIM(s.LINE_ITEM_ID)),
      MBA_NUMBER       = LOWER(TRIM(s.MBA_NUMBER)),
      LINE_ITEM_NAME   = LOWER(TRIM(COALESCE(s.LINE_ITEM_NAME, ''))),
      PLATFORM         = s.PLATFORM,
      BUY_TYPE         = s.BUY_TYPE,
      FIXED_COST_MEDIA = s.FIXED_COST_MEDIA,
      BURSTS_JSON      = s.BURSTS_JSON,
      SOURCE_TABLE     = s.SOURCE_TABLE,
      XANO_ROW_ID      = s.XANO_ROW_ID,
      XANO_CREATED_AT  = s.XANO_CREATED_AT,
      NO_ADSERVING     = COALESCE(s.NO_ADSERVING, t.NO_ADSERVING),
      ASSUME_SPEND     = COALESCE(s.ASSUME_SPEND, t.ASSUME_SPEND),
${fixedCostColumns ? FIXED_COST_MERGE_SET : ""}      SYNCED_AT        = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
      LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME, PLATFORM, BUY_TYPE,
      FIXED_COST_MEDIA, BURSTS_JSON, SOURCE_TABLE, XANO_ROW_ID, XANO_CREATED_AT,
      NO_ADSERVING, ASSUME_SPEND, ${fixedCostColumns ? "FIXED_COST_FROM, FIXED_COST_BURSTS_JSON, " : ""}SYNCED_AT
    ) VALUES (
      LOWER(TRIM(s.LINE_ITEM_ID)), LOWER(TRIM(s.MBA_NUMBER)),
      LOWER(TRIM(COALESCE(s.LINE_ITEM_NAME, ''))),
      s.PLATFORM, s.BUY_TYPE,
      s.FIXED_COST_MEDIA, s.BURSTS_JSON, s.SOURCE_TABLE, s.XANO_ROW_ID, s.XANO_CREATED_AT,
      s.NO_ADSERVING, s.ASSUME_SPEND, ${fixedCostColumns ? "s.FIXED_COST_FROM, s.FIXED_COST_BURSTS_JSON, " : ""}CURRENT_TIMESTAMP()
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
