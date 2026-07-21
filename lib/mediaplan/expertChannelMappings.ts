import { format, startOfDay } from "date-fns"
import {
  type BuyType,
  coerceBuyTypeWithDevWarn,
  computeLoadedDeliverables,
  distributeBurstDeliverablesToExpertWeeks,
  deliverablesFromBudget,
  grossFromNet,
  netFromGross,
  netMediaFromDeliverables,
  roundDeliverables,
} from "./deliverableBudget"
import { resolveLineItemBursts } from "./deriveBursts"
import {
  clampDateToCampaignRange,
  getSundayOnOrBefore,
  type WeeklyGanttWeekColumn,
} from "../utils/weeklyGanttColumns"
import {
  formatMoney,
  formatRate,
  parseMoneyInput,
  type MoneyFormatOptions,
} from "@/lib/format/money"
import { weekKeysInSpanInclusive } from "./expertGridShared"
import { projectLumpSumCardBudgetsOntoExpertRows } from "./cardExpertBudgetSync"
import {
  burstDatesForExpertSpan,
  burstWindowForWeekColumn,
  burstYmdOverridesForImport,
  deriveExpertRowScheduleYmdFromRow,
  tryImportMultiWeekBurstAsMergedSpan,
  type ExpertSpanDateOverrides,
} from "@/lib/mediaplan/expertSpanDates"
import {
  coveredDayKeysIfDayDetail,
  expandWeekToDaily,
  weekDayKeys,
  weekHasDailyValues,
  buildDayColumnsForWeek,
  emitDayBurstsForWeek,
  type ExpertDailyValues,
} from "@/lib/mediaplan/expertDayModel"
import type {
  ExpertWeekColumnKey,
  ExpertWeeklyValues,
  BvodExpertScheduleRow,
  DigiVideoExpertScheduleRow,
  DigitalDisplayExpertScheduleRow,
  DigitalAudioExpertScheduleRow,
  InfluencersExpertScheduleRow,
  IntegrationExpertScheduleRow,
  SearchExpertScheduleRow,
  SocialMediaExpertScheduleRow,
  OohExpertScheduleRow,
  OohExpertMergedWeekSpan,
  RadioExpertScheduleRow,
  ProductionExpertScheduleRow,
  CinemaExpertScheduleRow,
  TelevisionExpertScheduleRow,
  NewspaperExpertScheduleRow,
  MagazinesExpertScheduleRow,
  ProgAudioExpertScheduleRow,
  ProgBvodExpertScheduleRow,
  ProgDisplayExpertScheduleRow,
  ProgVideoExpertScheduleRow,
  ProgOohExpertScheduleRow,
  ProgExpertMergedWeekSpan,
} from "./expertModeWeeklySchedule.js"

/** Aligned with {@link serializeBurstsJson} for parsing bursts_json Stage 1 contract fields. */
const BURST_JSON_MONEY_FORMAT: MoneyFormatOptions = {
  locale: "en-AU",
  currency: "AUD",
}

/** OOH/Radio form burst shape (matches container schemas). */
interface StandardMediaBurst {
  budget: string
  buyAmount: string
  startDate: Date
  endDate: Date
  calculatedValue?: number
  fee?: number
  adServingRatePct?: number
  adServingImpressions?: number
}

/** OOH `lineItems` entry shape used by {@link OOHContainer}. */
export interface StandardOohFormLineItem {
  network: string
  format: string
  buyType: string
  type: string
  placement: string
  size: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noAdserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

/** Radio `radiolineItems` entry shape used by {@link RadioContainer}. */
export interface StandardRadioFormLineItem {
  network: string
  station: string
  buyType: string
  bidStrategy?: string
  placement: string
  format: string
  duration: string
  buyingDemo: string
  market: string
  platform?: string
  creativeTargeting?: string
  creative?: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardOohLineItemInput = Partial<StandardOohFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

export type StandardRadioLineItemInput = Partial<StandardRadioFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

/** Production burst — unit cost × quantity; dual-write standard keys optional on read. */
interface StandardProductionBurst {
  cost: number
  amount: number
  budget?: string
  buyAmount?: string
  calculatedValue?: number
  startDate: Date
  endDate: Date
}

/** Production `lineItems` entry shape used by {@link ProductionContainer}. */
export interface StandardProductionFormLineItem {
  mediaType: string
  publisher: string
  description: string
  market: string
  /** Line-level unit cost (form key `unitRate`; legacy persisted as `unitCost`). */
  unitRate?: number | string
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardProductionBurst[]
}

export type StandardProductionLineItemInput = Partial<StandardProductionFormLineItem> & {
  media_type?: string
  /** Legacy persisted key — hydrate into `unitRate`. */
  unitCost?: number | string
  unit_cost?: number | string
  bursts_json?: string | object
}

/** Cinema `cinemalineItems` entry shape used by CinemaContainer. Radio minus platform/creative*. */
export interface StandardCinemaFormLineItem {
  network: string
  station: string
  buyType: string
  bidStrategy?: string
  placement: string
  format: string
  duration: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardCinemaLineItemInput = Partial<StandardCinemaFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

export interface ExpertToStandardBurstOptions {
  /** OOH: fee %; used with budgetIncludesFees for net-media deliverable math (see OOHContainer). */
  feePctOoh?: number
  /** Radio: fee %; used with budgetIncludesFees (see RadioContainer). */
  feePctRadio?: number
  /** Cinema: fee %; used with budgetIncludesFees (see CinemaContainer). */
  feePctCinema?: number
  /** Television: fee %; used with budgetIncludesFees (see TelevisionContainer). */
  feePctTelevision?: number
  /** BVOD: fee %; used with budgetIncludesFees (see BVODContainer). */
  feePctBvod?: number
  /** Digi Video: fee %; used with budgetIncludesFees (see DigitalVideoContainer). */
  feePctDigiVideo?: number
  /** Digital Display: fee %; used with budgetIncludesFees (see DigitalDisplayContainer). */
  feePctDigiDisplay?: number
  /** Digital Audio: fee %; used with budgetIncludesFees (see DigitalAudioContainer). */
  feePctDigiAudio?: number
  /** Social Media: fee %; used with budgetIncludesFees (see SocialMediaContainer). */
  feePctSocial?: number
  /** Search: fee %; used with budgetIncludesFees (see SearchContainer). */
  feePctSearch?: number
  /** Influencers: fee %; used with budgetIncludesFees (see InfluencersContainer). */
  feePctInfluencers?: number
  /** Integration: fee %; used with budgetIncludesFees (see IntegrationContainer). */
  feePctIntegration?: number
  /** Newspaper: fee %; used with budgetIncludesFees (see NewspaperContainer). */
  feePctNewspaper?: number
  /** Magazines: fee %; used with budgetIncludesFees (see MagazinesContainer). */
  feePctMagazines?: number
  /** Programmatic Audio */
  feePctProgAudio?: number
  /** Programmatic BVOD */
  feePctProgBvod?: number
  /** Programmatic Display */
  feePctProgDisplay?: number
  /** Programmatic OOH */
  feePctProgOoh?: number
  /** Programmatic Video */
  feePctProgVideo?: number
  budgetIncludesFees?: boolean
}

type ExpertRowWithSourceLineItemId = {
  id?: string
  sourceLineItemId?: string
}

function deriveExpertSourceLineItemId(
  row: ExpertRowWithSourceLineItemId,
  lineNo: number
): string {
  return (row.sourceLineItemId ?? row.id) || String(lineNo)
}

function parseNum(v: number | string | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

/** Optional fee context for standard → expert import deliverable fallback. */
export type StandardImportMapperOptions = {
  feePct?: number
}

/**
 * Persisted `calculatedValue` when present; otherwise derive from budget + unit rate
 * via {@link computeLoadedDeliverables}. Skips fallback when budgetIncludesFees is
 * true but feePct was not supplied (caller must pass channel fee).
 */
function resolveBurstDeliverablesForStandardImport(
  burst: StandardMediaBurst,
  buyType: string,
  budgetIncludesFees: boolean,
  feePct?: number
): number {
  const btLower = buyType.toLowerCase()
  const raw = burst.calculatedValue
  const stored =
    typeof raw === "number" && Number.isFinite(raw) ? raw : parseNum(raw)

  if (btLower === "bonus") {
    return Number.isFinite(stored) ? stored : 0
  }

  if (btLower === "fixed_cost") {
    return stored > 0 ? stored : 1
  }

  if (Number.isFinite(stored) && stored > 0) {
    return stored
  }

  const rawBudget = parseNum(burst.budget)
  const buyAmount = parseNum(burst.buyAmount)
  if (rawBudget <= 0 || buyAmount <= 0) {
    return 0
  }

  if (budgetIncludesFees && feePct === undefined) {
    return 0
  }

  return computeLoadedDeliverables(
    buyType,
    burst as unknown as {
      budget?: unknown
      buyAmount?: unknown
      calculatedValue?: unknown
      deliverables?: unknown
      [k: string]: unknown
    },
    budgetIncludesFees,
    feePct ?? 0
  )
}

function formatBurstBudget(n: number): string {
  if (!Number.isFinite(n)) return "0"
  const rounded = Math.round(n * 100) / 100
  return String(rounded)
}

/**
 * Raw expert-row media cost. Delegates to {@link netMediaFromDeliverables} for buy types
 * in that model; `cpm` = `(qty / 1000) × unitRate` for grids that store full impression counts.
 */
export function expertRowRawCost(
  buyType: string | undefined | null,
  unitRate: number,
  qty: number
): number {
  const bt = String(buyType || "").toLowerCase()
  const r = Number.isFinite(unitRate) ? unitRate : 0
  const q = Number.isFinite(qty) ? qty : 0
  if (bt === "bonus") return 0
  if (bt === "cpm") return (q / 1000) * r
  return netMediaFromDeliverables(bt as BuyType, q, r)
}

/** Net media for deliverable math; uses linear {@link netFromGross} when budget includes fees (same as OOHContainer). */
function oohNetBudgetForDeliverables(
  rawBudget: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  return netFromGross(rawBudget, budgetIncludesFees, feePct)
}

/** Mirrors RadioContainer `netMediaPctOfGross` for deliverable calculations. */
function radioNetBudgetForDeliverables(
  rawBudget: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  if (!budgetIncludesFees) return rawBudget
  return (rawBudget * (100 - (feePct || 0))) / 100
}

function oohCalculatedDeliverables(
  buyType: string,
  netBudget: number,
  buyAmount: number,
  bonusDeliverables?: number
): number {
  const amt = buyAmount || 0
  switch (buyType) {
    case "cpc":
    case "cpv":
    case "panels":
      return amt !== 0 ? netBudget / amt : 0
    case "cpm":
      return amt !== 0 ? (netBudget / amt) * 1000 : 0
    case "fixed_cost":
    case "package":
      return 1
    case "bonus":
      return bonusDeliverables ?? 0
    default:
      return 0
  }
}

/** Matches {@link NewspaperContainer} burst deliverable math (net budget after fee split). */
function newspaperCalculatedDeliverables(
  buyType: string,
  netBudget: number,
  buyAmount: number,
  bonusDeliverables?: number
): number {
  const bt = String(buyType || "").toLowerCase()
  const amt = buyAmount || 0
  switch (bt) {
    case "cpc":
    case "cpv":
    case "insertions":
      return amt !== 0 ? netBudget / amt : 0
    case "cpm":
      return amt !== 0 ? (netBudget / amt) * 1000 : 0
    case "fixed_cost":
    case "package":
    case "package_inclusions":
      return 1
    case "bonus":
      return bonusDeliverables ?? 0
    default:
      return 0
  }
}

function weekKeyFromDate(d: Date): ExpertWeekColumnKey {
  return format(getSundayOnOrBefore(startOfDay(d)), "yyyy-MM-dd")
}

type DistributableBurstImportCtx = {
  weeklyValues: Record<string, number | "">
  dailyValues: ExpertDailyValues
  mergedWeekSpans: OohExpertMergedWeekSpan[]
  mergeIdx: number
  rowIndex: number
}

/**
 * Radio-family import: single-week → cell or day-detail; multi-week → merged span
 * with exact dates when no occupancy conflict, else distribute into cells.
 */
function accumulateDistributableBurstForExpertImport(
  ctx: DistributableBurstImportCtx,
  params: {
    sd: Date
    ed: Date
    totalDeliverables: number
    buyType: string
    bt: BuyType
    weekColumns: WeeklyGanttWeekColumn[]
    campaignStartDate: Date
    campaignEndDate: Date
    distribute: (total: number, overlapKeys: string[]) => void
  }
): void {
  const {
    sd,
    ed,
    totalDeliverables,
    weekColumns,
    campaignStartDate,
    campaignEndDate,
    distribute,
  } = params

  const overlapKeys = radioWeekKeysOverlappingBurstWindow(
    weekColumns,
    campaignStartDate,
    campaignEndDate,
    sd,
    ed
  )

  if (overlapKeys.length === 1) {
    const week = weekColumns.find((c) => c.weekKey === overlapKeys[0])
    const dayKeys = week
      ? coveredDayKeysIfDayDetail(sd, ed, week, campaignStartDate, campaignEndDate)
      : null
    if (week && dayKeys && dayKeys.length > 0) {
      const split = expandWeekToDaily(totalDeliverables, dayKeys)
      for (const k of dayKeys) {
        const prev = ctx.dailyValues[k]
        const prevNum = prev === "" || prev === undefined ? 0 : Number(prev)
        const addNum = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
        ctx.dailyValues[k] = prevNum + addNum
      }
      return
    }
  }

  if (overlapKeys.length > 1) {
    const imported = tryImportMultiWeekBurstAsMergedSpan({
      burstStart: sd,
      burstEnd: ed,
      totalQty: totalDeliverables,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      overlapKeys,
      existingSpans: ctx.mergedWeekSpans,
      rowIndex: ctx.rowIndex,
      mergeIdx: ctx.mergeIdx,
    })
    if (imported) {
      ctx.mergedWeekSpans.push(imported.span)
      ctx.mergeIdx = imported.nextMergeIdx
      return
    }
  }

  distribute(totalDeliverables, overlapKeys)
}

/** Resolve export burst dates: day override > span overrides > week window. */
function resolveBurstExportDates(
  startCol: WeeklyGanttWeekColumn,
  endCol: WeeklyGanttWeekColumn,
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: {
    spanDates?: ExpertSpanDateOverrides
    dayOverride?: { start: Date; end: Date }
  }
): { start: Date; end: Date } {
  if (options?.dayOverride) return options.dayOverride
  if (options?.spanDates) {
    return burstDatesForExpertSpan(
      options.spanDates,
      startCol,
      endCol,
      campaignStartDate,
      campaignEndDate
    )
  }
  return {
    start: burstWindowForWeekColumn(
      startCol,
      campaignStartDate,
      campaignEndDate
    ).start,
    end: burstWindowForWeekColumn(
      endCol,
      campaignStartDate,
      campaignEndDate
    ).end,
  }
}

type PushBurstDateInput =
  | { start: Date; end: Date }
  | { spanDates: ExpertSpanDateOverrides }

function parsePushBurstDateInput(
  input: PushBurstDateInput | undefined
): {
  spanDates?: ExpertSpanDateOverrides
  dayOverride?: { start: Date; end: Date }
} {
  if (!input) return {}
  if ("start" in input) return { dayOverride: input }
  return { spanDates: input.spanDates }
}

function weekCellIsActive(v: number | "" | undefined | null): boolean {
  if (v === "" || v === undefined || v === null) return false
  const q = typeof v === "number" ? v : parseNum(v)
  return Number.isFinite(q) && q !== 0
}

/**
 * Line-level schedule bounds from weekly Gantt quantities (first/last active week),
 * using the same Sun–Sat clamped windows as standard bursts.
 */
export function deriveOohExpertRowScheduleYmd(
  weeklyValues: ExpertWeeklyValues,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): { startDate: string; endDate: string } {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null
  for (const col of weekColumns) {
    const v = weeklyValues[col.weekKey]
    if (!weekCellIsActive(v)) continue
    if (!firstCol) firstCol = col
    lastCol = col
  }
  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

/**
 * Line-level schedule bounds from weekly cells plus merged multi-week spans.
 */
export function deriveOohExpertRowScheduleYmdFromRow(
  row: OohExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

/**
 * Line-level schedule bounds from weekly cells plus merged multi-week spans (radio expert row).
 */
export function deriveRadioExpertRowScheduleYmdFromRow(
  row: RadioExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

/**
 * Line-level schedule bounds from weekly cells plus merged multi-week spans (cinema expert row).
 */
export function deriveCinemaExpertRowScheduleYmdFromRow(
  row: CinemaExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null
  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }
  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }
  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(weekKeyOrder, span.startWeekKey, span.endWeekKey)
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }
  if (!firstCol || !lastCol) {
    return { startDate: ymd(campaignStartDate), endDate: ymd(campaignEndDate) }
  }
  const { start } = burstWindowForWeekColumn(firstCol, campaignStartDate, campaignEndDate)
  const { end } = burstWindowForWeekColumn(lastCol, campaignStartDate, campaignEndDate)
  return { startDate: ymd(start), endDate: ymd(end) }
}

/**
 * Line-level schedule bounds from weekly cells plus merged multi-week spans (newspaper expert row).
 */
export function deriveNewspaperExpertRowScheduleYmdFromRow(
  row: NewspaperExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

/**
 * Line-level schedule bounds from weekly cells plus merged multi-week spans (magazines expert row).
 */
export function deriveMagazineExpertRowScheduleYmdFromRow(
  row: MagazinesExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function parseBurstDate(v: Date | string | undefined): Date | null {
  if (v === undefined || v === null) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Parses `bursts_json` into {@link StandardMediaBurst} for expert → standard line items.
 * Stage 1 contract (serializeBurstsJson): `feeAmount` and `mediaAmount` are formatted currency
 * strings; legacy numeric `fee` is no longer written. Precedence: parsed `feeAmount` over legacy
 * `fee`; when `mediaAmount` is present and parses, it becomes `budget` (formatted), else `budget`
 * falls back to the raw `budget` field.
 */
function normalizeOohBursts(item: StandardOohLineItemInput): StandardMediaBurst[] {
  const raw =
    item.bursts ??
    (item.bursts_json
      ? typeof item.bursts_json === "string"
        ? JSON.parse(item.bursts_json)
        : item.bursts_json
      : []) ??
    []
  if (!Array.isArray(raw)) return []
  const out: StandardMediaBurst[] = []
  for (const b of raw) {
    const rec = b as Record<string, unknown>
    const sd = parseBurstDate(
      (rec.startDate ?? rec.start_date) as Date | string | undefined
    )
    const ed = parseBurstDate(
      (rec.endDate ?? rec.end_date) as Date | string | undefined
    )
    if (!sd || !ed) continue

    const feeAmountRaw = rec.feeAmount
    const hasFeeAmount =
      feeAmountRaw != null && String(feeAmountRaw).trim() !== ""
    let fee: number | undefined
    if (hasFeeAmount) {
      const parsedFee = parseMoneyInput(
        feeAmountRaw as Parameters<typeof parseMoneyInput>[0]
      )
      if (parsedFee !== null) fee = parsedFee
    } else if (typeof rec.fee === "number") {
      fee = rec.fee
    }

    const mediaAmountRaw = rec.mediaAmount
    const hasMediaAmount =
      mediaAmountRaw != null && String(mediaAmountRaw).trim() !== ""
    let budgetStr = String(rec.budget ?? "")
    if (hasMediaAmount) {
      const parsedMedia = parseMoneyInput(
        mediaAmountRaw as Parameters<typeof parseMoneyInput>[0]
      )
      if (parsedMedia !== null) {
        budgetStr = formatMoney(parsedMedia, BURST_JSON_MONEY_FORMAT)
      }
    }

    out.push({
      budget: budgetStr,
      buyAmount: String(rec.buyAmount ?? rec.buy_amount ?? ""),
      startDate: sd,
      endDate: ed,
      calculatedValue:
        typeof rec.calculatedValue === "number"
          ? rec.calculatedValue
          : typeof rec.calculated_value === "number"
            ? rec.calculated_value
            : undefined,
      ...(fee !== undefined ? { fee } : {}),
    })
  }
  return out
}

function normalizeRadioBursts(item: StandardRadioLineItemInput): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

function emptyOohLineItem(
  row: OohExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number
): StandardOohFormLineItem {
  // Same precedence as the main map path: prefer the inbound standard id so
  // the merge can match by line_item_id even for rows that produced no bursts.
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    network: row.network,
    format: row.format,
    buyType: row.buyType,
    type: row.type,
    placement: row.placement,
    size: row.size,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees),
    noAdserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)),
        endDate: startOfDay(clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)),
        calculatedValue: 0,
      },
    ],
  }
}

function emptyRadioLineItem(
  row: RadioExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardRadioFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    network: row.network,
    station: row.station,
    buyType: row.buyType,
    bidStrategy: "",
    placement: row.placement,
    format: row.format,
    duration: row.duration,
    buyingDemo: row.buyingDemo,
    market: row.market,
    platform: "",
    creativeTargeting: "",
    creative: "",
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)),
        endDate: startOfDay(clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)),
        calculatedValue: 0,
      },
    ],
  }
}

/**
 * One expert row → one standard OOH line item.
 * Each non-empty weekly cell → one burst; dates are that week Sun–Sat clamped to the campaign.
 */
export function mapOohExpertRowsToStandardLineItems(
  rows: OohExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardOohFormLineItem[] {
  const feePct = options?.feePctOoh ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    // Prefer the inbound standard id (carried via sourceLineItemId) so the
    // apply-time merge in mergeOohStandardFromExpertWithPrevious can match
    // generated items back to their previous form-state by stable id.
    // Fall back to row.id (now a UUID) only when no source id exists, e.g. for
    // newly added rows. reassignOohLineItemNumbers overwrites this anyway.
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const appendOohBurstFromExpertQty = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      spanDates?: ExpertSpanDateOverrides
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = spanDates
        ? burstDatesForExpertSpan(
            spanDates,
            startCol,
            endCol,
            campaignStartDate,
            campaignEndDate
          )
        : {
            start: burstWindowForWeekColumn(
              startCol,
              campaignStartDate,
              campaignEndDate
            ).start,
            end: burstWindowForWeekColumn(
              endCol,
              campaignStartDate,
              campaignEndDate
            ).end,
          }
      const bt = coerceBuyTypeWithDevWarn(
        buyType,
        "mapOohExpertRowsToStandardLineItems.appendBurst"
      )
      const grossBudget = expertRowRawCost(buyType, unitRate, qty)
      const netForCalc = oohNetBudgetForDeliverables(
        grossBudget,
        budgetIncludesFees,
        feePct
      )
      const btLower = String(buyType || "").toLowerCase()
      const isInclusionBuyType =
        btLower === "bonus" ||
        btLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        btLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const buyAmountStr =
        isInclusionBuyType
          ? "0"
          : btLower === "panels"
            ? formatBurstBudget(unitRate)
            : formatRate(unitRate)
      let calculatedValue: number
      if (usesManualDeliverable) {
        calculatedValue = roundDeliverables(bt, qty)
      } else if (btLower === "cpm") {
        calculatedValue = roundDeliverables(
          bt,
          deliverablesFromBudget(bt, netForCalc, unitRate)
        )
      } else {
        const raw = deliverablesFromBudget(bt, netForCalc, unitRate)
        calculatedValue = Number.isNaN(raw)
          ? 0
          : roundDeliverables(bt, raw)
      }
      bursts.push({
        budget: formatBurstBudget(grossBudget),
        buyAmount: buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const qty = span.totalQty
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      appendOohBurstFromExpertQty(qty, startCol, endCol, span)
    }

    const bt = String(buyType || "").toLowerCase() as BuyType
    const isInclusionBuyType = bt === "bonus" || bt === "package_inclusions"

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const dKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, dKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          const netMedia = netMediaFromDeliverables(bt, db.qty, unitRate)
          const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
          const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)
          bursts.push({
            budget: formatBurstBudget(grossBudget),
            buyAmount: buyAmountStr,
            startDate: db.startDate,
            endDate: db.endDate,
            calculatedValue: roundDeliverables(bt, db.qty),
          })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      appendOohBurstFromExpertQty(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyOohLineItem(row, campaignStartDate, campaignEndDate, lineNo)
    }

    return {
      network: row.network,
      format: row.format,
      buyType,
      type: row.type,
      placement: row.placement,
      size: row.size,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noAdserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

/**
 * One expert row → one standard Radio line item.
 */
export function mapRadioExpertRowsToStandardLineItems(
  rows: RadioExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardRadioFormLineItem[] {
  const feePct = options?.feePctRadio ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const bt = String(buyType || "").toLowerCase() as BuyType
    const isInclusionBuyType =
      bt === "bonus" || bt === "package_inclusions"
    const isFixedDeliverableBuyType =
      bt === "package"
    const usesManualDeliverable =
      isInclusionBuyType || isFixedDeliverableBuyType

    for (const span of row.mergedWeekSpans ?? []) {
      const qty = span.totalQty
      if (!Number.isFinite(qty) || qty === 0) continue
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue

      const { start, end } = burstDatesForExpertSpan(
        span,
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate
      )
      const netMedia = netMediaFromDeliverables(bt, qty, unitRate)
      const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
      const calculatedValue = usesManualDeliverable
        ? roundDeliverables(bt, qty)
        : roundDeliverables(bt, qty)
      const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)

      bursts.push({
        budget: formatBurstBudget(grossBudget),
        buyAmount: buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      // Day-detail: emit one burst per contiguous equal-valued run of days.
      const dKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, dKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          const netMedia = netMediaFromDeliverables(bt, db.qty, unitRate)
          const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
          const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)
          bursts.push({
            budget: formatBurstBudget(grossBudget),
            buyAmount: buyAmountStr,
            startDate: db.startDate,
            endDate: db.endDate,
            calculatedValue: roundDeliverables(bt, db.qty),
          })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      const netMedia = netMediaFromDeliverables(bt, qty, unitRate)
      const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
      const calculatedValue = usesManualDeliverable
        ? roundDeliverables(bt, qty)
        : roundDeliverables(bt, qty)
      const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)
      const { start, end } = burstWindowForWeekColumn(col, campaignStartDate, campaignEndDate)

      bursts.push({
        budget: formatBurstBudget(grossBudget),
        buyAmount: buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    if (bursts.length === 0) {
      return emptyRadioLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      network: row.network,
      station: row.station,
      buyType,
      bidStrategy: "",
      placement: row.placement,
      format: row.format,
      duration: row.duration,
      buyingDemo: row.buyingDemo,
      market: row.market,
      platform: "",
      creativeTargeting: "",
      creative: "",
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

function formatYmd(d: Date): string {
  return format(startOfDay(d), "yyyy-MM-dd")
}

/**
 * Standard bursts store unit rate in `buyAmount` (same contract as
 * Radio/Cinema/BVOD; see each container's handleValueChange and
 * {@link computeLoadedDeliverables}).
 */
function deriveUnitRateFromBursts(bursts: StandardMediaBurst[]): number {
  for (const b of bursts) {
    const rate = parseNum(b.buyAmount)
    if (rate > 0) return rate
  }
  return 0
}

/** Radio standard bursts store unit rate in `buyAmount` (see {@link mapRadioExpertRowsToStandardLineItems}). */
function deriveRadioStandardUnitRateFromBursts(bursts: StandardMediaBurst[]): number {
  for (const b of bursts) {
    const r = parseNum(b.buyAmount)
    if (r > 0) return r
  }
  return 0
}

function radioWeekKeysOverlappingBurstWindow(
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  sd: Date,
  ed: Date
): string[] {
  const b0 = startOfDay(sd)
  const b1 = startOfDay(ed)
  const keys: string[] = []
  for (const col of weekColumns) {
    const { start, end } = burstWindowForWeekColumn(
      col,
      campaignStartDate,
      campaignEndDate
    )
    if (b0 <= end && b1 >= start) keys.push(col.weekKey)
  }
  return keys
}

function addRadioWeeklyDelta(
  weeklyValues: Record<string, number | "">,
  key: string,
  add: number
) {
  const prev = weeklyValues[key]
  const prevNum =
    prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
  weeklyValues[key] = prevNum + add
}

/** Splits standard burst deliverables across Gantt weeks; earliest weeks absorb remainders. */
function distributeRadioStandardDeliverablesToWeeks(
  buyType: string,
  total: number,
  overlapKeys: string[],
  weeklyValues: Record<string, number | "">
): void {
  const bt = String(buyType || "").toLowerCase() as BuyType
  if (overlapKeys.length === 0 || !Number.isFinite(total)) return

  if (bt === "fixed_cost") {
    addRadioWeeklyDelta(weeklyValues, overlapKeys[0]!, 1)
    return
  }

  const t = Math.round(total)
  const n = overlapKeys.length
  const base = Math.floor(t / n)
  const remainder = t - base * n
  for (let i = 0; i < n; i++) {
    const v = i < remainder ? base + 1 : base
    addRadioWeeklyDelta(weeklyValues, overlapKeys[i]!, v)
  }
}

/** Panel count for expert grid from a standard burst (handles legacy buyAmount-as-qty rows). */
function panelsBurstQtyForExpert(b: StandardMediaBurst): number {
  const ba = parseNum(b.buyAmount)
  const cRaw = b.calculatedValue
  const c =
    typeof cRaw === "number" && Number.isFinite(cRaw)
      ? cRaw
      : parseNum(cRaw)
  if (Number.isFinite(c) && c > 0 && ba > 0 && ba < c) {
    return ba
  }
  if (Number.isFinite(c) && c > 0) {
    return c
  }
  return ba
}

function sumGrossBursts(bursts: StandardMediaBurst[]): number {
  return bursts.reduce((s, b) => s + parseNum(b.budget), 0)
}

function deriveOohStandardUnitRateFromBursts(bursts: StandardMediaBurst[]): number {
  for (const b of bursts) {
    const r = parseNum(b.buyAmount)
    if (r > 0) return r
  }
  return 0
}

/**
 * One standard OOH line item → one expert row. Weekly quantities come from burst `buyAmount`;
 * same week keys are summed if multiple bursts fall in one week.
 */
export function mapStandardOohLineItemsToExpertRows(
  lineItems: StandardOohLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): OohExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeOohBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const bt = coerceBuyTypeWithDevWarn(
      buyType,
      "mapStandardOohLineItemsToExpertRows"
    )

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const dailyValues: ExpertDailyValues = {}
    const mergedWeekSpans: OohExpertMergedWeekSpan[] = []
    let mergeIdx = 0
    const importCtx: DistributableBurstImportCtx = {
      weeklyValues,
      dailyValues,
      mergedWeekSpans,
      mergeIdx,
      rowIndex: index,
    }

    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue

      let totalDeliverables =
        buyType.toLowerCase() === "panels"
          ? panelsBurstQtyForExpert(b)
          : typeof b.calculatedValue === "number" && Number.isFinite(b.calculatedValue)
            ? b.calculatedValue
            : parseNum(b.calculatedValue)
      if (!Number.isFinite(totalDeliverables)) continue
      if (buyType.toLowerCase() === "fixed_cost") {
        totalDeliverables = 1
      }
      if (totalDeliverables === 0 && buyType.toLowerCase() !== "bonus") continue

      importCtx.mergeIdx = mergeIdx
      accumulateDistributableBurstForExpertImport(importCtx, {
        sd,
        ed,
        totalDeliverables,
        buyType,
        bt,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        distribute: (total, overlapKeys) =>
          distributeBurstDeliverablesToExpertWeeks(
            bt,
            total,
            overlapKeys,
            weeklyValues
          ),
      })
      mergeIdx = importCtx.mergeIdx
    }

    const firstBurst = bursts.find((b) => b.startDate && !Number.isNaN(b.startDate.getTime()))
    const lastBurst = [...bursts].reverse().find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    // Carry the inbound standard id through for round-trip (read by
    // mapOohExpertRowsToStandardLineItems → line_item_id). NOT unique across rows
    // if the source list has stale/duplicated IDs, so it MUST NOT be used as a
    // React key — see _reactKey below.
    const id = String(item.line_item_id ?? item.lineItemId ?? item.line_item ?? item.lineItem ?? index + 1)
    // Always-unique opaque key for React reconciliation inside the expert grid.
    // Decoupled from line_item_id so duplicate or stale inbound IDs (e.g. after a
    // reorder + reopen) don't produce duplicate React keys.
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `ooh-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      // Preserve original standard line_item_id for the apply-time merge / round trip.
      sourceLineItemId: id,
      market: String(item.market ?? ""),
      network: String(item.network ?? ""),
      format: String(item.format ?? ""),
      type: String(item.type ?? ""),
      placement: String(item.placement ?? ""),
      startDate: firstBurst ? formatYmd(firstBurst.startDate) : formatYmd(campaignStartDate),
      endDate: lastBurst ? formatYmd(lastBurst.endDate) : formatYmd(campaignEndDate),
      size: String(item.size ?? ""),
      panels: buyType === "panels" ? bursts.reduce((s, b) => s + (typeof b.calculatedValue === "number" ? b.calculatedValue : 0), 0) : "",
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      buyType,
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(item.client_pays_for_media ?? item.clientPaysForMedia),
      budgetIncludesFees: Boolean(item.budget_includes_fees ?? item.budgetIncludesFees),
      unitRate: deriveOohStandardUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : undefined,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/**
 * One standard Radio line item → one expert row.
 */
export function mapStandardRadioLineItemsToExpertRows(
  lineItems: StandardRadioLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  importOptions?: StandardImportMapperOptions
): RadioExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeRadioBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const budgetIncludesFees = Boolean(
      item.budget_includes_fees ?? item.budgetIncludesFees
    )

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const dailyValues: ExpertDailyValues = {}
    const mergedWeekSpans: OohExpertMergedWeekSpan[] = []
    let mergeIdx = 0
    const importCtx: DistributableBurstImportCtx = {
      weeklyValues,
      dailyValues,
      mergedWeekSpans,
      mergeIdx,
      rowIndex: index,
    }

    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue

      let totalDeliverables = resolveBurstDeliverablesForStandardImport(
        b,
        buyType,
        budgetIncludesFees,
        importOptions?.feePct
      )
      if (!Number.isFinite(totalDeliverables)) continue
      if (buyType === "fixed_cost") {
        totalDeliverables = 1
      }
      if (totalDeliverables === 0 && buyType !== "bonus") continue

      const bt = coerceBuyTypeWithDevWarn(
        buyType,
        "mapStandardRadioLineItemsToExpertRows"
      )
      importCtx.mergeIdx = mergeIdx
      accumulateDistributableBurstForExpertImport(importCtx, {
        sd,
        ed,
        totalDeliverables,
        buyType,
        bt,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        distribute: (total, overlapKeys) =>
          distributeRadioStandardDeliverablesToWeeks(
            buyType,
            total,
            overlapKeys,
            weeklyValues
          ),
      })
      mergeIdx = importCtx.mergeIdx
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `radio-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      network: String(item.network ?? ""),
      station: String(item.station ?? ""),
      market: String(item.market ?? ""),
      placement: String(item.placement ?? ""),
      duration: String(item.duration ?? ""),
      format: String(item.format ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      buyType,
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      // Standard `buyAmount` is unit rate (same value as expert `unitRate`).
      unitRate: deriveRadioStandardUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : undefined,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

function coerceProductionBurstCost(rec: Record<string, unknown>): number {
  const cost = parseNum(rec.cost as number | string | undefined)
  if (cost > 0) return cost
  const budget = parseNum(rec.budget as number | string | undefined)
  const amount =
    parseNum(rec.amount as number | string | undefined) ||
    parseNum(rec.calculatedValue as number | string | undefined) ||
    parseNum(rec.buyAmount as number | string | undefined)
  if (budget > 0 && amount > 0) return budget / amount
  return cost
}

function coerceProductionBurstAmount(rec: Record<string, unknown>): number {
  const amount = parseNum(rec.amount as number | string | undefined)
  if (amount > 0) return amount
  const calculated = parseNum(rec.calculatedValue as number | string | undefined)
  if (calculated > 0) return calculated
  return parseNum(rec.buyAmount as number | string | undefined)
}

function normalizeProductionBursts(
  item: StandardProductionLineItemInput
): StandardProductionBurst[] {
  const raw = resolveLineItemBursts(item)
  const out: StandardProductionBurst[] = []
  for (const b of raw) {
    const rec = b as Record<string, unknown>
    const sd = parseBurstDate(
      (rec.startDate ?? rec.start_date) as Date | string | undefined
    )
    const ed = parseBurstDate(
      (rec.endDate ?? rec.end_date) as Date | string | undefined
    )
    if (!sd || !ed) continue

    const cost = coerceProductionBurstCost(rec)
    const amount = coerceProductionBurstAmount(rec)
    const budgetRaw = rec.budget
    const buyAmountRaw = rec.buyAmount ?? rec.buy_amount
    const calculatedRaw = rec.calculatedValue ?? rec.calculated_value

    out.push({
      cost,
      amount,
      ...(budgetRaw != null && String(budgetRaw).trim() !== ""
        ? { budget: String(budgetRaw) }
        : cost > 0 && amount > 0
          ? { budget: formatBurstBudget(cost * amount) }
          : {}),
      ...(buyAmountRaw != null && String(buyAmountRaw).trim() !== ""
        ? { buyAmount: String(buyAmountRaw) }
        : amount > 0
          ? { buyAmount: String(amount) }
          : {}),
      calculatedValue:
        typeof calculatedRaw === "number" && Number.isFinite(calculatedRaw)
          ? calculatedRaw
          : amount > 0
            ? amount
            : undefined,
      startDate: sd,
      endDate: ed,
    })
  }
  return out
}

function deriveProductionStandardUnitRateFromBursts(
  bursts: StandardProductionBurst[]
): number {
  for (const b of bursts) {
    if (b.cost > 0) return b.cost
  }
  return 0
}

function sumProductionGrossBursts(bursts: StandardProductionBurst[]): number {
  const product = bursts.reduce((s, b) => s + b.cost * b.amount, 0)
  if (product > 0) return product
  // REVIEW: lump-sum card bursts may store money only on `budget` with cost/amount 0.
  return bursts.reduce((s, b) => s + parseNum(b.budget), 0)
}

function emptyProductionLineItem(
  row: ProductionExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number
): StandardProductionFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    mediaType: row.mediaType,
    publisher: row.publisher,
    description: row.description,
    market: row.market,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        cost: 0,
        amount: 0,
        budget: "0",
        buyAmount: "0",
        calculatedValue: 0,
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
      },
    ],
  }
}

/**
 * Line-level schedule bounds from weekly cells plus merged multi-week spans (production expert row).
 */
export function deriveProductionExpertRowScheduleYmdFromRow(
  row: ProductionExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

/**
 * One expert row → one standard Production line item.
 * Production totals are cost × qty flat — no fee math.
 */
export function mapProductionExpertRowsToStandardLineItems(
  rows: ProductionExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): StandardProductionFormLineItem[] {
  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const id = deriveExpertSourceLineItemId(row, lineNo)

    const bursts: StandardProductionBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      bursts.push({
        cost: unitRate,
        amount: qty,
        budget: formatBurstBudget(unitRate * qty),
        buyAmount: String(qty),
        calculatedValue: qty,
        startDate: start,
        endDate: end,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const dKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, dKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          bursts.push({
            cost: unitRate,
            amount: db.qty,
            budget: formatBurstBudget(unitRate * db.qty),
            buyAmount: String(db.qty),
            calculatedValue: db.qty,
            startDate: db.startDate,
            endDate: db.endDate,
          })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyProductionLineItem(row, campaignStartDate, campaignEndDate, lineNo)
    }

    return {
      mediaType: row.mediaType,
      publisher: row.publisher,
      description: row.description,
      market: row.market,
      unitRate,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

/**
 * One standard Production line item → one expert row.
 */
export function mapStandardProductionLineItemsToExpertRows(
  lineItems: StandardProductionLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): ProductionExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeProductionBursts(item)
    const buyType = "production"

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const dailyValues: ExpertDailyValues = {}
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue

      const totalDeliverablesRaw = b.amount ?? b.calculatedValue
      let totalDeliverables =
        typeof totalDeliverablesRaw === "number" &&
        Number.isFinite(totalDeliverablesRaw)
          ? totalDeliverablesRaw
          : parseNum(totalDeliverablesRaw)
      if (!Number.isFinite(totalDeliverables)) continue
      if (totalDeliverables === 0) continue

      const overlapKeys = radioWeekKeysOverlappingBurstWindow(
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        sd,
        ed
      )
      if (overlapKeys.length === 1) {
        const week = weekColumns.find((c) => c.weekKey === overlapKeys[0])
        const dayKeys = week
          ? coveredDayKeysIfDayDetail(sd, ed, week, campaignStartDate, campaignEndDate)
          : null
        if (week && dayKeys && dayKeys.length > 0) {
          const split = expandWeekToDaily(totalDeliverables, dayKeys)
          for (const k of dayKeys) {
            const prev = dailyValues[k]
            const prevNum = prev === "" || prev === undefined ? 0 : Number(prev)
            const addNum = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
            dailyValues[k] = prevNum + addNum
          }
          continue
        }
      }
      distributeRadioStandardDeliverablesToWeeks(
        buyType,
        totalDeliverables,
        overlapKeys,
        weeklyValues
      )
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `production-expert-import-${Date.now()}-${index}`

    const legacyUnitCost = (item as StandardProductionLineItemInput).unitCost
    const legacyUnitCostSnake = (item as StandardProductionLineItemInput).unit_cost
    const lineUnitRateRaw =
      item.unitRate ?? legacyUnitCost ?? legacyUnitCostSnake
    const lineUnitRateParsed =
      lineUnitRateRaw === undefined || lineUnitRateRaw === ""
        ? NaN
        : parseNum(lineUnitRateRaw)
    const unitRate = Number.isFinite(lineUnitRateParsed) && lineUnitRateParsed > 0
      ? lineUnitRateParsed
      : deriveProductionStandardUnitRateFromBursts(bursts)

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      mediaType: String(item.mediaType ?? item.media_type ?? ""),
      publisher: String(item.publisher ?? ""),
      description: String(item.description ?? ""),
      market: String(item.market ?? ""),
      buyType,
      unitRate,
      grossCost: sumProductionGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

function normalizeCinemaBursts(item: StandardCinemaLineItemInput): StandardMediaBurst[] {
  return normalizeOohBursts(item as any)
}

/** Cinema standard bursts store unit rate in buyAmount. */
function deriveCinemaStandardUnitRateFromBursts(bursts: StandardMediaBurst[]): number {
  for (const b of bursts) {
    const r = parseNum(b.buyAmount)
    if (r > 0) return r
  }
  return 0
}

function addCinemaWeeklyDelta(
  weeklyValues: Record<string, number | "">,
  key: string,
  add: number
) {
  const prev = weeklyValues[key]
  const prevNum = prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
  weeklyValues[key] = prevNum + add
}

/** Splits standard burst deliverables across Gantt weeks; earliest weeks absorb remainders. */
function distributeCinemaStandardDeliverablesToWeeks(
  buyType: string,
  total: number,
  overlapKeys: string[],
  weeklyValues: Record<string, number | "">
): void {
  const bt = String(buyType || "").toLowerCase() as BuyType
  if (overlapKeys.length === 0 || !Number.isFinite(total)) return
  if (bt === "fixed_cost") {
    addCinemaWeeklyDelta(weeklyValues, overlapKeys[0]!, 1)
    return
  }
  const t = Math.round(total)
  const n = overlapKeys.length
  const base = Math.floor(t / n)
  const remainder = t - base * n
  for (let i = 0; i < n; i++) {
    const v = i < remainder ? base + 1 : base
    addCinemaWeeklyDelta(weeklyValues, overlapKeys[i]!, v)
  }
}

function emptyCinemaLineItem(
  row: CinemaExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardCinemaFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    network: row.network,
    station: row.station,
    buyType: row.buyType,
    bidStrategy: "",
    placement: row.placement,
    format: row.format,
    duration: row.duration,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)),
        endDate: startOfDay(clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)),
        calculatedValue: 0,
      },
    ],
  }
}

/**
 * One expert row → one standard Cinema line item.
 */
export function mapCinemaExpertRowsToStandardLineItems(
  rows: CinemaExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardCinemaFormLineItem[] {
  const feePct = options?.feePctCinema ?? 0
  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )
    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(weekKeyOrder, span.startWeekKey, span.endWeekKey)) {
        coveredByMerged.add(k)
      }
    }
    const bt = String(buyType || "").toLowerCase() as BuyType
    const isInclusionBuyType = bt === "bonus" || bt === "package_inclusions"
    for (const span of row.mergedWeekSpans ?? []) {
      const qty = span.totalQty
      if (!Number.isFinite(qty) || qty === 0) continue
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      const { start, end } = burstDatesForExpertSpan(
        span,
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate
      )
      const netMedia = netMediaFromDeliverables(bt, qty, unitRate)
      const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
      const calculatedValue = roundDeliverables(bt, qty)
      const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)
      bursts.push({
        budget: formatBurstBudget(grossBudget),
        buyAmount: buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }
    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const dKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, dKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          const netMedia = netMediaFromDeliverables(bt, db.qty, unitRate)
          const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
          const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)
          bursts.push({
            budget: formatBurstBudget(grossBudget),
            buyAmount: buyAmountStr,
            startDate: db.startDate,
            endDate: db.endDate,
            calculatedValue: roundDeliverables(bt, db.qty),
          })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue
      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue
      const netMedia = netMediaFromDeliverables(bt, qty, unitRate)
      const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
      const calculatedValue = roundDeliverables(bt, qty)
      const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)
      const { start, end } = burstWindowForWeekColumn(col, campaignStartDate, campaignEndDate)
      bursts.push({
        budget: formatBurstBudget(grossBudget),
        buyAmount: buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }
    if (bursts.length === 0) {
      return emptyCinemaLineItem(row, campaignStartDate, campaignEndDate, lineNo, budgetIncludesFees)
    }
    return {
      network: row.network,
      station: row.station,
      buyType,
      bidStrategy: "",
      placement: row.placement,
      format: row.format,
      duration: row.duration,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

/**
 * One standard Cinema line item → one expert row.
 */
export function mapStandardCinemaLineItemsToExpertRows(
  lineItems: StandardCinemaLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): CinemaExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeCinemaBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }
    const dailyValues: ExpertDailyValues = {}
    const mergedWeekSpans: OohExpertMergedWeekSpan[] = []
    let mergeIdx = 0
    const importCtx: DistributableBurstImportCtx = {
      weeklyValues,
      dailyValues,
      mergedWeekSpans,
      mergeIdx,
      rowIndex: index,
    }
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue
      const totalDeliverablesRaw = b.calculatedValue
      let totalDeliverables =
        typeof totalDeliverablesRaw === "number" && Number.isFinite(totalDeliverablesRaw)
          ? totalDeliverablesRaw
          : parseNum(totalDeliverablesRaw)
      if (!Number.isFinite(totalDeliverables)) continue
      if (buyType === "fixed_cost") {
        totalDeliverables = 1
      }
      if (totalDeliverables === 0 && buyType !== "bonus") continue
      const bt = coerceBuyTypeWithDevWarn(
        buyType,
        "mapStandardCinemaLineItemsToExpertRows"
      )
      importCtx.mergeIdx = mergeIdx
      accumulateDistributableBurstForExpertImport(importCtx, {
        sd,
        ed,
        totalDeliverables,
        buyType,
        bt,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        distribute: (total, overlapKeys) =>
          distributeCinemaStandardDeliverablesToWeeks(
            buyType,
            total,
            overlapKeys,
            weeklyValues
          ),
      })
      mergeIdx = importCtx.mergeIdx
    }
    const firstBurst = bursts.find((b) => b.startDate && !Number.isNaN(b.startDate.getTime()))
    const lastBurst = [...bursts].reverse().find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))
    const id = String(
      item.line_item_id ?? item.lineItemId ?? item.line_item ?? item.lineItem ?? index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `cinema-expert-import-${Date.now()}-${index}`
    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst ? formatYmd(firstBurst.startDate) : formatYmd(campaignStartDate),
      endDate: lastBurst ? formatYmd(lastBurst.endDate) : formatYmd(campaignEndDate),
      network: String(item.network ?? ""),
      station: String(item.station ?? ""),
      market: String(item.market ?? ""),
      placement: String(item.placement ?? ""),
      duration: String(item.duration ?? ""),
      format: String(item.format ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      buyType,
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(item.client_pays_for_media ?? item.clientPaysForMedia),
      budgetIncludesFees: Boolean(item.budget_includes_fees ?? item.budgetIncludesFees),
      unitRate: deriveCinemaStandardUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : undefined,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** TV bursts include ad length and TARPs string (matches form). */
type StandardTelevisionBurst = StandardMediaBurst & {
  size?: string
  tarps?: string
}

/** Television `televisionlineItems` entry shape used by {@link TelevisionContainer}. */
export interface StandardTelevisionFormLineItem {
  market: string
  network: string
  station: string
  daypart: string
  placement: string
  buyType: string
  buyingDemo: string
  bidStrategy?: string
  creativeTargeting?: string
  creative?: string
  /** Line-level Ad Size (mirrored on bursts; surfaces both). */
  size?: string
  /** Line-level TARPs summary (surfaces both; bursts keep per-burst tarps). */
  tarps?: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardTelevisionBurst[]
}

export type StandardTelevisionLineItemInput = Partial<StandardTelevisionFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
  /** Legacy hydrate keys → map to `creative`. */
  creativeLength?: string
  creative_length?: string
}

function normalizeTelevisionBursts(item: StandardTelevisionLineItemInput): StandardTelevisionBurst[] {
  return normalizeOohBursts(item) as StandardTelevisionBurst[]
}

function deriveTvStandardUnitRateFromBursts(bursts: StandardTelevisionBurst[]): number {
  for (const b of bursts) {
    const r = parseNum(b.buyAmount)
    if (r > 0) return r
  }
  return 0
}

/**
 * Line-level schedule bounds from weekly cells plus merged multi-week spans (television expert row).
 */
export function deriveTelevisionExpertRowScheduleYmdFromRow(
  row: TelevisionExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function emptyTelevisionLineItem(
  row: TelevisionExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardTelevisionFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    market: row.market,
    network: row.network,
    station: row.station,
    daypart: row.daypart,
    placement: row.placement,
    buyType: row.buyType,
    buyingDemo: row.buyingDemo,
    bidStrategy: "",
    creativeTargeting: "",
    creative: String(row.creative ?? ""),
    size: String(row.size || "30s"),
    tarps: String(row.tarps ?? ""),
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
        size: String(row.size || "30s"),
        tarps: "",
      },
    ],
  }
}

export function mapTvExpertRowsToStandardLineItems(
  rows: TelevisionExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardTelevisionFormLineItem[] {
  const feePct = options?.feePctTelevision ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )
    const lineSize = String(row.size || "30s").trim() || "30s"

    const bursts: StandardTelevisionBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const bt = coerceBuyTypeWithDevWarn(
        buyType,
        "mapTvExpertRowsToStandardLineItems.pushBurst"
      )
      const btLower = String(bt || "").toLowerCase()
      const isInclusionBuyType =
        btLower === "bonus" ||
        btLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        btLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const netMedia = netMediaFromDeliverables(bt, qty, unitRate)
      const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
      const calculatedValue = usesManualDeliverable
        ? roundDeliverables(bt, qty)
        : roundDeliverables(bt, qty)
      const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)
      bursts.push({
        budget: formatBurstBudget(grossBudget),
        buyAmount: buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
        size: lineSize,
        tarps: String(calculatedValue),
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const qty = span.totalQty
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(qty, startCol, endCol)
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const emitKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, emitKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          pushBurst(db.qty, col, col, { start: db.startDate, end: db.endDate })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyTelevisionLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      market: row.market,
      network: row.network,
      station: row.station,
      daypart: row.daypart,
      placement: row.placement,
      buyType,
      buyingDemo: row.buyingDemo,
      bidStrategy: "",
      creativeTargeting: "",
      creative: String(row.creative ?? ""),
      size: String(row.size || "30s"),
      tarps: String(row.tarps ?? ""),
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardTvLineItemsToExpertRows(
  lineItems: StandardTelevisionLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): TelevisionExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeTelevisionBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const bt = coerceBuyTypeWithDevWarn(
      buyType,
      "mapStandardTvLineItemsToExpertRows"
    )

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const dailyValues: ExpertDailyValues = {}
    const mergedWeekSpans: OohExpertMergedWeekSpan[] = []
    let mergeIdx = 0
    const importCtx: DistributableBurstImportCtx = {
      weeklyValues,
      dailyValues,
      mergedWeekSpans,
      mergeIdx,
      rowIndex: index,
    }
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue

      let totalDeliverables = parseNum(b.tarps)
      if (!Number.isFinite(totalDeliverables) || totalDeliverables === 0) {
        const cv = b.calculatedValue
        totalDeliverables =
          typeof cv === "number" && Number.isFinite(cv) ? cv : parseNum(cv)
      }
      if (!Number.isFinite(totalDeliverables)) continue

      const btLower = buyType.toLowerCase()
      if (btLower === "fixed_cost") {
        totalDeliverables = 1
      }
      if (totalDeliverables === 0 && btLower !== "bonus") continue

      importCtx.mergeIdx = mergeIdx
      accumulateDistributableBurstForExpertImport(importCtx, {
        sd,
        ed,
        totalDeliverables,
        buyType,
        bt,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        distribute: (total, overlapKeys) =>
          distributeBurstDeliverablesToExpertWeeks(
            bt,
            total,
            overlapKeys,
            weeklyValues
          ),
      })
      mergeIdx = importCtx.mergeIdx
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tv-expert-import-${Date.now()}-${index}`

    const sizeFromBurst = firstBurst?.size
      ? String(firstBurst.size)
      : "30s"
    const tarpsSum = weekColumns.reduce(
      (s, col) => s + parseNum(weeklyValues[col.weekKey]),
      0
    )
    const creativeFromItem = String(
      item.creative ??
        item.creativeLength ??
        item.creative_length ??
        ""
    )

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      market: String(item.market ?? ""),
      network: String(item.network ?? ""),
      station: String(item.station ?? ""),
      daypart: String(item.daypart ?? ""),
      placement: String(item.placement ?? ""),
      buyType,
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      creative: creativeFromItem,
      size: String(item.size || sizeFromBurst),
      tarps: String(
        item.tarps ?? (tarpsSum > 0 ? String(tarpsSum) : "")
      ),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      unitRate: deriveTvStandardUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

function bvodCalculatedDeliverables(
  buyType: string,
  netBudget: number,
  buyAmount: number,
  bonusDeliverables?: number
): number {
  const bt = String(buyType || "").toLowerCase()
  const amt = buyAmount || 0
  switch (bt) {
    case "cpc":
    case "cpv":
      return amt !== 0 ? netBudget / amt : 0
    case "cpm":
      return amt !== 0 ? (netBudget / amt) * 1000 : 0
    case "fixed_cost":
    case "package_inclusions":
      return 1
    case "bonus":
      return bonusDeliverables ?? 0
    default:
      return 0
  }
}

/** BVOD `bvodlineItems` entry shape used by {@link BVODContainer}. */
export interface StandardBvodFormLineItem {
  platform: string
  site: string
  bidStrategy: string
  buyType: string
  publisher: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardBvodLineItemInput = Partial<StandardBvodFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  creative_targeting?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

function normalizeBvodBursts(item: StandardBvodLineItemInput): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

export function deriveBvodExpertRowScheduleYmdFromRow(
  row: BvodExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function emptyBvodLineItem(
  row: BvodExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardBvodFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    site: row.site,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    publisher: row.publisher,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

/**
 * One expert row → one standard BVOD line item.
 * Same burst financial contract as television / digital audio expert rows.
 */
export function mapBvodExpertRowsToStandardLineItems(
  rows: BvodExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardBvodFormLineItem[] {
  const feePct = options?.feePctBvod ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const bt = coerceBuyTypeWithDevWarn(
        buyType,
        "mapBvodExpertRowsToStandardLineItems.pushBurst"
      )
      const btLower = String(bt || "").toLowerCase()
      const isInclusionBuyType =
        btLower === "bonus" ||
        btLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        btLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const netMedia = netMediaFromDeliverables(bt, qty, unitRate)
      const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
      const calculatedValue = usesManualDeliverable
        ? roundDeliverables(bt, qty)
        : roundDeliverables(bt, qty)
      const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)

      bursts.push({
        budget: formatBurstBudget(grossBudget),
        buyAmount: buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    const bt = coerceBuyTypeWithDevWarn(
      buyType,
      "mapBvodExpertRowsToStandardLineItems"
    )
    const btLower = String(bt || "").toLowerCase()
    const isInclusionBuyType =
      btLower === "bonus" || btLower === "package_inclusions"

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const dKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, dKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          const netMedia = netMediaFromDeliverables(bt, db.qty, unitRate)
          const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
          const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)
          bursts.push({
            budget: formatBurstBudget(grossBudget),
            buyAmount: buyAmountStr,
            startDate: db.startDate,
            endDate: db.endDate,
            calculatedValue: roundDeliverables(bt, db.qty),
          })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyBvodLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      platform: String(row.platform || row.publisher || "").trim() || row.publisher,
      site: row.site,
      bidStrategy: row.bidStrategy,
      buyType,
      publisher: row.publisher,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardBvodLineItemsToExpertRows(
  lineItems: StandardBvodLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): BvodExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeBvodBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const bt = coerceBuyTypeWithDevWarn(
      buyType,
      "mapStandardBvodLineItemsToExpertRows"
    )

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const dailyValues: ExpertDailyValues = {}
    const mergedWeekSpans: OohExpertMergedWeekSpan[] = []
    let mergeIdx = 0
    const importCtx: DistributableBurstImportCtx = {
      weeklyValues,
      dailyValues,
      mergedWeekSpans,
      mergeIdx,
      rowIndex: index,
    }
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue

      let totalDeliverables =
        typeof b.calculatedValue === "number" && Number.isFinite(b.calculatedValue)
          ? b.calculatedValue
          : parseNum(b.calculatedValue)
      if (!Number.isFinite(totalDeliverables) || totalDeliverables === 0) {
        continue
      }

      const buyTypeLower = buyType.toLowerCase()
      if (buyTypeLower === "fixed_cost") {
        totalDeliverables = 1
      }
      if (totalDeliverables === 0 && buyTypeLower !== "bonus") continue

      importCtx.mergeIdx = mergeIdx
      accumulateDistributableBurstForExpertImport(importCtx, {
        sd,
        ed,
        totalDeliverables,
        buyType,
        bt,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        distribute: (total, overlapKeys) =>
          distributeBurstDeliverablesToExpertWeeks(
            bt,
            total,
            overlapKeys,
            weeklyValues
          ),
      })
      mergeIdx = importCtx.mergeIdx
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `bvod-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      publisher: String(item.publisher ?? ""),
      site: String(item.site ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      creativeTargeting: String(
        item.creativeTargeting ?? item.creative_targeting ?? ""
      ),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      unitRate: deriveRadioStandardUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Digi Video `digivideolineItems` entry shape used by {@link DigitalVideoContainer}. */
export interface StandardDigiVideoFormLineItem {
  platform: string
  site: string
  bidStrategy: string
  buyType: string
  publisher: string
  placement: string
  size: string
  targetingAttribute: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardDigiVideoLineItemInput = Partial<StandardDigiVideoFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  creative_targeting?: string
  targeting_attribute?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

function normalizeDigiVideoBursts(
  item: StandardDigiVideoLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

export function deriveDigiVideoExpertRowScheduleYmdFromRow(
  row: DigiVideoExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function emptyDigiVideoLineItem(
  row: DigiVideoExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardDigiVideoFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    site: row.site,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    publisher: row.publisher,
    placement: row.placement,
    size: row.size,
    targetingAttribute: "",
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: Boolean(row.noadserving),
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

/**
 * One expert row → one standard Digi Video line item.
 * Net media for deliverables uses linear {@link netFromGross} when budget includes fees,
 * matching {@link DigitalVideoContainer}.
 */
export function mapDigiVideoExpertRowsToStandardLineItems(
  rows: DigiVideoExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardDigiVideoFormLineItem[] {
  const feePct = options?.feePctDigiVideo ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const grossBudget = expertRowRawCost(buyType, unitRate, qty)
      const rawBudget = grossBudget
      const netForCalc = oohNetBudgetForDeliverables(
        rawBudget,
        budgetIncludesFees,
        feePct
      )
      const buyTypeLower = buyType.toLowerCase()
      const isInclusionBuyType =
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        buyTypeLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const buyAmountStr = formatRate(unitRate)
      const bonusVal = usesManualDeliverable ? qty : undefined
      const buyAmtNum = usesManualDeliverable ? 0 : unitRate
      const calculatedValue = bvodCalculatedDeliverables(
        buyType,
        netForCalc,
        buyAmtNum,
        bonusVal
      )

      bursts.push({
        budget: formatBurstBudget(rawBudget),
        buyAmount: isInclusionBuyType ? "0" : buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const emitKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, emitKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          pushBurst(db.qty, col, col, { start: db.startDate, end: db.endDate })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyDigiVideoLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      platform: String(row.platform || row.publisher || "").trim() || row.publisher,
      site: row.site,
      bidStrategy: row.bidStrategy,
      buyType,
      publisher: row.publisher,
      placement: row.placement,
      size: row.size,
      targetingAttribute: "",
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: Boolean(row.noadserving),
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardDigiVideoLineItemsToExpertRows(
  lineItems: StandardDigiVideoLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): DigiVideoExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeDigiVideoBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const mergedWeekSpans: {
      id: string
      startWeekKey: string
      endWeekKey: string
      totalQty: number
    }[] = []
    let mergeIdx = 0

    const dailyValues: ExpertDailyValues = {}
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue
      const startKey = weekKeyFromDate(sd)
      const endKey = weekKeyFromDate(ed)
      if (!(startKey in weeklyValues)) continue

      // Standard bursts store unit rate in `buyAmount`; weekly cells hold
      // deliverables, so qty comes from the persisted `calculatedValue`.
      const buyTypeLower = buyType.toLowerCase()
      const cellQtyRaw = b.calculatedValue
      let cellQty =
        typeof cellQtyRaw === "number" && Number.isFinite(cellQtyRaw)
          ? cellQtyRaw
          : parseNum(cellQtyRaw)
      if (!Number.isFinite(cellQty)) cellQty = 0
      if (
        buyTypeLower === "fixed_cost" ||
        buyTypeLower === "package_inclusions"
      ) {
        cellQty = cellQty > 0 ? cellQty : 1
      }

      if (startKey === endKey) {
        const dWeek = weekColumns.find((c) => c.weekKey === startKey)
        const dKeys = dWeek
          ? coveredDayKeysIfDayDetail(sd, ed, dWeek, campaignStartDate, campaignEndDate)
          : null
        if (dWeek && dKeys && dKeys.length > 0) {
          const split = expandWeekToDaily(cellQty, dKeys)
          for (const k of dKeys) {
            const prevD = dailyValues[k]
            const prevDNum = prevD === "" || prevD === undefined ? 0 : Number(prevD)
            const addD = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
            dailyValues[k] = prevDNum + addD
          }
          continue
        }
        const prev = weeklyValues[startKey]
        const prevNum =
          prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
        weeklyValues[startKey] = prevNum + cellQty
      } else {
        mergedWeekSpans.push({
          id: `std-${index}-m${mergeIdx++}`,
          startWeekKey: startKey,
          endWeekKey: endKey,
          totalQty: cellQty,
          ...burstYmdOverridesForImport(
            sd,
            ed,
            campaignStartDate,
            campaignEndDate
          ),
        })
      }
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `digivideo-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      publisher: String(item.publisher ?? ""),
      site: String(item.site ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      placement: String(item.placement ?? ""),
      size: String(item.size ?? ""),
      creativeTargeting: String(
        item.creativeTargeting ?? item.creative_targeting ?? ""
      ),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      noadserving: Boolean(item.no_adserving ?? item.noadserving),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : [],
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Digital Display `digidisplaylineItems` entry shape used by {@link DigitalDisplayContainer}. */
export interface StandardDigiDisplayFormLineItem {
  platform: string
  site: string
  buyType: string
  publisher: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  /** Optional; preserved from standard when not edited in expert mode. */
  placement?: string
  size?: string
  targetingAttribute?: string
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardDigiDisplayLineItemInput = Partial<StandardDigiDisplayFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  creative_targeting?: string
  targeting_attribute?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

function normalizeDigiDisplayBursts(
  item: StandardDigiDisplayLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

export function deriveDigitalDisplayExpertRowScheduleYmdFromRow(
  row: DigitalDisplayExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function emptyDigiDisplayLineItem(
  row: DigitalDisplayExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardDigiDisplayFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    site: row.site,
    buyType: row.buyType,
    publisher: row.publisher,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    placement: "",
    size: "",
    targetingAttribute: "",
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

/**
 * One expert row → one standard Digital Display line item.
 * Net media for deliverables uses linear {@link netFromGross} when budget includes fees.
 */
export function mapDigitalDisplayExpertRowsToStandardLineItems(
  rows: DigitalDisplayExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardDigiDisplayFormLineItem[] {
  const feePct = options?.feePctDigiDisplay ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const grossBudget = expertRowRawCost(buyType, unitRate, qty)
      const rawBudget = grossBudget
      const netForCalc = oohNetBudgetForDeliverables(
        rawBudget,
        budgetIncludesFees,
        feePct
      )
      const buyTypeLower = buyType.toLowerCase()
      const isInclusionBuyType =
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        buyTypeLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const buyAmountStr = formatRate(unitRate)
      const bonusVal = usesManualDeliverable ? qty : undefined
      const buyAmtNum = usesManualDeliverable ? 0 : unitRate
      const calculatedValue = bvodCalculatedDeliverables(
        buyType,
        netForCalc,
        buyAmtNum,
        bonusVal
      )

      bursts.push({
        budget: formatBurstBudget(rawBudget),
        buyAmount: isInclusionBuyType ? "0" : buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const emitKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, emitKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          pushBurst(db.qty, col, col, { start: db.startDate, end: db.endDate })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyDigiDisplayLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      platform: String(row.platform || row.publisher || "").trim() || row.publisher,
      site: row.site,
      buyType,
      publisher: row.publisher,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      placement: "",
      size: "",
      targetingAttribute: "",
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardDigiDisplayLineItemsToExpertRows(
  lineItems: StandardDigiDisplayLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): DigitalDisplayExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeDigiDisplayBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const mergedWeekSpans: {
      id: string
      startWeekKey: string
      endWeekKey: string
      totalQty: number
    }[] = []
    let mergeIdx = 0

    const dailyValues: ExpertDailyValues = {}
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue
      const startKey = weekKeyFromDate(sd)
      const endKey = weekKeyFromDate(ed)
      if (!(startKey in weeklyValues)) continue

      // Standard bursts store unit rate in `buyAmount`; weekly cells hold
      // deliverables, so qty comes from the persisted `calculatedValue`.
      const buyTypeLower = buyType.toLowerCase()
      const cellQtyRaw = b.calculatedValue
      let cellQty =
        typeof cellQtyRaw === "number" && Number.isFinite(cellQtyRaw)
          ? cellQtyRaw
          : parseNum(cellQtyRaw)
      if (!Number.isFinite(cellQty)) cellQty = 0
      if (
        buyTypeLower === "fixed_cost" ||
        buyTypeLower === "package_inclusions"
      ) {
        cellQty = cellQty > 0 ? cellQty : 1
      }

      if (startKey === endKey) {
        const dWeek = weekColumns.find((c) => c.weekKey === startKey)
        const dKeys = dWeek
          ? coveredDayKeysIfDayDetail(sd, ed, dWeek, campaignStartDate, campaignEndDate)
          : null
        if (dWeek && dKeys && dKeys.length > 0) {
          const split = expandWeekToDaily(cellQty, dKeys)
          for (const k of dKeys) {
            const prevD = dailyValues[k]
            const prevDNum = prevD === "" || prevD === undefined ? 0 : Number(prevD)
            const addD = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
            dailyValues[k] = prevDNum + addD
          }
          continue
        }
        const prev = weeklyValues[startKey]
        const prevNum =
          prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
        weeklyValues[startKey] = prevNum + cellQty
      } else {
        mergedWeekSpans.push({
          id: `std-${index}-m${mergeIdx++}`,
          startWeekKey: startKey,
          endWeekKey: endKey,
          totalQty: cellQty,
          ...burstYmdOverridesForImport(
            sd,
            ed,
            campaignStartDate,
            campaignEndDate
          ),
        })
      }
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `digitaldisplay-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      publisher: String(item.publisher ?? ""),
      site: String(item.site ?? ""),
      buyType,
      creativeTargeting: String(
        item.creativeTargeting ?? item.creative_targeting ?? ""
      ),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : [],
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Digital Audio `digiaudiolineItems` entry shape used by {@link DigitalAudioContainer}. */
export interface StandardDigiAudioFormLineItem {
  platform: string
  site: string
  bidStrategy: string
  buyType: string
  publisher: string
  targetingAttribute: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardDigiAudioLineItemInput = Partial<StandardDigiAudioFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  creative_targeting?: string
  targeting_attribute?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

function normalizeDigiAudioBursts(
  item: StandardDigiAudioLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

export function deriveDigitalAudioExpertRowScheduleYmdFromRow(
  row: DigitalAudioExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function emptyDigiAudioLineItem(
  row: DigitalAudioExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardDigiAudioFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    site: row.site,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    publisher: row.publisher,
    targetingAttribute: row.targetingAttribute,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

/**
 * One expert row → one standard Digital Audio line item.
 * Fee model matches {@link DigitalAudioContainer}: linear net from gross ({@link netFromGross});
 * stored burst budget is gross ({@link grossFromNet} from row net media). Burst `buyAmount` is unit rate (money string).
 */
export function mapDigitalAudioExpertRowsToStandardLineItems(
  rows: DigitalAudioExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardDigiAudioFormLineItem[] {
  const feePct = options?.feePctDigiAudio ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const bt = coerceBuyTypeWithDevWarn(
        buyType,
        "mapDigitalAudioExpertRowsToStandardLineItems.pushBurst"
      )
      const btLower = String(bt || "").toLowerCase()
      const isInclusionBuyType =
        btLower === "bonus" ||
        btLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        btLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const netMedia = netMediaFromDeliverables(bt, qty, unitRate)
      const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
      const calculatedValue = usesManualDeliverable
        ? roundDeliverables(bt, qty)
        : roundDeliverables(bt, qty)
      const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)

      bursts.push({
        budget: formatBurstBudget(grossBudget),
        buyAmount: buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    const bt = coerceBuyTypeWithDevWarn(
      buyType,
      "mapDigitalAudioExpertRowsToStandardLineItems"
    )
    const btLower = String(bt || "").toLowerCase()
    const isInclusionBuyType =
      btLower === "bonus" || btLower === "package_inclusions"

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const dKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, dKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          const netMedia = netMediaFromDeliverables(bt, db.qty, unitRate)
          const grossBudget = grossFromNet(netMedia, budgetIncludesFees, feePct)
          const buyAmountStr = isInclusionBuyType ? "0" : formatRate(unitRate)
          bursts.push({
            budget: formatBurstBudget(grossBudget),
            buyAmount: buyAmountStr,
            startDate: db.startDate,
            endDate: db.endDate,
            calculatedValue: roundDeliverables(bt, db.qty),
          })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyDigiAudioLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      platform: String(row.platform || row.publisher || "").trim() || row.publisher,
      site: row.site,
      bidStrategy: row.bidStrategy,
      buyType,
      publisher: row.publisher,
      targetingAttribute: row.targetingAttribute,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardDigiAudioLineItemsToExpertRows(
  lineItems: StandardDigiAudioLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): DigitalAudioExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeDigiAudioBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const bt = coerceBuyTypeWithDevWarn(
      buyType,
      "mapStandardDigiAudioLineItemsToExpertRows"
    )

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const dailyValues: ExpertDailyValues = {}
    const mergedWeekSpans: OohExpertMergedWeekSpan[] = []
    let mergeIdx = 0
    const importCtx: DistributableBurstImportCtx = {
      weeklyValues,
      dailyValues,
      mergedWeekSpans,
      mergeIdx,
      rowIndex: index,
    }
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue

      let totalDeliverables =
        typeof b.calculatedValue === "number" && Number.isFinite(b.calculatedValue)
          ? b.calculatedValue
          : parseNum(b.calculatedValue)
      if (!Number.isFinite(totalDeliverables) || totalDeliverables === 0) {
        continue
      }

      const btLower = buyType.toLowerCase()
      if (btLower === "fixed_cost") {
        totalDeliverables = 1
      }
      if (totalDeliverables === 0 && btLower !== "bonus") continue

      importCtx.mergeIdx = mergeIdx
      accumulateDistributableBurstForExpertImport(importCtx, {
        sd,
        ed,
        totalDeliverables,
        buyType,
        bt,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        distribute: (total, overlapKeys) =>
          distributeBurstDeliverablesToExpertWeeks(
            bt,
            total,
            overlapKeys,
            weeklyValues
          ),
      })
      mergeIdx = importCtx.mergeIdx
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `digiaudio-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      publisher: String(item.publisher ?? ""),
      site: String(item.site ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      targetingAttribute: String(
        item.targetingAttribute ?? item.targeting_attribute ?? ""
      ),
      creativeTargeting: String(
        item.creativeTargeting ?? item.creative_targeting ?? ""
      ),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      unitRate: deriveRadioStandardUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Social Media `lineItems` entry shape used by {@link SocialMediaContainer}. */
export interface StandardSocialMediaFormLineItem {
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  /** Hydration shim: older saves used `placement` for creativeTargeting. */
  placement?: string
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardSocialMediaLineItemInput = Partial<StandardSocialMediaFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  creative_targeting?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

function normalizeSocialMediaBursts(
  item: StandardSocialMediaLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

export function deriveSocialMediaExpertRowScheduleYmdFromRow(
  row: SocialMediaExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function emptySocialMediaLineItem(
  row: SocialMediaExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardSocialMediaFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

/**
 * One expert row → one standard Social Media line item.
 * Net media for deliverables uses BVOD/radio-style split when budget includes fees,
 * matching {@link SocialMediaContainer}.
 */
export function mapSocialMediaExpertRowsToStandardLineItems(
  rows: SocialMediaExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardSocialMediaFormLineItem[] {
  const feePct = options?.feePctSocial ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const grossBudget = expertRowRawCost(buyType, unitRate, qty)
      const rawBudget = grossBudget
      const netForCalc = radioNetBudgetForDeliverables(
        rawBudget,
        budgetIncludesFees,
        feePct
      )
      const buyTypeLower = buyType.toLowerCase()
      const isInclusionBuyType =
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        buyTypeLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const buyAmountStr = formatRate(unitRate)
      const bonusVal = usesManualDeliverable ? qty : undefined
      const buyAmtNum = usesManualDeliverable ? 0 : unitRate
      const calculatedValue = bvodCalculatedDeliverables(
        buyType,
        netForCalc,
        buyAmtNum,
        bonusVal
      )

      bursts.push({
        budget: formatBurstBudget(rawBudget),
        buyAmount: isInclusionBuyType ? "0" : buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const emitKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, emitKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          pushBurst(db.qty, col, col, { start: db.startDate, end: db.endDate })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptySocialMediaLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      platform: String(row.platform ?? "").trim(),
      bidStrategy: row.bidStrategy,
      buyType,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardSocialMediaLineItemsToExpertRows(
  lineItems: StandardSocialMediaLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): SocialMediaExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeSocialMediaBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const mergedWeekSpans: {
      id: string
      startWeekKey: string
      endWeekKey: string
      totalQty: number
    }[] = []
    let mergeIdx = 0

    const dailyValues: ExpertDailyValues = {}
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue
      const startKey = weekKeyFromDate(sd)
      const endKey = weekKeyFromDate(ed)
      if (!(startKey in weeklyValues)) continue

      // Standard bursts store unit rate in `buyAmount`; weekly cells hold
      // deliverables, so qty comes from the persisted `calculatedValue`.
      const buyTypeLower = buyType.toLowerCase()
      const cellQtyRaw = b.calculatedValue
      let cellQty =
        typeof cellQtyRaw === "number" && Number.isFinite(cellQtyRaw)
          ? cellQtyRaw
          : parseNum(cellQtyRaw)
      if (!Number.isFinite(cellQty)) cellQty = 0
      if (
        buyTypeLower === "fixed_cost" ||
        buyTypeLower === "package_inclusions"
      ) {
        cellQty = cellQty > 0 ? cellQty : 1
      }

      if (startKey === endKey) {
        const dWeek = weekColumns.find((c) => c.weekKey === startKey)
        const dKeys = dWeek
          ? coveredDayKeysIfDayDetail(sd, ed, dWeek, campaignStartDate, campaignEndDate)
          : null
        if (dWeek && dKeys && dKeys.length > 0) {
          const split = expandWeekToDaily(cellQty, dKeys)
          for (const k of dKeys) {
            const prevD = dailyValues[k]
            const prevDNum = prevD === "" || prevD === undefined ? 0 : Number(prevD)
            const addD = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
            dailyValues[k] = prevDNum + addD
          }
          continue
        }
        const prev = weeklyValues[startKey]
        const prevNum =
          prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
        weeklyValues[startKey] = prevNum + cellQty
      } else {
        mergedWeekSpans.push({
          id: `std-${index}-m${mergeIdx++}`,
          startWeekKey: startKey,
          endWeekKey: endKey,
          totalQty: cellQty,
          ...burstYmdOverridesForImport(
            sd,
            ed,
            campaignStartDate,
            campaignEndDate
          ),
        })
      }
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `socialmedia-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      creativeTargeting: String(
        item.creativeTargeting ??
          item.creative_targeting ??
          // Hydration shim: older saves used `placement` for this field.
          item.placement ??
          ""
      ),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : [],
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Search `lineItems` entry shape used by {@link SearchContainer}. */
export interface StandardSearchFormLineItem {
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardSearchLineItemInput = Partial<StandardSearchFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  creative_targeting?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

function normalizeSearchBursts(item: StandardSearchLineItemInput): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

export function deriveSearchExpertRowScheduleYmdFromRow(
  row: SearchExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function emptySearchLineItem(
  row: SearchExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardSearchFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

/**
 * One expert row → one standard Search line item.
 * Net media for deliverables matches {@link SearchContainer} / social-style fee split.
 */
export function mapSearchExpertRowsToStandardLineItems(
  rows: SearchExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardSearchFormLineItem[] {
  const feePct = options?.feePctSearch ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const grossBudget = expertRowRawCost(buyType, unitRate, qty)
      const rawBudget = grossBudget
      const netForCalc = radioNetBudgetForDeliverables(
        rawBudget,
        budgetIncludesFees,
        feePct
      )
      const buyTypeLower = buyType.toLowerCase()
      const isInclusionBuyType =
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        buyTypeLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const buyAmountStr = formatRate(unitRate)
      const bonusVal = usesManualDeliverable ? qty : undefined
      const buyAmtNum = usesManualDeliverable ? 0 : unitRate
      const calculatedValue = bvodCalculatedDeliverables(
        buyType,
        netForCalc,
        buyAmtNum,
        bonusVal
      )

      bursts.push({
        budget: formatBurstBudget(rawBudget),
        buyAmount: isInclusionBuyType ? "0" : buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const emitKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, emitKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          pushBurst(db.qty, col, col, { start: db.startDate, end: db.endDate })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptySearchLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      platform: String(row.platform ?? "").trim(),
      bidStrategy: row.bidStrategy,
      buyType,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardSearchLineItemsToExpertRows(
  lineItems: StandardSearchLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): SearchExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeSearchBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const mergedWeekSpans: {
      id: string
      startWeekKey: string
      endWeekKey: string
      totalQty: number
    }[] = []
    let mergeIdx = 0

    const dailyValues: ExpertDailyValues = {}
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue
      const startKey = weekKeyFromDate(sd)
      const endKey = weekKeyFromDate(ed)
      if (!(startKey in weeklyValues)) continue

      // Standard bursts store unit rate in `buyAmount`; weekly cells hold
      // deliverables, so qty comes from the persisted `calculatedValue`.
      const buyTypeLower = buyType.toLowerCase()
      const cellQtyRaw = b.calculatedValue
      let cellQty =
        typeof cellQtyRaw === "number" && Number.isFinite(cellQtyRaw)
          ? cellQtyRaw
          : parseNum(cellQtyRaw)
      if (!Number.isFinite(cellQty)) cellQty = 0
      if (
        buyTypeLower === "fixed_cost" ||
        buyTypeLower === "package_inclusions"
      ) {
        cellQty = cellQty > 0 ? cellQty : 1
      }

      if (startKey === endKey) {
        const dWeek = weekColumns.find((c) => c.weekKey === startKey)
        const dKeys = dWeek
          ? coveredDayKeysIfDayDetail(sd, ed, dWeek, campaignStartDate, campaignEndDate)
          : null
        if (dWeek && dKeys && dKeys.length > 0) {
          const split = expandWeekToDaily(cellQty, dKeys)
          for (const k of dKeys) {
            const prevD = dailyValues[k]
            const prevDNum = prevD === "" || prevD === undefined ? 0 : Number(prevD)
            const addD = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
            dailyValues[k] = prevDNum + addD
          }
          continue
        }
        const prev = weeklyValues[startKey]
        const prevNum =
          prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
        weeklyValues[startKey] = prevNum + cellQty
      } else {
        mergedWeekSpans.push({
          id: `std-${index}-m${mergeIdx++}`,
          startWeekKey: startKey,
          endWeekKey: endKey,
          totalQty: cellQty,
          ...burstYmdOverridesForImport(
            sd,
            ed,
            campaignStartDate,
            campaignEndDate
          ),
        })
      }
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `search-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      creativeTargeting: String(
        item.creativeTargeting ?? item.creative_targeting ?? ""
      ),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : [],
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Influencers `lineItems` entry shape used by {@link InfluencersContainer}. */
export interface StandardInfluencersFormLineItem {
  platform: string
  objective: string
  campaign: string
  bidStrategy: string
  buyType: string
  targetingAttribute: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  /** Hydration shim: older saves used `placement` for creativeTargeting. */
  placement?: string
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardInfluencersLineItemInput = Partial<StandardInfluencersFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  creative_targeting?: string
  targeting_attribute?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

function normalizeInfluencersBursts(
  item: StandardInfluencersLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

export function deriveInfluencersExpertRowScheduleYmdFromRow(
  row: InfluencersExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function emptyInfluencersLineItem(
  row: InfluencersExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardInfluencersFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    objective: row.objective,
    campaign: row.campaign,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    targetingAttribute: row.targetingAttribute,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

export function mapInfluencersExpertRowsToStandardLineItems(
  rows: InfluencersExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardInfluencersFormLineItem[] {
  const feePct = options?.feePctInfluencers ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const grossBudget = expertRowRawCost(buyType, unitRate, qty)
      const rawBudget = grossBudget
      const netForCalc = radioNetBudgetForDeliverables(
        rawBudget,
        budgetIncludesFees,
        feePct
      )
      const buyTypeLower = buyType.toLowerCase()
      const isInclusionBuyType =
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        buyTypeLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const buyAmountStr = formatRate(unitRate)
      const bonusVal = usesManualDeliverable ? qty : undefined
      const buyAmtNum = usesManualDeliverable ? 0 : unitRate
      const calculatedValue = bvodCalculatedDeliverables(
        buyType,
        netForCalc,
        buyAmtNum,
        bonusVal
      )

      bursts.push({
        budget: formatBurstBudget(rawBudget),
        buyAmount: isInclusionBuyType ? "0" : buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const emitKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, emitKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          pushBurst(db.qty, col, col, { start: db.startDate, end: db.endDate })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyInfluencersLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      platform: String(row.platform ?? "").trim(),
      objective: row.objective,
      campaign: row.campaign,
      bidStrategy: row.bidStrategy,
      buyType,
      targetingAttribute: row.targetingAttribute,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardInfluencersLineItemsToExpertRows(
  lineItems: StandardInfluencersLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): InfluencersExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeInfluencersBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const mergedWeekSpans: {
      id: string
      startWeekKey: string
      endWeekKey: string
      totalQty: number
    }[] = []
    let mergeIdx = 0

    const dailyValues: ExpertDailyValues = {}
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue
      const startKey = weekKeyFromDate(sd)
      const endKey = weekKeyFromDate(ed)
      if (!(startKey in weeklyValues)) continue

      // Standard bursts store unit rate in `buyAmount`; weekly cells hold
      // deliverables, so qty comes from the persisted `calculatedValue`.
      const buyTypeLower = buyType.toLowerCase()
      const cellQtyRaw = b.calculatedValue
      let cellQty =
        typeof cellQtyRaw === "number" && Number.isFinite(cellQtyRaw)
          ? cellQtyRaw
          : parseNum(cellQtyRaw)
      if (!Number.isFinite(cellQty)) cellQty = 0
      if (
        buyTypeLower === "fixed_cost" ||
        buyTypeLower === "package_inclusions"
      ) {
        cellQty = cellQty > 0 ? cellQty : 1
      }

      if (startKey === endKey) {
        const dWeek = weekColumns.find((c) => c.weekKey === startKey)
        const dKeys = dWeek
          ? coveredDayKeysIfDayDetail(sd, ed, dWeek, campaignStartDate, campaignEndDate)
          : null
        if (dWeek && dKeys && dKeys.length > 0) {
          const split = expandWeekToDaily(cellQty, dKeys)
          for (const k of dKeys) {
            const prevD = dailyValues[k]
            const prevDNum = prevD === "" || prevD === undefined ? 0 : Number(prevD)
            const addD = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
            dailyValues[k] = prevDNum + addD
          }
          continue
        }
        const prev = weeklyValues[startKey]
        const prevNum =
          prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
        weeklyValues[startKey] = prevNum + cellQty
      } else {
        mergedWeekSpans.push({
          id: `std-${index}-m${mergeIdx++}`,
          startWeekKey: startKey,
          endWeekKey: endKey,
          totalQty: cellQty,
          ...burstYmdOverridesForImport(
            sd,
            ed,
            campaignStartDate,
            campaignEndDate
          ),
        })
      }
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `influencers-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      objective: String(item.objective ?? ""),
      campaign: String(item.campaign ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      targetingAttribute: String(
        item.targetingAttribute ?? item.targeting_attribute ?? ""
      ),
      creativeTargeting: String(
        item.creativeTargeting ??
          item.creative_targeting ??
          // Hydration shim: older saves used `placement` for this field.
          item.placement ??
          ""
      ),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : [],
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Integration `lineItems` entry shape used by {@link IntegrationContainer}. */
export interface StandardIntegrationFormLineItem {
  platform: string
  objective: string
  campaign: string
  bidStrategy: string
  buyType: string
  targetingAttribute: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noAdserving: boolean
  /** Hydration shim: older saves used `placement` for creativeTargeting. */
  placement?: string
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardIntegrationLineItemInput = Partial<StandardIntegrationFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  creative_targeting?: string
  targeting_attribute?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

function normalizeIntegrationBursts(
  item: StandardIntegrationLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

export function deriveIntegrationExpertRowScheduleYmdFromRow(
  row: IntegrationExpertScheduleRow,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function emptyIntegrationLineItem(
  row: IntegrationExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardIntegrationFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    objective: row.objective,
    campaign: row.campaign,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    targetingAttribute: row.targetingAttribute,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noAdserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

export function mapIntegrationExpertRowsToStandardLineItems(
  rows: IntegrationExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardIntegrationFormLineItem[] {
  const feePct = options?.feePctIntegration ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const grossBudget = expertRowRawCost(buyType, unitRate, qty)
      const rawBudget = grossBudget
      const netForCalc = radioNetBudgetForDeliverables(
        rawBudget,
        budgetIncludesFees,
        feePct
      )
      const buyTypeLower = buyType.toLowerCase()
      const isInclusionBuyType =
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        buyTypeLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const buyAmountStr = formatRate(unitRate)
      const bonusVal = usesManualDeliverable ? qty : undefined
      const buyAmtNum = usesManualDeliverable ? 0 : unitRate
      const calculatedValue = bvodCalculatedDeliverables(
        buyType,
        netForCalc,
        buyAmtNum,
        bonusVal
      )

      bursts.push({
        budget: formatBurstBudget(rawBudget),
        buyAmount: isInclusionBuyType ? "0" : buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const emitKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, emitKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          pushBurst(db.qty, col, col, { start: db.startDate, end: db.endDate })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyIntegrationLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      platform: String(row.platform ?? "").trim(),
      objective: row.objective,
      campaign: row.campaign,
      bidStrategy: row.bidStrategy,
      buyType,
      targetingAttribute: row.targetingAttribute,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noAdserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardIntegrationLineItemsToExpertRows(
  lineItems: StandardIntegrationLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): IntegrationExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeIntegrationBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const mergedWeekSpans: {
      id: string
      startWeekKey: string
      endWeekKey: string
      totalQty: number
    }[] = []
    let mergeIdx = 0

    const dailyValues: ExpertDailyValues = {}
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue
      const startKey = weekKeyFromDate(sd)
      const endKey = weekKeyFromDate(ed)
      if (!(startKey in weeklyValues)) continue

      // Standard bursts store unit rate in `buyAmount`; weekly cells hold
      // deliverables, so qty comes from the persisted `calculatedValue`.
      const buyTypeLower = buyType.toLowerCase()
      const cellQtyRaw = b.calculatedValue
      let cellQty =
        typeof cellQtyRaw === "number" && Number.isFinite(cellQtyRaw)
          ? cellQtyRaw
          : parseNum(cellQtyRaw)
      if (!Number.isFinite(cellQty)) cellQty = 0
      if (
        buyTypeLower === "fixed_cost" ||
        buyTypeLower === "package_inclusions"
      ) {
        cellQty = cellQty > 0 ? cellQty : 1
      }

      if (startKey === endKey) {
        const dWeek = weekColumns.find((c) => c.weekKey === startKey)
        const dKeys = dWeek
          ? coveredDayKeysIfDayDetail(sd, ed, dWeek, campaignStartDate, campaignEndDate)
          : null
        if (dWeek && dKeys && dKeys.length > 0) {
          const split = expandWeekToDaily(cellQty, dKeys)
          for (const k of dKeys) {
            const prevD = dailyValues[k]
            const prevDNum = prevD === "" || prevD === undefined ? 0 : Number(prevD)
            const addD = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
            dailyValues[k] = prevDNum + addD
          }
          continue
        }
        const prev = weeklyValues[startKey]
        const prevNum =
          prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
        weeklyValues[startKey] = prevNum + cellQty
      } else {
        mergedWeekSpans.push({
          id: `std-${index}-m${mergeIdx++}`,
          startWeekKey: startKey,
          endWeekKey: endKey,
          totalQty: cellQty,
          ...burstYmdOverridesForImport(
            sd,
            ed,
            campaignStartDate,
            campaignEndDate
          ),
        })
      }
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `integration-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      objective: String(item.objective ?? ""),
      campaign: String(item.campaign ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      targetingAttribute: String(
        item.targetingAttribute ?? item.targeting_attribute ?? ""
      ),
      creativeTargeting: String(
        item.creativeTargeting ??
          item.creative_targeting ??
          // Hydration shim: older saves used `placement` for this field.
          item.placement ??
          ""
      ),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : [],
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Newspaper `newspaperlineItems` entry shape used by {@link NewspaperContainer}. */
export interface StandardNewspaperFormLineItem {
  network: string
  /** Optional in some form paths; maps to API `publisher`. */
  publisher?: string
  title: string
  buyType: string
  size: string
  format: string
  placement: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardNewspaperLineItemInput = Partial<StandardNewspaperFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

function normalizeNewspaperBursts(item: StandardNewspaperLineItemInput): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

function emptyNewspaperLineItem(
  row: NewspaperExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardNewspaperFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    network: row.network,
    publisher: row.publisher ?? "",
    title: row.title,
    buyType: row.buyType,
    size: row.size,
    format: row.format,
    placement: row.placement,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

export function mapNewspaperExpertRowsToStandardLineItems(
  rows: NewspaperExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardNewspaperFormLineItem[] {
  const feePct = options?.feePctNewspaper ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const grossBudget = expertRowRawCost(buyType, unitRate, qty)
      const rawBudget = grossBudget
      const netForCalc = radioNetBudgetForDeliverables(
        rawBudget,
        budgetIncludesFees,
        feePct
      )
      const buyAmountStr = formatRate(unitRate)
      const buyTypeLower = buyType.toLowerCase()
      const isInclusionBuyType =
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        buyTypeLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const bonusVal = usesManualDeliverable ? qty : undefined
      const buyAmtNum = usesManualDeliverable ? 0 : unitRate
      const calculatedValue = newspaperCalculatedDeliverables(
        buyType,
        netForCalc,
        buyAmtNum,
        bonusVal
      )

      bursts.push({
        budget: formatBurstBudget(rawBudget),
        buyAmount: isInclusionBuyType ? "0" : buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const emitKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, emitKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          pushBurst(db.qty, col, col, { start: db.startDate, end: db.endDate })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyNewspaperLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      network: String(row.network ?? "").trim(),
      publisher: String(row.publisher ?? "").trim(),
      title: row.title,
      buyType,
      size: row.size,
      format: row.format,
      placement: row.placement,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardNewspaperLineItemsToExpertRows(
  lineItems: StandardNewspaperLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): NewspaperExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeNewspaperBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const mergedWeekSpans: {
      id: string
      startWeekKey: string
      endWeekKey: string
      totalQty: number
    }[] = []
    let mergeIdx = 0

    const dailyValues: ExpertDailyValues = {}
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue
      const startKey = weekKeyFromDate(sd)
      const endKey = weekKeyFromDate(ed)
      if (!(startKey in weeklyValues)) continue

      // Standard bursts store unit rate in `buyAmount`; weekly cells hold
      // deliverables, so qty comes from the persisted `calculatedValue`.
      const buyTypeLower = buyType.toLowerCase()
      const cellQtyRaw = b.calculatedValue
      let cellQty =
        typeof cellQtyRaw === "number" && Number.isFinite(cellQtyRaw)
          ? cellQtyRaw
          : parseNum(cellQtyRaw)
      if (!Number.isFinite(cellQty)) cellQty = 0
      if (
        buyTypeLower === "fixed_cost" ||
        buyTypeLower === "package" ||
        buyTypeLower === "package_inclusions"
      ) {
        cellQty = cellQty > 0 ? cellQty : 1
      }

      if (startKey === endKey) {
        const dWeek = weekColumns.find((c) => c.weekKey === startKey)
        const dKeys = dWeek
          ? coveredDayKeysIfDayDetail(sd, ed, dWeek, campaignStartDate, campaignEndDate)
          : null
        if (dWeek && dKeys && dKeys.length > 0) {
          const split = expandWeekToDaily(cellQty, dKeys)
          for (const k of dKeys) {
            const prevD = dailyValues[k]
            const prevDNum = prevD === "" || prevD === undefined ? 0 : Number(prevD)
            const addD = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
            dailyValues[k] = prevDNum + addD
          }
          continue
        }
        const prev = weeklyValues[startKey]
        const prevNum =
          prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
        weeklyValues[startKey] = prevNum + cellQty
      } else {
        mergedWeekSpans.push({
          id: `std-${index}-m${mergeIdx++}`,
          startWeekKey: startKey,
          endWeekKey: endKey,
          totalQty: cellQty,
          ...burstYmdOverridesForImport(
            sd,
            ed,
            campaignStartDate,
            campaignEndDate
          ),
        })
      }
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `newspaper-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      network: String(item.network ?? ""),
      publisher: String(item.publisher ?? ""),
      title: String(item.title ?? ""),
      buyType,
      size: String(item.size ?? ""),
      format: String(item.format ?? ""),
      placement: String(item.placement ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : undefined,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Magazines `magazineslineItems` entry shape used by {@link MagazinesContainer}. */
export interface StandardMagazineFormLineItem {
  network: string
  title: string
  buyType: string
  size: string
  publisher: string
  placement: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardMagazineLineItemInput = Partial<StandardMagazineFormLineItem> & {
  buy_type?: string
  buying_demo?: string
  fixed_cost_media?: boolean
  client_pays_for_media?: boolean
  budget_includes_fees?: boolean
  no_adserving?: boolean
  bursts_json?: string | object
}

function normalizeMagazineBursts(item: StandardMagazineLineItemInput): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

/** Same deliverable math as newspaper (see burst-calculated-fields magazine variant). */
function magazineCalculatedDeliverables(
  buyType: string,
  netBudget: number,
  buyAmount: number,
  bonusDeliverables?: number
): number {
  return newspaperCalculatedDeliverables(
    buyType,
    netBudget,
    buyAmount,
    bonusDeliverables
  )
}

function emptyMagazineLineItem(
  row: MagazinesExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardMagazineFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    network: row.network,
    title: row.title,
    buyType: row.buyType,
    size: row.size,
    publisher: row.publisher,
    placement: row.placement,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: false,
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

export function mapMagazineExpertRowsToStandardLineItems(
  rows: MagazinesExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardMagazineFormLineItem[] {
  const feePct = options?.feePctMagazines ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const unitRate = parseNum(row.unitRate)
    const buyType = row.buyType
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )

    const bursts: StandardMediaBurst[] = []
    const weekKeyOrder = weekColumns.map((c) => c.weekKey)
    const coveredByMerged = new Set<string>()
    for (const span of row.mergedWeekSpans ?? []) {
      for (const k of weekKeysInSpanInclusive(
        weekKeyOrder,
        span.startWeekKey,
        span.endWeekKey
      )) {
        coveredByMerged.add(k)
      }
    }

    const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
      const grossBudget = expertRowRawCost(buyType, unitRate, qty)
      const rawBudget = grossBudget
      const netForCalc = radioNetBudgetForDeliverables(
        rawBudget,
        budgetIncludesFees,
        feePct
      )
      const buyAmountStr = formatRate(unitRate)
      const buyTypeLower = buyType.toLowerCase()
      const isInclusionBuyType =
        buyTypeLower === "bonus" ||
        buyTypeLower === "package_inclusions"
      const isFixedDeliverableBuyType =
        buyTypeLower === "package"
      const usesManualDeliverable =
        isInclusionBuyType ||
        isFixedDeliverableBuyType
      const bonusVal = usesManualDeliverable ? qty : undefined
      const buyAmtNum = usesManualDeliverable ? 0 : unitRate
      const calculatedValue = magazineCalculatedDeliverables(
        buyType,
        netForCalc,
        buyAmtNum,
        bonusVal
      )

      bursts.push({
        budget: formatBurstBudget(rawBudget),
        buyAmount: isInclusionBuyType ? "0" : buyAmountStr,
        startDate: start,
        endDate: end,
        calculatedValue,
      })
    }

    for (const span of row.mergedWeekSpans ?? []) {
      const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
      const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
      if (!startCol || !endCol) continue
      pushBurst(span.totalQty, startCol, endCol, {
        spanDates: span,
      })
    }

    for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const emitKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, emitKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          pushBurst(db.qty, col, col, { start: db.startDate, end: db.endDate })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

    if (bursts.length === 0) {
      return emptyMagazineLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      network: String(row.network ?? "").trim(),
      title: row.title,
      buyType,
      size: row.size,
      publisher: String(row.publisher ?? "").trim(),
      placement: row.placement,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: false,
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardMagazineLineItemsToExpertRows(
  lineItems: StandardMagazineLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): MagazinesExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeMagazineBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")

    const weeklyValues: Record<string, number | ""> = {}
    for (const col of weekColumns) {
      weeklyValues[col.weekKey] = ""
    }

    const mergedWeekSpans: {
      id: string
      startWeekKey: string
      endWeekKey: string
      totalQty: number
    }[] = []
    let mergeIdx = 0

    const dailyValues: ExpertDailyValues = {}
    for (const b of bursts) {
      const sd = b.startDate
      const ed = b.endDate ?? b.startDate
      if (!sd || Number.isNaN(sd.getTime())) continue
      const startKey = weekKeyFromDate(sd)
      const endKey = weekKeyFromDate(ed)
      if (!(startKey in weeklyValues)) continue

      // Standard bursts store unit rate in `buyAmount`; weekly cells hold
      // deliverables, so qty comes from the persisted `calculatedValue`.
      const buyTypeLower = buyType.toLowerCase()
      const cellQtyRaw = b.calculatedValue
      let cellQty =
        typeof cellQtyRaw === "number" && Number.isFinite(cellQtyRaw)
          ? cellQtyRaw
          : parseNum(cellQtyRaw)
      if (!Number.isFinite(cellQty)) cellQty = 0
      if (
        buyTypeLower === "fixed_cost" ||
        buyTypeLower === "package" ||
        buyTypeLower === "package_inclusions"
      ) {
        cellQty = cellQty > 0 ? cellQty : 1
      }

      if (startKey === endKey) {
        const dWeek = weekColumns.find((c) => c.weekKey === startKey)
        const dKeys = dWeek
          ? coveredDayKeysIfDayDetail(sd, ed, dWeek, campaignStartDate, campaignEndDate)
          : null
        if (dWeek && dKeys && dKeys.length > 0) {
          const split = expandWeekToDaily(cellQty, dKeys)
          for (const k of dKeys) {
            const prevD = dailyValues[k]
            const prevDNum = prevD === "" || prevD === undefined ? 0 : Number(prevD)
            const addD = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
            dailyValues[k] = prevDNum + addD
          }
          continue
        }
        const prev = weeklyValues[startKey]
        const prevNum =
          prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
        weeklyValues[startKey] = prevNum + cellQty
      } else {
        mergedWeekSpans.push({
          id: `std-${index}-m${mergeIdx++}`,
          startWeekKey: startKey,
          endWeekKey: endKey,
          totalQty: cellQty,
          ...burstYmdOverridesForImport(
            sd,
            ed,
            campaignStartDate,
            campaignEndDate
          ),
        })
      }
    }

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `magazines-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      network: String(item.network ?? ""),
      title: String(item.title ?? ""),
      buyType,
      size: String(item.size ?? ""),
      publisher: String(item.publisher ?? ""),
      placement: String(item.placement ?? ""),
      buyingDemo: String(item.buyingDemo ?? item.buying_demo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixed_cost_media ?? item.fixedCostMedia),
      clientPaysForMedia: Boolean(
        item.client_pays_for_media ?? item.clientPaysForMedia
      ),
      budgetIncludesFees: Boolean(
        item.budget_includes_fees ?? item.budgetIncludesFees
      ),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : undefined,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

// --- Programmatic (Audio / BVOD / Display / OOH / Video) expert mappings ---

/** Shared schedule bounds for all programmatic expert rows. */
export function deriveProgExpertRowScheduleYmdFromRow(
  row: {
    weeklyValues: ExpertWeeklyValues
    dailyValues?: ExpertDailyValues
    mergedWeekSpans?: readonly ProgExpertMergedWeekSpan[]
  },
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
): { startDate: string; endDate: string } {
  if (dayKeysByWeekKey) {
    return deriveExpertRowScheduleYmdFromRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    )
  }
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  let firstCol: WeeklyGanttWeekColumn | null = null
  let lastCol: WeeklyGanttWeekColumn | null = null

  const touch = (col: WeeklyGanttWeekColumn) => {
    if (!firstCol) firstCol = col
    lastCol = col
  }

  for (const col of weekColumns) {
    const v = row.weeklyValues[col.weekKey]
    if (weekCellIsActive(v)) touch(col)
  }

  for (const span of row.mergedWeekSpans ?? []) {
    if (!Number.isFinite(span.totalQty) || span.totalQty === 0) continue
    const keys = weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )
    for (const k of keys) {
      const col = weekColumns.find((c) => c.weekKey === k)
      if (col) touch(col)
    }
  }

  if (!firstCol || !lastCol) {
    return {
      startDate: ymd(campaignStartDate),
      endDate: ymd(campaignEndDate),
    }
  }
  const { start } = burstWindowForWeekColumn(
    firstCol,
    campaignStartDate,
    campaignEndDate
  )
  const { end } = burstWindowForWeekColumn(
    lastCol,
    campaignStartDate,
    campaignEndDate
  )
  return { startDate: ymd(start), endDate: ymd(end) }
}

function buildBurstsFromProgExpertLikeRow(
  row: {
    buyType: string
    unitRate: number | string
    budgetIncludesFees: boolean
    weeklyValues: ExpertWeeklyValues
    dailyValues?: ExpertDailyValues
    mergedWeekSpans?: readonly ProgExpertMergedWeekSpan[]
  },
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  feePct: number
): StandardMediaBurst[] {
  const unitRate = parseNum(row.unitRate)
  const buyType = row.buyType
  const budgetIncludesFees = Boolean(row.budgetIncludesFees)
  const bursts: StandardMediaBurst[] = []
  const weekKeyOrder = weekColumns.map((c) => c.weekKey)
  const coveredByMerged = new Set<string>()
  for (const span of row.mergedWeekSpans ?? []) {
    for (const k of weekKeysInSpanInclusive(
      weekKeyOrder,
      span.startWeekKey,
      span.endWeekKey
    )) {
      coveredByMerged.add(k)
    }
  }

  const pushBurst = (
      qty: number,
      startCol: WeeklyGanttWeekColumn,
      endCol: WeeklyGanttWeekColumn,
      dateInput?: PushBurstDateInput
    ) => {
      if (!Number.isFinite(qty) || qty === 0) return
      const { start, end } = resolveBurstExportDates(
        startCol,
        endCol,
        campaignStartDate,
        campaignEndDate,
        parsePushBurstDateInput(dateInput)
      )
    const grossBudget = expertRowRawCost(buyType, unitRate, qty)
    const rawBudget = grossBudget
    const netForCalc = oohNetBudgetForDeliverables(
      rawBudget,
      budgetIncludesFees,
      feePct
    )
    const buyAmountStr = formatRate(unitRate)
    const buyTypeLower = buyType.toLowerCase()
    const isInclusionBuyType =
      buyTypeLower === "bonus" ||
      buyTypeLower === "package_inclusions"
    const isFixedDeliverableBuyType =
      buyTypeLower === "package"
    const usesManualDeliverable =
      isInclusionBuyType ||
      isFixedDeliverableBuyType
    const bonusVal = usesManualDeliverable ? qty : undefined
    const buyAmtNum = usesManualDeliverable ? 0 : unitRate
    const calculatedValue = bvodCalculatedDeliverables(
      buyType,
      netForCalc,
      buyAmtNum,
      bonusVal
    )

    bursts.push({
      budget: formatBurstBudget(rawBudget),
      buyAmount: isInclusionBuyType ? "0" : buyAmountStr,
      startDate: start,
      endDate: end,
      calculatedValue,
    })
  }

  for (const span of row.mergedWeekSpans ?? []) {
    const startCol = weekColumns.find((c) => c.weekKey === span.startWeekKey)
    const endCol = weekColumns.find((c) => c.weekKey === span.endWeekKey)
    if (!startCol || !endCol) continue
    pushBurst(span.totalQty, startCol, endCol, { spanDates: span })
  }

  for (const col of weekColumns) {
      if (coveredByMerged.has(col.weekKey)) continue
      const emitKeys = weekDayKeys(col, campaignStartDate, campaignEndDate)
      if (row.dailyValues && weekHasDailyValues(row.dailyValues, emitKeys)) {
        const dayCols = buildDayColumnsForWeek(col, campaignStartDate, campaignEndDate)
        for (const db of emitDayBurstsForWeek(dayCols, row.dailyValues)) {
          pushBurst(db.qty, col, col, { start: db.startDate, end: db.endDate })
        }
        continue
      }
      const cell = row.weeklyValues[col.weekKey]
      if (cell === "" || cell === undefined) continue

      const qty = typeof cell === "number" ? cell : parseNum(cell)
      if (!Number.isFinite(qty)) continue

      pushBurst(qty, col, col)
    }

  return bursts
}

function progAccumulateWeeklyFromBursts(
  bursts: StandardMediaBurst[],
  buyType: string,
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  index: number
): {
  weeklyValues: Record<string, number | "">
  dailyValues: ExpertDailyValues
  mergedWeekSpans: {
    id: string
    startWeekKey: string
    endWeekKey: string
    totalQty: number
  }[]
} {
  const weeklyValues: Record<string, number | ""> = {}
  for (const col of weekColumns) {
    weeklyValues[col.weekKey] = ""
  }

  const mergedWeekSpans: {
    id: string
    startWeekKey: string
    endWeekKey: string
    totalQty: number
  }[] = []
  let mergeIdx = 0

  const dailyValues: ExpertDailyValues = {}
  for (const b of bursts) {
    const sd = b.startDate
    const ed = b.endDate ?? b.startDate
    if (!sd || Number.isNaN(sd.getTime())) continue
    const startKey = weekKeyFromDate(sd)
    const endKey = weekKeyFromDate(ed)
    if (!(startKey in weeklyValues)) continue

    // Standard bursts store unit rate in `buyAmount`; weekly cells hold
    // deliverables, so qty comes from the persisted `calculatedValue`.
    const buyTypeLower = buyType.toLowerCase()
    const cellQtyRaw = b.calculatedValue
    let cellQty =
      typeof cellQtyRaw === "number" && Number.isFinite(cellQtyRaw)
        ? cellQtyRaw
        : parseNum(cellQtyRaw)
    if (!Number.isFinite(cellQty)) cellQty = 0
    if (
      buyTypeLower === "fixed_cost" ||
      buyTypeLower === "package" ||
      buyTypeLower === "package_inclusions"
    ) {
      cellQty = cellQty > 0 ? cellQty : 1
    }

    if (startKey === endKey) {
        const dWeek = weekColumns.find((c) => c.weekKey === startKey)
        const dKeys = dWeek
          ? coveredDayKeysIfDayDetail(sd, ed, dWeek, campaignStartDate, campaignEndDate)
          : null
        if (dWeek && dKeys && dKeys.length > 0) {
          const split = expandWeekToDaily(cellQty, dKeys)
          for (const k of dKeys) {
            const prevD = dailyValues[k]
            const prevDNum = prevD === "" || prevD === undefined ? 0 : Number(prevD)
            const addD = split[k] === "" || split[k] === undefined ? 0 : Number(split[k])
            dailyValues[k] = prevDNum + addD
          }
          continue
        }
      const prev = weeklyValues[startKey]
      const prevNum =
        prev === "" ? 0 : typeof prev === "number" ? prev : parseNum(prev)
      weeklyValues[startKey] = prevNum + cellQty
    } else {
      mergedWeekSpans.push({
        id: `std-${index}-m${mergeIdx++}`,
        startWeekKey: startKey,
        endWeekKey: endKey,
        totalQty: cellQty,
        ...burstYmdOverridesForImport(
          sd,
          ed,
          campaignStartDate,
          campaignEndDate
        ),
      })
    }
  }

  return { weeklyValues, dailyValues, mergedWeekSpans }
}

/** Prog Audio `lineItems` shape (see {@link ProgAudioContainer}). */
export interface StandardProgAudioFormLineItem {
  platform: string
  bidStrategy: string
  buyType: string
  site: string
  placement: string
  targetingAttribute: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardProgAudioLineItemInput = Partial<StandardProgAudioFormLineItem> & {
  buy_type?: string
  bursts_json?: string | object
}

function normalizeProgAudioBursts(
  item: StandardProgAudioLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

function emptyProgAudioLineItem(
  row: ProgAudioExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardProgAudioFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    site: "",
    placement: "",
    targetingAttribute: "",
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: Boolean(row.noadserving),
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

export function mapProgAudioExpertRowsToStandardLineItems(
  rows: ProgAudioExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardProgAudioFormLineItem[] {
  const feePct = options?.feePctProgAudio ?? 0

  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )
    const bursts = buildBurstsFromProgExpertLikeRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      feePct
    )

    if (bursts.length === 0) {
      return emptyProgAudioLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }

    return {
      platform: String(row.platform ?? "").trim(),
      bidStrategy: row.bidStrategy,
      buyType: row.buyType,
      site: "",
      placement: "",
      targetingAttribute: "",
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: Boolean(row.noadserving),
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardProgAudioLineItemsToExpertRows(
  lineItems: StandardProgAudioLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): ProgAudioExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeProgAudioBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const { weeklyValues, dailyValues, mergedWeekSpans } = progAccumulateWeeklyFromBursts(
      bursts,
      buyType,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      index
    )

    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))

    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `progaudio-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      creativeTargeting: String(item.creativeTargeting ?? ""),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixedCostMedia),
      clientPaysForMedia: Boolean(item.clientPaysForMedia),
      budgetIncludesFees: Boolean(item.budgetIncludesFees),
      noadserving: Boolean(item.noadserving),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : undefined,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Prog BVOD `lineItems` shape (see {@link ProgBVODContainer}). */
export interface StandardProgBvodFormLineItem {
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardProgBvodLineItemInput = Partial<StandardProgBvodFormLineItem> & {
  buy_type?: string
  bursts_json?: string | object
}

function normalizeProgBvodBursts(
  item: StandardProgBvodLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

function emptyProgBvodLineItem(
  row: ProgBvodExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardProgBvodFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: Boolean(row.noadserving),
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

export function mapProgBvodExpertRowsToStandardLineItems(
  rows: ProgBvodExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardProgBvodFormLineItem[] {
  const feePct = options?.feePctProgBvod ?? 0
  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )
    const bursts = buildBurstsFromProgExpertLikeRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      feePct
    )
    if (bursts.length === 0) {
      return emptyProgBvodLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }
    return {
      platform: String(row.platform ?? "").trim(),
      bidStrategy: row.bidStrategy,
      buyType: row.buyType,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: Boolean(row.noadserving),
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardProgBvodLineItemsToExpertRows(
  lineItems: StandardProgBvodLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): ProgBvodExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeProgBvodBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const { weeklyValues, dailyValues, mergedWeekSpans } = progAccumulateWeeklyFromBursts(
      bursts,
      buyType,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      index
    )
    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))
    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `progbvod-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      creativeTargeting: String(item.creativeTargeting ?? ""),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixedCostMedia),
      clientPaysForMedia: Boolean(item.clientPaysForMedia),
      budgetIncludesFees: Boolean(item.budgetIncludesFees),
      noadserving: Boolean(item.noadserving),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : undefined,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Prog Display `lineItems` shape (see {@link ProgDisplayContainer}). */
export interface StandardProgDisplayFormLineItem {
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  site: string
  placement: string
  size: string
  targetingAttribute: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardProgDisplayLineItemInput = Partial<StandardProgDisplayFormLineItem> & {
  buy_type?: string
  bursts_json?: string | object
}

function normalizeProgDisplayBursts(
  item: StandardProgDisplayLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

function emptyProgDisplayLineItem(
  row: ProgDisplayExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardProgDisplayFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    buyingDemo: row.buyingDemo,
    market: row.market,
    site: "",
    placement: "",
    size: "",
    targetingAttribute: "",
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: Boolean(row.noadserving),
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

export function mapProgDisplayExpertRowsToStandardLineItems(
  rows: ProgDisplayExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardProgDisplayFormLineItem[] {
  const feePct = options?.feePctProgDisplay ?? 0
  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )
    const bursts = buildBurstsFromProgExpertLikeRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      feePct
    )
    if (bursts.length === 0) {
      return emptyProgDisplayLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }
    return {
      platform: String(row.platform ?? "").trim(),
      bidStrategy: row.bidStrategy,
      buyType: row.buyType,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      buyingDemo: row.buyingDemo,
      market: row.market,
      site: "",
      placement: "",
      size: "",
      targetingAttribute: "",
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: Boolean(row.noadserving),
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardProgDisplayLineItemsToExpertRows(
  lineItems: StandardProgDisplayLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): ProgDisplayExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeProgDisplayBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const { weeklyValues, dailyValues, mergedWeekSpans } = progAccumulateWeeklyFromBursts(
      bursts,
      buyType,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      index
    )
    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))
    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `progdisplay-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      creativeTargeting: String(item.creativeTargeting ?? ""),
      creative: String(item.creative ?? ""),
      buyingDemo: String(item.buyingDemo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixedCostMedia),
      clientPaysForMedia: Boolean(item.clientPaysForMedia),
      budgetIncludesFees: Boolean(item.budgetIncludesFees),
      noadserving: Boolean(item.noadserving),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : undefined,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Prog Video `lineItems` shape (see {@link ProgVideoContainer}). */
export interface StandardProgVideoFormLineItem {
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  site: string
  placement: string
  size: string
  targetingAttribute: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardProgVideoLineItemInput = Partial<StandardProgVideoFormLineItem> & {
  buy_type?: string
  bursts_json?: string | object
}

function normalizeProgVideoBursts(
  item: StandardProgVideoLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

function emptyProgVideoLineItem(
  row: ProgVideoExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardProgVideoFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    placement: row.placement,
    size: row.size,
    buyingDemo: row.buyingDemo,
    market: row.market,
    site: "",
    targetingAttribute: "",
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: Boolean(row.noadserving),
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

export function mapProgVideoExpertRowsToStandardLineItems(
  rows: ProgVideoExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardProgVideoFormLineItem[] {
  const feePct = options?.feePctProgVideo ?? 0
  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )
    const bursts = buildBurstsFromProgExpertLikeRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      feePct
    )
    if (bursts.length === 0) {
      return emptyProgVideoLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }
    return {
      platform: String(row.platform ?? "").trim(),
      bidStrategy: row.bidStrategy,
      buyType: row.buyType,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      placement: row.placement,
      size: row.size,
      buyingDemo: row.buyingDemo,
      market: row.market,
      site: "",
      targetingAttribute: "",
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: Boolean(row.noadserving),
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardProgVideoLineItemsToExpertRows(
  lineItems: StandardProgVideoLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): ProgVideoExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeProgVideoBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const { weeklyValues, dailyValues, mergedWeekSpans } = progAccumulateWeeklyFromBursts(
      bursts,
      buyType,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      index
    )
    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))
    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `progvideo-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      creativeTargeting: String(item.creativeTargeting ?? ""),
      creative: String(item.creative ?? ""),
      placement: String(item.placement ?? ""),
      size: String(item.size ?? ""),
      buyingDemo: String(item.buyingDemo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixedCostMedia),
      clientPaysForMedia: Boolean(item.clientPaysForMedia),
      budgetIncludesFees: Boolean(item.budgetIncludesFees),
      noadserving: Boolean(item.noadserving),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : undefined,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}

/** Prog OOH `lineItems` shape (see {@link ProgOOHContainer}). */
export interface StandardProgOohFormLineItem {
  platform: string
  bidStrategy: string
  buyType: string
  creativeTargeting: string
  creative: string
  buyingDemo: string
  market: string
  environment: string
  format: string
  location: string
  targetingAttribute: string
  placement: string
  size: string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  noadserving: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  bursts: StandardMediaBurst[]
}

export type StandardProgOohLineItemInput = Partial<StandardProgOohFormLineItem> & {
  buy_type?: string
  bursts_json?: string | object
}

function normalizeProgOohBursts(
  item: StandardProgOohLineItemInput
): StandardMediaBurst[] {
  return normalizeOohBursts(item)
}

function emptyProgOohLineItem(
  row: ProgOohExpertScheduleRow,
  campaignStartDate: Date,
  campaignEndDate: Date,
  lineNo: number,
  budgetIncludesFees: boolean
): StandardProgOohFormLineItem {
  const id = deriveExpertSourceLineItemId(row, lineNo)
  return {
    platform: row.platform,
    bidStrategy: row.bidStrategy,
    buyType: row.buyType,
    creativeTargeting: row.creativeTargeting,
    creative: row.creative,
    placement: row.placement,
    size: row.size,
    buyingDemo: row.buyingDemo,
    market: row.market,
    environment: "",
    format: "",
    location: "",
    targetingAttribute: "",
    fixedCostMedia: Boolean(row.fixedCostMedia),
    clientPaysForMedia: Boolean(row.clientPaysForMedia),
    budgetIncludesFees: Boolean(row.budgetIncludesFees ?? budgetIncludesFees),
    noadserving: Boolean(row.noadserving),
    lineItemId: id,
    line_item_id: id,
    line_item: lineNo,
    lineItem: lineNo,
    bursts: [
      {
        budget: "",
        buyAmount: "",
        startDate: startOfDay(
          clampDateToCampaignRange(campaignStartDate, campaignStartDate, campaignEndDate)
        ),
        endDate: startOfDay(
          clampDateToCampaignRange(campaignEndDate, campaignStartDate, campaignEndDate)
        ),
        calculatedValue: 0,
      },
    ],
  }
}

export function mapProgOohExpertRowsToStandardLineItems(
  rows: ProgOohExpertScheduleRow[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date,
  options?: ExpertToStandardBurstOptions
): StandardProgOohFormLineItem[] {
  const feePct = options?.feePctProgOoh ?? 0
  return rows.map((row, idx) => {
    const lineNo = idx + 1
    const id = deriveExpertSourceLineItemId(row, lineNo)
    const budgetIncludesFees = Boolean(
      row.budgetIncludesFees ?? options?.budgetIncludesFees ?? false
    )
    const bursts = buildBurstsFromProgExpertLikeRow(
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      feePct
    )
    if (bursts.length === 0) {
      return emptyProgOohLineItem(
        row,
        campaignStartDate,
        campaignEndDate,
        lineNo,
        budgetIncludesFees
      )
    }
    return {
      platform: String(row.platform ?? "").trim(),
      bidStrategy: row.bidStrategy,
      buyType: row.buyType,
      creativeTargeting: row.creativeTargeting,
      creative: row.creative,
      placement: row.placement,
      size: row.size,
      buyingDemo: row.buyingDemo,
      market: row.market,
      environment: "",
      format: "",
      location: "",
      targetingAttribute: "",
      fixedCostMedia: Boolean(row.fixedCostMedia),
      clientPaysForMedia: Boolean(row.clientPaysForMedia),
      budgetIncludesFees,
      noadserving: Boolean(row.noadserving),
      lineItemId: id,
      line_item_id: id,
      line_item: lineNo,
      lineItem: lineNo,
      bursts,
    }
  })
}

export function mapStandardProgOohLineItemsToExpertRows(
  lineItems: StandardProgOohLineItemInput[],
  weekColumns: WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): ProgOohExpertScheduleRow[] {
  const __expertImportRows = lineItems.map((item, index) => {
    const bursts = normalizeProgOohBursts(item)
    const buyType = String(item.buyType ?? item.buy_type ?? "")
    const { weeklyValues, dailyValues, mergedWeekSpans } = progAccumulateWeeklyFromBursts(
      bursts,
      buyType,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      index
    )
    const firstBurst = bursts.find(
      (b) => b.startDate && !Number.isNaN(b.startDate.getTime())
    )
    const lastBurst = [...bursts]
      .reverse()
      .find((b) => b.endDate && !Number.isNaN(b.endDate.getTime()))
    const id = String(
      item.line_item_id ??
        item.lineItemId ??
        item.line_item ??
        item.lineItem ??
        index + 1
    )
    const _reactKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `progooh-expert-import-${Date.now()}-${index}`

    return {
      id: _reactKey,
      sourceLineItemId: id,
      startDate: firstBurst
        ? formatYmd(firstBurst.startDate)
        : formatYmd(campaignStartDate),
      endDate: lastBurst
        ? formatYmd(lastBurst.endDate)
        : formatYmd(campaignEndDate),
      platform: String(item.platform ?? ""),
      bidStrategy: String(item.bidStrategy ?? ""),
      buyType,
      creativeTargeting: String(item.creativeTargeting ?? ""),
      creative: String(item.creative ?? ""),
      placement: String(item.placement ?? ""),
      size: String(item.size ?? ""),
      buyingDemo: String(item.buyingDemo ?? ""),
      market: String(item.market ?? ""),
      fixedCostMedia: Boolean(item.fixedCostMedia),
      clientPaysForMedia: Boolean(item.clientPaysForMedia),
      budgetIncludesFees: Boolean(item.budgetIncludesFees),
      noadserving: Boolean(item.noadserving),
      unitRate: deriveUnitRateFromBursts(bursts),
      grossCost: sumGrossBursts(bursts),
      weeklyValues,
      ...(Object.keys(dailyValues).length > 0 ? { dailyValues } : {}),
      mergedWeekSpans:
        mergedWeekSpans.length > 0 ? mergedWeekSpans : undefined,
    }
  })
  return projectLumpSumCardBudgetsOntoExpertRows(
    __expertImportRows,
    weekColumns.map((c) => c.weekKey)
  )
}
