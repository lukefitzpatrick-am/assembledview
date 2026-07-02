import { format, startOfDay } from "date-fns"
import {
  clampDateToCampaignRange,
  type WeeklyGanttWeekColumn,
} from "@/lib/utils/weeklyGanttColumns"
import { weekKeysInSpanInclusive } from "@/lib/mediaplan/expertGridShared"
import type { OohExpertMergedWeekSpan } from "@/lib/mediaplan/expertModeWeeklySchedule"

/** Span fields that may carry exact burst-window overrides (ISO yyyy-MM-dd). */
export type ExpertSpanDateOverrides = Readonly<{
  startYmd?: string
  endYmd?: string
}>

export type ExpertSpanWithWeekRange = ExpertSpanDateOverrides &
  Readonly<{
    startWeekKey: string
    endWeekKey: string
  }>

function formatYmd(d: Date): string {
  return format(startOfDay(d), "yyyy-MM-dd")
}

function parseYmd(ymd: string): Date | null {
  const d = startOfDay(new Date(`${ymd}T12:00:00`))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Sun–Sat window for a week column, clamped to campaign bounds (matches standard burst export). */
export function burstWindowForWeekColumn(
  col: WeeklyGanttWeekColumn,
  campaignStartDate: Date,
  campaignEndDate: Date
): { start: Date; end: Date } {
  const start = clampDateToCampaignRange(
    col.weekStart,
    campaignStartDate,
    campaignEndDate
  )
  const end = clampDateToCampaignRange(
    col.weekEnd,
    campaignStartDate,
    campaignEndDate
  )
  return { start: startOfDay(start), end: startOfDay(end) }
}

/** Week-window YMD bounds for a span's start/end week columns. */
export function weekWindowYmdForSpan(
  startWeekKey: string,
  endWeekKey: string,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): { startYmd: string; endYmd: string } | null {
  const startCol = weekColumns.find((c) => c.weekKey === startWeekKey)
  const endCol = weekColumns.find((c) => c.weekKey === endWeekKey)
  if (!startCol || !endCol) return null
  const { start } = burstWindowForWeekColumn(
    startCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    endCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startYmd: formatYmd(start), endYmd: formatYmd(end) }
}

/**
 * OVERRIDE MAINTENANCE RULE (single source of truth):
 * Any operation that changes a span's week range (merge create, drag-move,
 * week-grained edge resize, unmerge removes the span entirely) clears
 * `startYmd`/`endYmd` so export falls back to week-window bounds.
 * Day-grained resize (future) will set precise overrides instead.
 *
 * Absent overrides → existing week-window export behaviour (backward compatible).
 */
export function clearSpanDateOverridesOnWeekRangeChange<
  T extends ExpertSpanWithWeekRange,
>(span: T, startWeekKey: string, endWeekKey: string): T {
  const { startYmd: _s, endYmd: _e, ...rest } = span
  return { ...rest, startWeekKey, endWeekKey } as T
}

/** Resolve burst start/end dates for export: span overrides when present, else week window. */
export function burstDatesForExpertSpan(
  span: ExpertSpanDateOverrides,
  startCol: WeeklyGanttWeekColumn,
  endCol: WeeklyGanttWeekColumn,
  campaignStartDate: Date,
  campaignEndDate: Date
): { start: Date; end: Date } {
  const window = burstWindowForWeekColumn(
    startCol,
    campaignStartDate,
    campaignEndDate
  )
  const windowEnd = burstWindowForWeekColumn(
    endCol,
    campaignStartDate,
    campaignEndDate
  ).end

  if (span.startYmd && span.endYmd) {
    const sd = parseYmd(span.startYmd)
    const ed = parseYmd(span.endYmd)
    if (sd && ed) {
      return {
        start: startOfDay(
          clampDateToCampaignRange(sd, campaignStartDate, campaignEndDate)
        ),
        end: startOfDay(
          clampDateToCampaignRange(ed, campaignStartDate, campaignEndDate)
        ),
      }
    }
  }

  return { start: window.start, end: windowEnd }
}

/** True when proposed span weeks overlap any existing span on the row. */
export function spanWeekRangeConflictsOccupancy(
  startWeekKey: string,
  endWeekKey: string,
  existingSpans: readonly ExpertSpanWithWeekRange[],
  weekKeyOrder: readonly string[]
): boolean {
  const proposed = new Set(
    weekKeysInSpanInclusive(weekKeyOrder, startWeekKey, endWeekKey)
  )
  for (const span of existingSpans) {
    for (const k of weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )) {
      if (proposed.has(k)) return true
    }
  }
  return false
}

export type ImportBurstAsSpanParams = Readonly<{
  burstStart: Date
  burstEnd: Date
  totalQty: number
  weekColumns: readonly WeeklyGanttWeekColumn[]
  campaignStartDate: Date
  campaignEndDate: Date
  overlapKeys: readonly string[]
  existingSpans: OohExpertMergedWeekSpan[]
  rowIndex: number
  mergeIdx: number
}>

/**
 * Multi-week standard burst → one merged span with exact date overrides when
 * the overlap range does not conflict with existing spans on the row.
 * Returns null when the caller should fall back to distribute-into-cells.
 */
export function tryImportMultiWeekBurstAsMergedSpan(
  params: ImportBurstAsSpanParams
): { span: OohExpertMergedWeekSpan; nextMergeIdx: number } | null {
  const {
    burstStart,
    burstEnd,
    totalQty,
    weekColumns,
    campaignStartDate,
    campaignEndDate,
    overlapKeys,
    existingSpans,
    rowIndex,
    mergeIdx,
  } = params

  if (overlapKeys.length <= 1) return null

  const startWeekKey = overlapKeys[0]!
  const endWeekKey = overlapKeys[overlapKeys.length - 1]!
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)

  if (
    spanWeekRangeConflictsOccupancy(
      startWeekKey,
      endWeekKey,
      existingSpans,
      weekKeyOrder
    )
  ) {
    return null
  }

  const clampedStart = startOfDay(
    clampDateToCampaignRange(burstStart, campaignStartDate, campaignEndDate)
  )
  const clampedEnd = startOfDay(
    clampDateToCampaignRange(burstEnd, campaignStartDate, campaignEndDate)
  )

  return {
    span: {
      id: `std-${rowIndex}-m${mergeIdx}`,
      startWeekKey,
      endWeekKey,
      totalQty,
      startYmd: formatYmd(clampedStart),
      endYmd: formatYmd(clampedEnd),
    },
    nextMergeIdx: mergeIdx + 1,
  }
}

/** Exact burst YMD overrides for Family A/B spans created at import. */
export function burstYmdOverridesForImport(
  burstStart: Date,
  burstEnd: Date,
  campaignStartDate: Date,
  campaignEndDate: Date
): { startYmd: string; endYmd: string } {
  const start = startOfDay(
    clampDateToCampaignRange(burstStart, campaignStartDate, campaignEndDate)
  )
  const end = startOfDay(
    clampDateToCampaignRange(burstEnd, campaignStartDate, campaignEndDate)
  )
  return { startYmd: formatYmd(start), endYmd: formatYmd(end) }
}
