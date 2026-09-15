import type { ParsedPartnerFile, PartnerFileParseTests, ParseTestResult } from "./types"

const T5_MAX_DRIFT = 0.02

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

function t4(parsed: ParsedPartnerFile): ParseTestResult {
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

export function runPartnerFileParseTests(
  parsed: ParsedPartnerFile,
  expectedHeader: string | null
): PartnerFileParseTests {
  const t1r = t1(parsed, expectedHeader)
  const t4r = t4(parsed)
  const t5r = t5(parsed)
  return {
    t1: t1r,
    t4: t4r,
    t5: t5r,
    failed: !t1r.ok || !t4r.ok || !t5r.ok,
  }
}
