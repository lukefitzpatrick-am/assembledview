import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns"
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
 * Day-grained edge resize sets precise overrides instead.
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

export type SpanEdgeResizeMode = "day" | "week"

/** Effective burst YMD bounds: span overrides when set, else week-window. */
export function effectiveSpanYmdBounds(
  span: ExpertSpanWithWeekRange,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): { startYmd: string; endYmd: string } | null {
  const window = weekWindowYmdForSpan(
    span.startWeekKey,
    span.endWeekKey,
    weekColumns,
    campaignStartDate,
    campaignEndDate
  )
  if (!window) return null
  return {
    startYmd: span.startYmd ?? window.startYmd,
    endYmd: span.endYmd ?? window.endYmd,
  }
}

/** Resolve the YMD of the edge being dragged. */
export function spanEdgeYmd(
  span: ExpertSpanWithWeekRange,
  edge: "start" | "end",
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): string | null {
  const bounds = effectiveSpanYmdBounds(
    span,
    weekColumns,
    campaignStartDate,
    campaignEndDate
  )
  if (!bounds) return null
  return edge === "start" ? bounds.startYmd : bounds.endYmd
}

export function weekKeyForYmd(
  ymd: string,
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>
): string | null {
  for (const [weekKey, dayKeys] of Object.entries(dayKeysByWeekKey)) {
    if (dayKeys.includes(ymd)) return weekKey
  }
  return null
}

function daysInclusiveBetween(startYmd: string, endYmd: string): number {
  const s = parseYmd(startYmd)
  const e = parseYmd(endYmd)
  if (!s || !e) return 0
  return differenceInCalendarDays(e, s) + 1
}

function addDaysYmd(ymd: string, delta: number): string | null {
  const d = parseYmd(ymd)
  if (!d) return null
  return formatYmd(addDays(d, delta))
}

export type SpanEdgeDayDeltaBounds = Readonly<{
  minDelta: number
  maxDelta: number
}>

/**
 * Day-grained drag clamp bounds for a span edge.
 * `weekBlocked` mirrors the week-mode obstruction predicate (sibling span,
 * populated week cell, or day-detailed week).
 */
export function spanEdgeDayDeltaBounds(
  span: ExpertSpanWithWeekRange,
  edge: "start" | "end",
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>,
  weekBlocked: (weekKey: string) => boolean
): SpanEdgeDayDeltaBounds | null {
  const bounds = effectiveSpanYmdBounds(
    span,
    weekColumns,
    campaignStartDate,
    campaignEndDate
  )
  if (!bounds) return null

  const campaignStartYmd = formatYmd(campaignStartDate)
  const campaignEndYmd = formatYmd(campaignEndDate)
  const edgeYmd =
    edge === "start" ? bounds.startYmd : bounds.endYmd
  const spanDays = daysInclusiveBetween(bounds.startYmd, bounds.endYmd)

  const isDayBlocked = (ymd: string): boolean => {
    const wk = weekKeyForYmd(ymd, dayKeysByWeekKey)
    return wk !== null && weekBlocked(wk)
  }

  if (edge === "end") {
    const minDelta = -(spanDays - 1)
    let maxDelta = 0
    let cursor = edgeYmd
    while (true) {
      const next = addDaysYmd(cursor, 1)
      if (!next) break
      if (next > campaignEndYmd) break
      if (isDayBlocked(next)) break
      maxDelta += 1
      cursor = next
    }
    return { minDelta, maxDelta }
  }

  const maxDelta = spanDays - 1
  let minDelta = 0
  let cursor = edgeYmd
  while (true) {
    const prev = addDaysYmd(cursor, -1)
    if (!prev) break
    if (prev < campaignStartYmd) break
    if (isDayBlocked(prev)) break
    minDelta -= 1
    cursor = prev
  }
  return { minDelta, maxDelta }
}

export type SpanEdgeDayPxContext = Readonly<{
  weekKeys: readonly string[]
  expandedWeekKeys: ReadonlySet<string>
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>
  weekColumnWidths: Readonly<Record<string, number>>
  defaultWeekColWidthPx: number
  dayColWidthPx: number
}>

function widthPerDayPx(ctx: SpanEdgeDayPxContext, weekKey: string): number {
  const dayCount = Math.max(1, (ctx.dayKeysByWeekKey[weekKey] ?? []).length)
  if (ctx.expandedWeekKeys.has(weekKey)) {
    return ctx.dayColWidthPx
  }
  const weekW = ctx.weekColumnWidths[weekKey] ?? ctx.defaultWeekColWidthPx
  return weekW / dayCount
}

/** Horizontal drag distance → whole days crossed (mixed expanded/collapsed columns). */
export function deltaDaysFromPx(
  edgeYmd: string,
  dx: number,
  ctx: SpanEdgeDayPxContext
): number {
  const days: { ymd: string; width: number }[] = []
  for (const wk of ctx.weekKeys) {
    const dks = ctx.dayKeysByWeekKey[wk] ?? []
    const wpd = widthPerDayPx(ctx, wk)
    for (const dk of dks) {
      days.push({ ymd: dk, width: wpd })
    }
  }
  const edgeIdx = days.findIndex((d) => d.ymd === edgeYmd)
  if (edgeIdx < 0) return 0

  let remaining = Math.abs(dx)
  let steps = 0
  if (dx > 0) {
    for (let i = edgeIdx + 1; i < days.length; i += 1) {
      const w = days[i]!.width
      if (remaining < w / 2) break
      remaining -= w
      steps += 1
    }
    return steps
  }
  for (let i = edgeIdx; i >= 0; i -= 1) {
    const w = days[i]!.width
    if (remaining < w / 2) break
    remaining -= w
    steps += 1
  }
  return -steps
}

export type ResizeSpanEdgeByDaysResult = Readonly<{
  startYmd: string
  endYmd: string
  startWeekKey: string
  endWeekKey: string
}>

/**
 * Apply a signed day delta to one span edge; clamps to campaign, min 1-day span,
 * and the caller-supplied day delta bounds from {@link spanEdgeDayDeltaBounds}.
 */
export function resizeSpanEdgeByDays(
  span: ExpertSpanWithWeekRange,
  edge: "start" | "end",
  deltaDays: number,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>,
  deltaBounds: SpanEdgeDayDeltaBounds
): ResizeSpanEdgeByDaysResult | null {
  if (deltaDays === 0) return null

  const bounds = effectiveSpanYmdBounds(
    span,
    weekColumns,
    campaignStartDate,
    campaignEndDate
  )
  if (!bounds) return null

  const clampedDelta = Math.min(
    deltaBounds.maxDelta,
    Math.max(deltaBounds.minDelta, deltaDays)
  )
  if (clampedDelta === 0) return null

  const edgeYmd =
    edge === "start" ? bounds.startYmd : bounds.endYmd
  const newEdgeYmd = addDaysYmd(edgeYmd, clampedDelta)
  if (!newEdgeYmd) return null

  const campaignStartYmd = formatYmd(campaignStartDate)
  const campaignEndYmd = formatYmd(campaignEndDate)
  const clampedEdge =
    newEdgeYmd < campaignStartYmd
      ? campaignStartYmd
      : newEdgeYmd > campaignEndYmd
        ? campaignEndYmd
        : newEdgeYmd

  let startYmd = bounds.startYmd
  let endYmd = bounds.endYmd
  if (edge === "start") {
    startYmd = clampedEdge
  } else {
    endYmd = clampedEdge
  }

  if (startYmd > endYmd) return null

  const startWeekKey = weekKeyForYmd(startYmd, dayKeysByWeekKey)
  const endWeekKey = weekKeyForYmd(endYmd, dayKeysByWeekKey)
  if (!startWeekKey || !endWeekKey) return null

  return { startYmd, endYmd, startWeekKey, endWeekKey }
}

export type SpanPartialCoveragePlan = Readonly<{
  startYmd: string
  endYmd: string
  leadingDayKeys: readonly string[]
  anchorColUnits: number
  trailingDayKeys: readonly string[]
}>

/**
 * Partial-week render plan when a span's edge week is expanded: leading/trailing
 * uncovered day cells plus anchor colSpan units for covered days only.
 */
export function spanPartialCoveragePlan(
  span: ExpertSpanWithWeekRange,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  expandedWeekKeys: ReadonlySet<string>,
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>
): SpanPartialCoveragePlan | null {
  const bounds = effectiveSpanYmdBounds(
    span,
    weekColumns,
    campaignStartDate,
    campaignEndDate
  )
  if (!bounds) return null

  const { startYmd, endYmd } = bounds
  const spanWeekKeys = weekKeysInSpanInclusive(
    weekColumns.map((c) => c.weekKey),
    span.startWeekKey,
    span.endWeekKey
  )

  const leadingDayKeys: string[] = []
  const trailingDayKeys: string[] = []
  let anchorColUnits = 0

  for (const wk of spanWeekKeys) {
    const dayKeys = [...(dayKeysByWeekKey[wk] ?? [])]
    const isStart = wk === span.startWeekKey
    const isEnd = wk === span.endWeekKey
    const expanded = expandedWeekKeys.has(wk)

    if (!expanded) {
      anchorColUnits += 1
      continue
    }

    if (isStart && isEnd) {
      for (const dk of dayKeys) {
        if (dk < startYmd) leadingDayKeys.push(dk)
        else if (dk > endYmd) trailingDayKeys.push(dk)
        else anchorColUnits += 1
      }
      continue
    }

    if (isStart) {
      for (const dk of dayKeys) {
        if (dk < startYmd) leadingDayKeys.push(dk)
        else anchorColUnits += 1
      }
      continue
    }

    if (isEnd) {
      for (const dk of dayKeys) {
        if (dk > endYmd) trailingDayKeys.push(dk)
        else anchorColUnits += 1
      }
      continue
    }

    anchorColUnits += dayKeys.length
  }

  return {
    startYmd,
    endYmd,
    leadingDayKeys,
    anchorColUnits: Math.max(1, anchorColUnits),
    trailingDayKeys,
  }
}
