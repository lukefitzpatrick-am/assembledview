import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns"
import {
  clampDateToCampaignRange,
  type WeeklyGanttWeekColumn,
} from "@/lib/utils/weeklyGanttColumns"
import {
  collapseDailyToWeekly,
  weekHasDailyValues,
  type ExpertDailyValues,
} from "@/lib/mediaplan/expertDayModel"
import { weekKeysInSpanInclusive } from "@/lib/mediaplan/expertGridShared"
import type {
  ExpertWeeklyValues,
  OohExpertMergedWeekSpan,
} from "@/lib/mediaplan/expertModeWeeklySchedule"

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

export type ExpertRowScheduleFields = Readonly<{
  weeklyValues: ExpertWeeklyValues
  dailyValues?: ExpertDailyValues
  mergedWeekSpans?: ReadonlyArray<
    ExpertSpanWithWeekRange & { id: string; totalQty: number }
  >
}>

export type ExpertRowScheduledElement =
  | {
      kind: "span"
      spanId: string
      span: ExpertSpanWithWeekRange & { id: string; totalQty: number }
      startYmd: string
      endYmd: string
    }
  | {
      kind: "weekCell"
      weekKey: string
      qty: number
      startYmd: string
      endYmd: string
    }
  | {
      kind: "dayDetail"
      weekKey: string
      qty: number
      startYmd: string
      endYmd: string
    }

function weekCellQty(v: number | "" | undefined | null): number {
  if (v === "" || v === undefined || v === null) return 0
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function weekCellIsScheduled(v: number | "" | undefined | null): boolean {
  return weekCellQty(v) !== 0
}

function spanWeeksCovered(
  row: ExpertRowScheduleFields,
  weekKeys: readonly string[]
): Set<string> {
  const covered = new Set<string>()
  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    for (const k of weekKeysInSpanInclusive(
      weekKeys,
      span.startWeekKey,
      span.endWeekKey
    )) {
      covered.add(k)
    }
  }
  return covered
}

function activeDayKeysInWeek(
  daily: ExpertDailyValues | undefined,
  dayKeys: readonly string[]
): string[] {
  if (!daily) return []
  return dayKeys.filter((k) => {
    const v = daily[k]
    if (v === "" || v === undefined) return false
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) && n !== 0
  })
}

/** Enumerate scheduled spans, week cells, and day-detailed weeks on a row. */
export function enumerateExpertRowScheduledElements(
  row: ExpertRowScheduleFields,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>
): ExpertRowScheduledElement[] {
  const weekKeys = weekColumns.map((c) => c.weekKey)
  const covered = spanWeeksCovered(row, weekKeys)
  const out: ExpertRowScheduledElement[] = []

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const bounds = effectiveSpanYmdBounds(
      span,
      weekColumns,
      campaignStartDate,
      campaignEndDate
    )
    if (!bounds) continue
    out.push({
      kind: "span",
      spanId: span.id,
      span,
      startYmd: bounds.startYmd,
      endYmd: bounds.endYmd,
    })
  }

  for (const col of weekColumns) {
    if (covered.has(col.weekKey)) continue
    const dayKeys = [...(dayKeysByWeekKey[col.weekKey] ?? [])]
    const daily = row.dailyValues
    if (daily && weekHasDailyValues(daily, dayKeys)) {
      const active = activeDayKeysInWeek(daily, dayKeys)
      if (active.length === 0) continue
      const qty = collapseDailyToWeekly(daily, dayKeys)
      const qtyNum = qty === "" ? 0 : typeof qty === "number" ? qty : Number(qty)
      if (!Number.isFinite(qtyNum) || qtyNum === 0) continue
      out.push({
        kind: "dayDetail",
        weekKey: col.weekKey,
        qty: qtyNum,
        startYmd: active[0]!,
        endYmd: active[active.length - 1]!,
      })
      continue
    }
    if (weekCellIsScheduled(row.weeklyValues[col.weekKey])) {
      const { start, end } = burstWindowForWeekColumn(
        col,
        campaignStartDate,
        campaignEndDate
      )
      out.push({
        kind: "weekCell",
        weekKey: col.weekKey,
        qty: weekCellQty(row.weeklyValues[col.weekKey]),
        startYmd: formatYmd(start),
        endYmd: formatYmd(end),
      })
    }
  }

  return out
}

export function rowHasScheduledQuantities(
  row: ExpertRowScheduleFields,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>
): boolean {
  return (
    enumerateExpertRowScheduledElements(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ).length > 0
  )
}

function identifyRowEdgeElement(
  elements: readonly ExpertRowScheduledElement[],
  edge: "start" | "end"
): ExpertRowScheduledElement | null {
  if (elements.length === 0) return null
  if (edge === "start") {
    return elements.reduce((best, el) =>
      el.startYmd < best.startYmd ||
      (el.startYmd === best.startYmd && el.endYmd < best.endYmd)
        ? el
        : best
    )
  }
  return elements.reduce((best, el) =>
    el.endYmd > best.endYmd ||
    (el.endYmd === best.endYmd && el.startYmd > best.startYmd)
      ? el
      : best
  )
}

/**
 * Line-level schedule bounds from spans (with YMD overrides), week cells, and
 * day-detailed weeks.
 */
export function deriveExpertRowScheduleYmdFromRow(
  row: ExpertRowScheduleFields,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  const elements = enumerateExpertRowScheduledElements(
    row,
    weekColumns,
    campaignStartDate,
    campaignEndDate,
    dayKeysByWeekKey
  )
  if (elements.length === 0) {
    return {
      startDate: formatYmd(campaignStartDate),
      endDate: formatYmd(campaignEndDate),
    }
  }
  let startDate = elements[0]!.startYmd
  let endDate = elements[0]!.endYmd
  for (const el of elements) {
    if (el.startYmd < startDate) startDate = el.startYmd
    if (el.endYmd > endDate) endDate = el.endYmd
  }
  return { startDate, endDate }
}

function buildWeekBlockedPredicate(
  row: ExpertRowScheduleFields,
  weekKeys: readonly string[],
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>,
  excludeSpanId?: string
): (weekKey: string) => boolean {
  const occupied = new Set<string>()
  for (const span of row.mergedWeekSpans ?? []) {
    if (excludeSpanId && span.id === excludeSpanId) continue
    for (const k of weekKeysInSpanInclusive(
      weekKeys,
      span.startWeekKey,
      span.endWeekKey
    )) {
      occupied.add(k)
    }
  }
  return (weekKey: string): boolean => {
    if (occupied.has(weekKey)) return true
    const v = row.weeklyValues[weekKey]
    if (weekCellIsScheduled(v)) return true
    const dk = [...(dayKeysByWeekKey[weekKey] ?? [])]
    if (row.dailyValues && weekHasDailyValues(row.dailyValues, dk)) return true
    return false
  }
}

function clampYmdToCampaign(
  ymd: string,
  campaignStartDate: Date,
  campaignEndDate: Date
): string {
  const campaignStartYmd = formatYmd(campaignStartDate)
  const campaignEndYmd = formatYmd(campaignEndDate)
  if (ymd < campaignStartYmd) return campaignStartYmd
  if (ymd > campaignEndYmd) return campaignEndYmd
  return ymd
}

function clampEdgeTargetYmd(
  targetYmd: string,
  edge: "start" | "end",
  rowBounds: { startDate: string; endDate: string },
  element: ExpertRowScheduledElement,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>,
  weekBlocked: (weekKey: string) => boolean
): string {
  let ymd = clampYmdToCampaign(targetYmd, campaignStartDate, campaignEndDate)

  if (edge === "start") {
    if (ymd > rowBounds.endDate) ymd = rowBounds.endDate
    if (element.kind === "span") {
      const bounds = spanEdgeDayDeltaBounds(
        element.span,
        "start",
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey,
        weekBlocked
      )
      if (bounds) {
        const edgeYmd = element.startYmd
        const minYmd = addDaysYmd(edgeYmd, bounds.minDelta)
        const maxYmd = addDaysYmd(edgeYmd, bounds.maxDelta)
        if (minYmd && ymd < minYmd) ymd = minYmd
        if (maxYmd && ymd > maxYmd) ymd = maxYmd
      }
    } else {
      const far = element.endYmd
      if (ymd > far) ymd = far
      let cursor = element.startYmd
      while (ymd < cursor) {
        const prev = addDaysYmd(cursor, -1)
        if (!prev) break
        if (prev < formatYmd(campaignStartDate)) break
        const wk = weekKeyForYmd(prev, dayKeysByWeekKey)
        if (wk !== null && weekBlocked(wk) && wk !== element.weekKey) break
        cursor = prev
      }
      if (ymd < cursor) ymd = cursor
    }
    return ymd
  }

  if (ymd < rowBounds.startDate) ymd = rowBounds.startDate
  if (element.kind === "span") {
    const bounds = spanEdgeDayDeltaBounds(
      element.span,
      "end",
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey,
      weekBlocked
    )
    if (bounds) {
      const edgeYmd = element.endYmd
      const minYmd = addDaysYmd(edgeYmd, bounds.minDelta)
      const maxYmd = addDaysYmd(edgeYmd, bounds.maxDelta)
      if (minYmd && ymd < minYmd) ymd = minYmd
      if (maxYmd && ymd > maxYmd) ymd = maxYmd
    }
  } else {
    const near = element.startYmd
    if (ymd < near) ymd = near
    let cursor = element.endYmd
    while (ymd > cursor) {
      const next = addDaysYmd(cursor, 1)
      if (!next) break
      if (next > formatYmd(campaignEndDate)) break
      const wk = weekKeyForYmd(next, dayKeysByWeekKey)
      if (wk !== null && weekBlocked(wk) && wk !== element.weekKey) break
      cursor = next
    }
    if (ymd > cursor) ymd = cursor
  }
  return ymd
}

function newExpertSpanId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `edge-span-${Date.now()}`
}

export type SetExpertRowEdgeDateResult =
  | ExpertRowScheduleFields
  | { error: string }

/**
 * Move a row's start or end schedule edge to an exact calendar day.
 * Adjusts the edge span in place or converts a week/day cell into a span.
 */
export function setExpertRowEdgeDate<R extends ExpertRowScheduleFields>(
  row: R,
  edge: "start" | "end",
  ymd: string,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey: Readonly<Record<string, readonly string[]>>
): SetExpertRowEdgeDateResult {
  const weekKeys = weekColumns.map((c) => c.weekKey)
  if (!parseYmd(ymd)) return { error: "Invalid date" }

  if (
    !rowHasScheduledQuantities(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  ) {
    return { error: "schedule a quantity first" }
  }

  const elements = enumerateExpertRowScheduledElements(
    row,
    weekColumns,
    campaignStartDate,
    campaignEndDate,
    dayKeysByWeekKey
  )
  const element = identifyRowEdgeElement(elements, edge)
  if (!element) return { error: "schedule a quantity first" }

  const rowBounds = deriveExpertRowScheduleYmdFromRow(
    row,
    weekColumns,
    campaignStartDate,
    campaignEndDate,
    dayKeysByWeekKey
  )
  const weekBlocked = buildWeekBlockedPredicate(
    row,
    weekKeys,
    dayKeysByWeekKey,
    element.kind === "span" ? element.spanId : undefined
  )
  const clampedYmd = clampEdgeTargetYmd(
    ymd,
    edge,
    rowBounds,
    element,
    weekColumns,
    campaignStartDate,
    campaignEndDate,
    dayKeysByWeekKey,
    weekBlocked
  )

  if (element.kind === "span") {
    const edgeYmd = edge === "start" ? element.startYmd : element.endYmd
    const deltaDays = differenceInCalendarDays(
      parseYmd(clampedYmd)!,
      parseYmd(edgeYmd)!
    )
    if (deltaDays === 0) return row

    const deltaBounds = spanEdgeDayDeltaBounds(
      element.span,
      edge,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey,
      weekBlocked
    )
    if (!deltaBounds) return row

    const resized = resizeSpanEdgeByDays(
      element.span,
      edge,
      deltaDays,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey,
      deltaBounds
    )
    if (!resized) return row

    const mergedWeekSpans = (row.mergedWeekSpans ?? []).map((s) =>
      s.id === element.spanId
        ? {
            ...s,
            startWeekKey: resized.startWeekKey,
            endWeekKey: resized.endWeekKey,
            startYmd: resized.startYmd,
            endYmd: resized.endYmd,
          }
        : s
    )
    const weeklyValues = { ...row.weeklyValues }
    for (const k of weekKeysInSpanInclusive(
      weekKeys,
      resized.startWeekKey,
      resized.endWeekKey
    )) {
      weeklyValues[k] = ""
    }
    return { ...row, weeklyValues, mergedWeekSpans }
  }

  const nearBound = element.startYmd
  const farBound = element.endYmd
  const startYmd = edge === "start" ? clampedYmd : nearBound
  const endYmd = edge === "end" ? clampedYmd : farBound
  if (startYmd > endYmd) return row

  const startWeekKey = weekKeyForYmd(startYmd, dayKeysByWeekKey)
  const endWeekKey = weekKeyForYmd(endYmd, dayKeysByWeekKey)
  if (!startWeekKey || !endWeekKey) return row

  const newSpan: ExpertSpanWithWeekRange & { id: string; totalQty: number } = {
    id: newExpertSpanId(),
    startWeekKey,
    endWeekKey,
    totalQty: element.qty,
    startYmd,
    endYmd,
  }

  const weeklyValues = { ...row.weeklyValues, [element.weekKey]: "" }
  let dailyValues = row.dailyValues
  const dayKeys = dayKeysByWeekKey[element.weekKey] ?? []
  if (dailyValues && dayKeys.length > 0) {
    const nextDaily = { ...dailyValues }
    let changed = false
    for (const dk of dayKeys) {
      if (nextDaily[dk] !== undefined) {
        delete nextDaily[dk]
        changed = true
      }
    }
    if (changed) {
      dailyValues =
        Object.keys(nextDaily).length > 0 ? nextDaily : undefined
    }
  }

  for (const k of weekKeysInSpanInclusive(weekKeys, startWeekKey, endWeekKey)) {
    weeklyValues[k] = ""
  }

  const mergedWeekSpans = [...(row.mergedWeekSpans ?? []), newSpan]
  return {
    ...row,
    weeklyValues,
    dailyValues,
    mergedWeekSpans,
  }
}
