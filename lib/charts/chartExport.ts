/**
 * B2-1 — chart export filename + CSV series serialisation (raw numbers).
 */

export type ChartExportSeriesInput = {
  /** Pre-shaped tabular rows. */
  rows?: Record<string, unknown>[]
  /** Chart `data` prop (wide rows). */
  data?: Record<string, unknown>[]
  /** X / category column when using `data`. */
  xKey?: string
  /** One column per series when using `data`. */
  seriesKeys?: string[]
  /** Explicit column order (rows or data). */
  columns?: string[]
}

export type NormalizedChartExport = {
  rows: Record<string, unknown>[]
  columns: string[]
}

/** Slug segment for export filenames (lowercase, hyphenated). */
export function slugifyChartExportPart(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "chart"
}

function yyyymmdd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

/**
 * `{page}-{chart-title-slug}-{yyyymmdd}.{png|csv}`
 */
export function chartExportFilename(
  page: string,
  title: string,
  ext: "png" | "csv",
  date: Date = new Date()
): string {
  return `${slugifyChartExportPart(page)}-${slugifyChartExportPart(title)}-${yyyymmdd(date)}.${ext}`
}

/**
 * Serialise chart series for CSV: columns = x + one per series.
 * Values are left raw (numbers stay numbers → stringified without display formatting).
 */
export function normalizeChartExportSeries(
  input: ChartExportSeriesInput
): NormalizedChartExport | null {
  if (input.rows?.length) {
    const columns =
      input.columns?.length ? input.columns : Object.keys(input.rows[0] ?? {})
    if (!columns.length) return null
    return { rows: input.rows, columns }
  }

  const data = input.data
  const xKey = input.xKey
  const seriesKeys = input.seriesKeys
  if (!data?.length || !xKey || !seriesKeys?.length) return null

  const columns = input.columns?.length
    ? input.columns
    : [xKey, ...seriesKeys]
  const rows = data.map((row) => {
    const out: Record<string, unknown> = {}
    for (const col of columns) {
      out[col] = row[col]
    }
    return out
  })
  return { rows, columns }
}
