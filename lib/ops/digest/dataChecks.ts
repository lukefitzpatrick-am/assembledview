import "server-only"

import {
  LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL,
  labelMapDuplicateKeysFromRows,
  type LabelMapDuplicateKey,
} from "@/lib/pacing/relabel/labelMapActive"

/**
 * Data checks in the 07:00 pacing digest (B34, Luke's Q36 option A, C-180).
 * Switch `pacing_digest_data_checks`. Each check fails soft: an error or a
 * missing view gives a "check not available" line and the digest still sends.
 */

export const CM360_DRIFT_VIEW = "ASSEMBLEDVIEW.MART.VW_PACING_FACT_CM360_DRIFT"

/** Rows the email lists by name for each check. */
export const DATA_CHECK_SAMPLE_LIMIT = 10

export const CM360_DRIFT_COUNTS_SQL = `
  SELECT
    COUNT(*) AS TOTAL_ROWS,
    COUNT_IF(IN_REFRESH_WINDOW) AS IN_WINDOW_ROWS,
    COUNT_IF(NOT IN_REFRESH_WINDOW) AS OUT_OF_WINDOW_ROWS
  FROM ${CM360_DRIFT_VIEW}
`

/** Drift outside the 14-day MERGE window never self-heals: list it. */
export const CM360_DRIFT_OUT_OF_WINDOW_SQL = `
  SELECT
    CAST(DATE_DAY AS DATE) AS DATE_DAY,
    ENTITY_KEY,
    CAST(LINE_ITEM_ID AS VARCHAR) AS LINE_ITEM_ID,
    DRIFT_KIND,
    FACT_IMPRESSIONS,
    SOURCE_IMPRESSIONS,
    IMPRESSIONS_RATIO
  FROM ${CM360_DRIFT_VIEW}
  WHERE NOT IN_REFRESH_WINDOW
  ORDER BY DATE_DAY DESC, ENTITY_KEY
  LIMIT ${DATA_CHECK_SAMPLE_LIMIT}
`

export type DataCheckUnavailable = {
  status: "unavailable"
  /** `missing_view`: the object isn't there yet (CD1 not applied). */
  reason: "missing_view" | "error"
  message: string
}

export type Cm360DriftOutOfWindowRow = {
  dateDay: string
  entityKey: string
  lineItemId: string | null
  driftKind: string
  factImpressions: number | null
  sourceImpressions: number | null
  impressionsRatio: number | null
}

export type Cm360DriftCheck =
  | {
      status: "ok"
      totalRows: number
      inWindowRows: number
      outOfWindowRows: number
      outOfWindowSample: Cm360DriftOutOfWindowRow[]
    }
  | DataCheckUnavailable

export type LabelMapDuplicateCheck =
  | { status: "ok"; duplicateKeys: number; sample: LabelMapDuplicateKey[] }
  | DataCheckUnavailable

export type PacingDigestDataChecks = {
  cm360Drift: Cm360DriftCheck
  labelMapDuplicates: LabelMapDuplicateCheck
}

export type DataCheckQuery = (sqlText: string) => Promise<Array<Record<string, unknown>>>

export function isMissingSnowflakeObjectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /does not exist or not authorized/i.test(msg)
}

function unavailable(err: unknown): DataCheckUnavailable {
  const message = err instanceof Error ? err.message : String(err)
  return { status: "unavailable", reason: isMissingSnowflakeObjectError(err) ? "missing_view" : "error", message }
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function isoDay(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v ?? "").slice(0, 10)
}

export async function checkCm360Drift(query: DataCheckQuery): Promise<Cm360DriftCheck> {
  try {
    const counts = (await query(CM360_DRIFT_COUNTS_SQL))[0] ?? {}
    const outOfWindowRows = num(counts.OUT_OF_WINDOW_ROWS)
    const sample =
      outOfWindowRows > 0
        ? (await query(CM360_DRIFT_OUT_OF_WINDOW_SQL)).map((r) => ({
            dateDay: isoDay(r.DATE_DAY),
            entityKey: String(r.ENTITY_KEY ?? ""),
            lineItemId: r.LINE_ITEM_ID == null ? null : String(r.LINE_ITEM_ID),
            driftKind: String(r.DRIFT_KIND ?? ""),
            factImpressions: numOrNull(r.FACT_IMPRESSIONS),
            sourceImpressions: numOrNull(r.SOURCE_IMPRESSIONS),
            impressionsRatio: numOrNull(r.IMPRESSIONS_RATIO),
          }))
        : []
    return {
      status: "ok",
      totalRows: num(counts.TOTAL_ROWS),
      inWindowRows: num(counts.IN_WINDOW_ROWS),
      outOfWindowRows,
      outOfWindowSample: sample,
    }
  } catch (err) {
    console.warn("[pacing-digest] CM360 drift check not available", err)
    return unavailable(err)
  }
}

export async function checkLabelMapDuplicates(query: DataCheckQuery): Promise<LabelMapDuplicateCheck> {
  try {
    const keys = labelMapDuplicateKeysFromRows(await query(LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL))
    return { status: "ok", duplicateKeys: keys.length, sample: keys.slice(0, DATA_CHECK_SAMPLE_LIMIT) }
  } catch (err) {
    console.warn("[pacing-digest] label map duplicate check not available", err)
    return unavailable(err)
  }
}

export async function runPacingDigestDataChecks(query: DataCheckQuery): Promise<PacingDigestDataChecks> {
  const [cm360Drift, labelMapDuplicates] = await Promise.all([
    checkCm360Drift(query),
    checkLabelMapDuplicates(query),
  ])
  return { cm360Drift, labelMapDuplicates }
}

export type LoadDataChecksDeps = {
  isOn: () => Promise<boolean>
  query: DataCheckQuery
}

/** Null when the switch is off (or its read fails): the digest has no data checks section. */
export async function loadPacingDigestDataChecks(deps: LoadDataChecksDeps): Promise<PacingDigestDataChecks | null> {
  let on = false
  try {
    on = await deps.isOn()
  } catch (err) {
    console.warn("[pacing-digest] pacing_digest_data_checks read failed; treating as off", err)
  }
  if (!on) return null
  return runPacingDigestDataChecks(deps.query)
}
