import { cellDisplay, headerIndex, parseNumber } from "./parsers/shared"
import type { ParsedPartnerFile, PartnerFileParseTests, ParseTestResult } from "./types"

const T5_MAX_DRIFT = 0.02
const T6_MAX_DRIFT = 0.005

const NO_VIDEO = "n/a: no video columns"

function t1(
  parsed: ParsedPartnerFile,
  expectedHeader: string | null
): ParseTestResult {
  const expected = (expectedHeader ?? "").trim()
  const detected = parsed.detectedHeader.trim()
  const ok = expected !== "" && detected === expected
  return {
    name: "T1",
    ok,
    detail: ok
      ? "header matches EXPECTED_HEADER"
      : `header drift: detected=${JSON.stringify(detected)} expected=${JSON.stringify(expected)}`,
  }
}

/** A source with no video columns at all (Vistar, prog OOH) makes T4/T5 meaningless. */
function hasNoVideo(parsed: ParsedPartnerFile): boolean {
  return parsed.rows.every((r) => r.videoViews === 0)
}

function t4(parsed: ParsedPartnerFile): ParseTestResult {
  if (hasNoVideo(parsed)) return { name: "T4", ok: true, detail: NO_VIDEO }
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]!
    if (
      row.rateQ25 < row.rateQ50 ||
      row.rateQ50 < row.rateQ75 ||
      row.rateQ75 < row.rateFullyPlayed
    ) {
      return {
        name: "T4",
        ok: false,
        detail: `rate order inverted on data row ${i + 1} (${row.partnerLineItemName ?? ""} ${row.reportDate}): Q25=${row.rateQ25} Q50=${row.rateQ50} Q75=${row.rateQ75} full=${row.rateFullyPlayed}`,
      }
    }
  }
  return { name: "T4", ok: true, detail: "quartile rates are monotonically decreasing" }
}

function t5(parsed: ParsedPartnerFile): ParseTestResult {
  if (hasNoVideo(parsed)) return { name: "T5", ok: true, detail: NO_VIDEO }
  const scoped = parsed.rows.filter((r) => r.videoViews > 0)
  const excludedZeroView = parsed.rows.length - scoped.length
  if (scoped.length === 0) {
    return {
      name: "T5",
      ok: true,
      detail: `no VIDEO_VIEWS > 0 rows; T5 skipped (excluded_zero_view=${excludedZeroView})`,
    }
  }
  const completed = scoped.reduce((n, r) => n + r.completedViews, 0)
  const videoViews = scoped.reduce((n, r) => n + r.videoViews, 0)
  const drift = Math.abs(completed - videoViews) / videoViews
  const ok = drift <= T5_MAX_DRIFT
  return {
    name: "T5",
    ok,
    value: drift,
    detail: `completed_vs_video_views drift=${drift.toFixed(5)} (completed=${completed} video_views=${videoViews} scoped_rows=${scoped.length} excluded_zero_view=${excludedZeroView})`,
  }
}

type TotalsRow = {
  fileRow: number
  impressions: number
  revenue: number | null
}

/** A supplier totals row: blank first cell, numeric Impressions. */
function findTotalsRow(
  matrix: unknown[][],
  parsed: ParsedPartnerFile
): TotalsRow | null {
  if (parsed.headerRow <= 0 || matrix.length === 0) return null
  const cols = headerIndex(matrix[parsed.headerRow - 1] ?? [])
  const impressionsCol = cols.get("Impressions")
  if (impressionsCol == null) return null
  const revenueCol = cols.get("Revenue")
  for (let i = parsed.headerRow; i < matrix.length; i++) {
    const cells = matrix[i] ?? []
    if (cellDisplay(cells[0] ?? "").trim() !== "") continue
    const impressions = parseNumber(cells[impressionsCol])
    if (!Number.isFinite(impressions) || impressions <= 0) continue
    const revenue = revenueCol == null ? null : parseNumber(cells[revenueCol])
    return { fileRow: i + 1, impressions, revenue }
  }
  return null
}

function t6(parsed: ParsedPartnerFile, matrix: unknown[][]): ParseTestResult {
  const totals = findTotalsRow(matrix, parsed)
  if (!totals) {
    return { name: "T6", ok: true, detail: "n/a: file has no totals row" }
  }
  const impressions = parsed.rows.reduce((n, r) => n + r.impressions, 0)
  const impressionsDrift = Math.abs(impressions - totals.impressions) / totals.impressions
  const parts = [
    `impressions drift=${impressionsDrift.toFixed(5)} (parsed=${impressions} totals=${totals.impressions})`,
  ]
  let ok = impressionsDrift <= T6_MAX_DRIFT

  if (totals.revenue != null && totals.revenue > 0) {
    const revenue = parsed.rows.reduce((n, r) => n + (r.amountSpent ?? 0), 0)
    const revenueDrift = Math.abs(revenue - totals.revenue) / totals.revenue
    parts.push(
      `revenue drift=${revenueDrift.toFixed(5)} (parsed=${revenue} totals=${totals.revenue})`
    )
    ok = ok && revenueDrift <= T6_MAX_DRIFT
  }

  return {
    name: "T6",
    ok,
    value: impressionsDrift,
    detail: `totals row ${totals.fileRow}: ${parts.join(", ")}`,
  }
}

export function runPartnerFileParseTests(
  parsed: ParsedPartnerFile,
  expectedHeader: string | null,
  matrix: unknown[][] = []
): PartnerFileParseTests {
  const t1r = t1(parsed, expectedHeader)
  const t4r = t4(parsed)
  const t5r = t5(parsed)
  const t6r = t6(parsed, matrix)
  return {
    t1: t1r,
    t4: t4r,
    t5: t5r,
    t6: t6r,
    failed: !t1r.ok || !t4r.ok || !t5r.ok || !t6r.ok,
  }
}
