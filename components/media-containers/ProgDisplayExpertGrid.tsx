"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import {
  differenceInCalendarDays,
  format,
  parse as parseDateFns,
  startOfDay,
} from "date-fns"
import { Copy, GitMerge, Grid3x3, Plus, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { fuzzyMatchNetwork } from "@/lib/mediaplan/expertOohFuzzyMatch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ExpertGridBillingHeaderLabel } from "@/components/media-containers/ExpertGridBillingHeaderLabel"
import type {
  ExpertWeeklyValues,
  ProgExpertMergedWeekSpan,
  ProgDisplayExpertScheduleRow,
} from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  anchorPasteColumnFromKey,
  clipboardMatrixFromDataTransfer,
  parseDatePasteValue,
  parseRatePasteValue,
  parseWeeklyPasteValue,
  readClipboardMatrixAsync,
  resolvePasteColumn,
  rowHasNumericWeekPasteCell,
  trimEmptyEdgeColumns,
} from "@/lib/mediaplan/expertGridPaste"
import {
  expertGridCellId,
  focusExpertGridCell,
  handleExpertGridInputKeyDown,
} from "@/lib/mediaplan/expertGridKeyboardNav"
import {
  deriveProgExpertRowScheduleYmdFromRow,
  expertRowRawCost,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  buildWeeklyGanttColumnsFromCampaign,
  type WeeklyGanttWeekColumn,
} from "@/lib/utils/weeklyGanttColumns"
import { formatCurrencyFull } from "@/lib/format/currency"
import { cn } from "@/lib/utils"
import {
  getMediaTypeThemeHex,
  mediaTypeTotalsRowStyle,
  rgbaFromHex,
} from "@/lib/mediaplan/mediaTypeAccents"
import {
  WEEK_GRID_COL_OFFSET,
  WEEK_COL_WIDTH_PX as PROGDISPLAY_EXPERT_WEEK_COL_WIDTH_PX,
  expertWeekColLayoutStyle as progDisplayExpertWeekColLayoutStyle,
  WEEK_SCROLLER_EDGE as PROGDISPLAY_EXPERT_WEEK_SCROLLER_EDGE,
  WEEK_CELL_VISUAL_CLASSES as PROGDISPLAY_WEEK_CELL_VISUAL_CLASSES,
  expertGridParseNum as parseNum,
  expertRowFeeSplit,
  weekKeysInSpanInclusive,
  findMergedSpanForWeek,
  weekCellIsPopulated,
  normalizeWeekValueForExpertGridBoundary,
  weeklyCellDisplayValue,
  sortWeekKeysByTimeline,
  weekKeysAreContiguous,
  selectionOverlapsMergedSpan,
  normalizeWeekRect as normalizeProgDisplayWeekRect,
  weekCellInRect as progDisplayWeekCellInRect,
  rectToMultiCellSelection,
  selectionBoundsFromWeeklyExportSelection,
  coerceWeeklySelectionBounds,
  enumerateWeeklyPasteTargets,
  prepareWeeklyPasteDataWithWeekAlignment,
  buildWeeklyPasteTargetsAnchorOnly,
  mapClipboardMatrixToWeeklyTargets,
  applyWeeklyPasteMatrixToSelection,
  weekRangeOutlineFlags as tvWeekRangeOutlineFlags,
  weekOutlineEdgeClasses as tvWeekOutlineEdgeClasses,
  mergeReadyOutlineFlags as oohMergeReadyOutlineFlags,
  mergeReadyOutlineEdgeClasses as oohMergeReadyOutlineEdgeClasses,
  weekCellInMergePulseHighlight as tvWeekCellInMergePulseHighlight,
  mergeKeysFromRect as oohMergeKeysFromRect,
  normalizeWeekMergeSelection as normalizeProgDisplayWeekMergeSelection,
  weekPlainClickPreservesWeekAreaSelection,
  deriveMergeEligibility as deriveProgDisplayMergeEligibility,
  weekCellExportText,
  mergedWeekSpansAfterCutRect,
  resolveWeeklyExportSelection,
  buildWeeklyExportTsv,
  applyWeeklyCutToRows,
  type ExpertWeekRectSelection,
  type ExpertMultiCellSelection,
  type WeeklyExportSelection,
  type WeekMergeSelectionNormalized,
} from "@/lib/mediaplan/expertGridShared"

type ProgDisplayWeekRectSelection = ExpertWeekRectSelection
type ProgDisplayMultiCellSelection = ExpertMultiCellSelection
type ProgDisplayWeekMergeSelectionNormalized = WeekMergeSelectionNormalized

const MEDIA_ACCENT_HEX = getMediaTypeThemeHex("progdisplay")

const progDisplayExpertHeaderCellBgStyle = {
  backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.08),
}

const progDisplayExpertTotalsRowBgStyle = {
  backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.06),
}

const DEBUG_PROGDISPLAY_MERGE = false

function normalizeProgDisplayKey(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function sumWeeklyQuantities(
  weeklyValues: ExpertWeeklyValues,
  weekKeys: string[]
): number {
  return weekKeys.reduce((s, k) => s + parseNum(weeklyValues[k]), 0)
}

function sumMergedQuantities(row: ProgDisplayExpertScheduleRow): number {
  return (row.mergedWeekSpans ?? []).reduce(
    (s, sp) => s + (Number.isFinite(sp.totalQty) ? sp.totalQty : 0),
    0
  )
}

/**
 * Parse clipboard text that may contain tab-separated values (Excel/Sheets)
 * into a row/column matrix.
 */
function parseClipboardToMatrix(text: string): string[][] {
  if (!text || text.trim() === "") return []
  return text
    .split(/\r?\n/)
    .filter((row) => row.length > 0)
    .map((row) => row.split("\t"))
}

type ProgDisplayCopiedCells = {
  data: (string | number)[][]
  sourceRows: number
  sourceCols: number
  selection: ProgDisplayMultiCellSelection
}

/** Match labels/values on Prog Display / Prog OOH buy-type combobox. */
const PROGDISPLAY_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

const PROGDISPLAY_BID_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "clicks", label: "Clicks" },
  { value: "conversions", label: "Conversions" },
  { value: "reach", label: "Reach" },
  { value: "viewability", label: "Viewability" },
]

function normalizeProgDisplayBuyTypePaste(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  const byValue = PROGDISPLAY_BUY_TYPE_OPTIONS.find(
    (o) => o.value.toLowerCase() === v.toLowerCase()
  )
  if (byValue) return byValue.value
  const byLabel = PROGDISPLAY_BUY_TYPE_OPTIONS.find(
    (o) => o.label.toLowerCase() === v.toLowerCase()
  )
  if (byLabel) return byLabel.value
  return v
}

function normalizeProgDisplayBidStrategyPaste(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  const byValue = PROGDISPLAY_BID_STRATEGY_OPTIONS.find((o) => o.value.toLowerCase() === v.toLowerCase())
  if (byValue) return byValue.value
  const byLabel = PROGDISPLAY_BID_STRATEGY_OPTIONS.find((o) => o.label.toLowerCase() === v.toLowerCase())
  if (byLabel) return byLabel.value
  return v
}

function normalizeProgDisplayPlatformPaste(raw: string, platformNames: string[]): string {
  const v = raw.trim()
  if (!v) return ""
  const exact = platformNames.find((n) => n.toLowerCase() === v.toLowerCase())
  if (exact) return exact
  const fz = fuzzyMatchNetwork(v, platformNames)
  return fz?.matched ?? v
}

function rowGrossCost(row: ProgDisplayExpertScheduleRow, weekKeys: string[]): number {
  const rate = parseNum(row.unitRate)
  const qty =
    sumWeeklyQuantities(row.weeklyValues, weekKeys) + sumMergedQuantities(row)
  return expertRowRawCost(row.buyType, rate, qty)
}

function rowNetMedia(
  row: ProgDisplayExpertScheduleRow,
  weekKeys: string[],
  feePct: number
): number {
  const raw = rowGrossCost(row, weekKeys)
  return expertRowFeeSplit(
    raw,
    !!row.budgetIncludesFees,
    feePct,
    !!row.clientPaysForMedia
  ).net
}

function rowNetMediaTooltip(
  row: ProgDisplayExpertScheduleRow,
  qtySum: number
): string {
  const bt = String(row.buyType || "").toLowerCase()
  const rate = parseNum(row.unitRate)
  if (bt === "bonus") return "Bonus: net media = 0"
  if (bt === "cpm")
    return `CPM: (Σ qty / 1000) × rate (${qtySum} / 1000 × ${rate})`
  return `Σ qty × rate (${qtySum} × ${rate})`
}

export function createEmptyProgDisplayExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): ProgDisplayExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) {
    weeklyValues[k] = ""
  }
  return {
    id,
    startDate: ymd(campaignStartDate),
    endDate: ymd(campaignEndDate),
    platform: "",
    bidStrategy: "",
    buyType: "",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    noadserving: false,
    unitRate: "",
    grossCost: 0,
    weeklyValues,
    mergedWeekSpans: [],
  }
}

const PROGDISPLAY_DESCRIPTOR_CORE: readonly (keyof ProgDisplayExpertScheduleRow)[] = [
  "startDate",
  "endDate",
  "platform",
  "bidStrategy",
  "buyType",
  "creativeTargeting",
  "creative",
]

const PROGDISPLAY_BILLING_FLAG_KEYS: readonly (keyof ProgDisplayExpertScheduleRow)[] = [
  "fixedCostMedia",
  "clientPaysForMedia",
  "budgetIncludesFees",
  "noadserving",
]

const PROGDISPLAY_DESCRIPTOR_TAIL: readonly (keyof ProgDisplayExpertScheduleRow)[] = [
  "market",
  "buyingDemo",
  "unitRate",
]

function cumulativeLeftOffsets(widths: readonly number[]): number[] {
  const out: number[] = []
  let acc = 0
  for (const w of widths) {
    out.push(acc)
    acc += w
  }
  return out
}

function formatYmdDisplay(ymd: string): string {
  if (!ymd?.trim()) return "—"
  const d = new Date(`${ymd.trim()}T12:00:00`)
  if (Number.isNaN(d.getTime())) return "—"
  return format(d, "dd/MM/yy")
}

export interface ProgDisplayExpertGridProps {
  campaignStartDate: Date
  campaignEndDate: Date
  feeprogdisplay: number
  /** Controlled row data; parent should initialize from standard line items when entering expert mode. */
  rows: ProgDisplayExpertScheduleRow[]
  onRowsChange: (rows: ProgDisplayExpertScheduleRow[]) => void
  /** Platform names (social publishers API) for platform combobox + fuzzy matching */
  publishers?: { publisher_name: string }[]
}

const moneyOpts = { locale: "en-AU" as const, currency: "AUD" as const }

type ProgDisplayExpertFocusedCell = { rowIndex: number; columnKey: string }
type WeekDragSource =
  | {
      type: "single"
      rowIndex: number
      weekKey: string
      value: number | ""
    }
  | {
      type: "merged"
      rowIndex: number
      weekKey: string
      spanId: string
      startWeekKey: string
      endWeekKey: string
      spanLength: number
      totalQty: number
    }

type FuzzyMatchField = "platform"

interface PendingFuzzyMatch {
  rowIndex: number
  field: FuzzyMatchField
  value: string
  matched: string
}

type ProgDisplayRowMergeSpanMeta = Readonly<{
  id: string
  startWeekKey: string
  endWeekKey: string
  totalQty: number
  spanLength: number
  weekKeysIncluded: readonly string[]
}>

type ProgDisplayRowMergeMap = Readonly<{
  anchorByWeekKey: Readonly<Record<string, string>>
  interiorByWeekKey: Readonly<Record<string, string>>
  spanById: Readonly<Record<string, ProgExpertMergedWeekSpan>>
  spanMetaByAnchorWeekKey: Readonly<Record<string, ProgDisplayRowMergeSpanMeta>>
}>

export function ProgDisplayExpertGrid({
  campaignStartDate,
  campaignEndDate,
  feeprogdisplay,
  rows,
  onRowsChange,
  publishers = [],
}: ProgDisplayExpertGridProps) {
  const { toast } = useToast()
  const domGridId = useId().replace(/:/g, "")
  const [focusedCell, setFocusedCell] = useState<ProgDisplayExpertFocusedCell | null>(
    null
  )
  const focusedCellRef = useRef<ProgDisplayExpertFocusedCell | null>(null)
  focusedCellRef.current = focusedCell

  const [rowCountInput, setRowCountInput] = useState<string>("1")
  const [pendingFuzzyMatch, setPendingFuzzyMatch] =
    useState<PendingFuzzyMatch | null>(null)
  const fuzzyMatchAutoApplyRef = useRef(false)
  const fuzzyCorrectionMapRef = useRef<Record<string, string>>({})
  const platformNames = useMemo(
    () => publishers.map((p) => p.publisher_name),
    [publishers]
  )

  const weekColumns = useMemo(
    () => buildWeeklyGanttColumnsFromCampaign(campaignStartDate, campaignEndDate),
    [campaignStartDate, campaignEndDate]
  )
  const weekKeys = useMemo(() => weekColumns.map((c) => c.weekKey), [weekColumns])

  const [weekStripSelection, setWeekStripSelection] = useState<{
    rowIndex: number
  } | null>(null)
  const [weekMultiSelect, setWeekMultiSelect] = useState<{
    rowIndex: number
    keys: string[]
  } | null>(null)
  const [weekRectSelection, setWeekRectSelection] =
    useState<ProgDisplayWeekRectSelection | null>(null)
  // Multi-cell selection state for copy/paste operations.
  const [multiCellSelection, setMultiCellSelection] =
    useState<ProgDisplayMultiCellSelection | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [showBillingCols, setShowBillingCols] = useState(false)
  const [copiedCells, setCopiedCells] = useState<ProgDisplayCopiedCells | null>(null)
  const [pendingMergeSelection, setPendingMergeSelection] = useState<{
    rowIndex: number
    keys: string[]
    anchorWeekKey: string
  } | null>(null)
  const [weekDragSource, setWeekDragSource] = useState<WeekDragSource | null>(
    null
  )
  const [weekDragOver, setWeekDragOver] = useState<{
    rowIndex: number
    weekKey: string
    valid: boolean
  } | null>(null)
  const weekAreaDragRef = useRef<{
    rowIndex: number
    weekKey: string
  } | null>(null)
  /** Latest rect set during a pointer-drag across week cells (for post-drag click handling). */
  const lastDragRectDuringGestureRef = useRef<ProgDisplayWeekRectSelection | null>(null)
  /**
   * After a multi-cell drag ends, the next click inside this rect only finalizes focus/anchor;
   * clicks outside clear this ref so a new selection can apply immediately.
   */
  const postDragWeekClickRectRef = useRef<ProgDisplayWeekRectSelection | null>(null)
  const weekRectSelectionRef = useRef<ProgDisplayWeekRectSelection | null>(null)
  weekRectSelectionRef.current = weekRectSelection
  const weekStripSelectionRef = useRef(weekStripSelection)
  weekStripSelectionRef.current = weekStripSelection
  const lastPendingMergeSelectionLogRef = useRef<string>("")
  const mergedAnchorInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const lastWeekAnchorRef = useRef<{ rowIndex: number; weekKey: string } | null>(
    null
  )
  /** When true, paste capture skips applying (keyboard path uses async clipboard read). */
  const suppressNextPasteApplyRef = useRef(false)

  /** Full merged span band on a row (anchor + interiors) after interior click → anchor focus. */
  const [mergeSpanHighlightPulse, setMergeSpanHighlightPulse] = useState<{
    rowIndex: number
    startWeekKey: string
    endWeekKey: string
  } | null>(null)
  const mergePulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMultiCellSelection(rectToMultiCellSelection(weekRectSelection, weekKeys))
  }, [weekRectSelection, weekKeys])

  useEffect(() => {
    return () => {
      if (mergePulseTimeoutRef.current) {
        clearTimeout(mergePulseTimeoutRef.current)
      }
    }
  }, [])

  const flashMergedSpanHighlight = useCallback(
    (rowIndex: number, startWeekKey: string, endWeekKey: string) => {
      if (mergePulseTimeoutRef.current) {
        clearTimeout(mergePulseTimeoutRef.current)
      }
      setMergeSpanHighlightPulse({ rowIndex, startWeekKey, endWeekKey })
      mergePulseTimeoutRef.current = setTimeout(() => {
        setMergeSpanHighlightPulse(null)
        mergePulseTimeoutRef.current = null
      }, 1300)
    },
    []
  )

  const progDisplayDescriptorKeys = useMemo(
    () =>
      [
        ...(showBillingCols ? PROGDISPLAY_BILLING_FLAG_KEYS : []),
        ...PROGDISPLAY_DESCRIPTOR_CORE,
        ...PROGDISPLAY_DESCRIPTOR_TAIL,
      ] as (keyof ProgDisplayExpertScheduleRow)[],
    [showBillingCols]
  )

  const descriptorColWidths = useMemo(() => {
    const billing = [56, 56, 56, 56]
    const core = [48, 48, 120, 110, 96, 120, 110]
    const tail = [96, 110, 88]
    return showBillingCols ? [...billing, ...core, ...tail] : [...core, ...tail]
  }, [showBillingCols])

  const leftOffsets = useMemo(
    () => cumulativeLeftOffsets(descriptorColWidths),
    [descriptorColWidths]
  )

  /** Full width of all descriptor columns (sticky “Weekly totals” label colspan). */
  const descriptorStickyBlockWidthPx = useMemo(
    () => descriptorColWidths.reduce((s, w) => s + w, 0),
    [descriptorColWidths]
  )

  const stickyStyleBodyDescriptorTotalLabel = useMemo(
    () => ({
      width: descriptorStickyBlockWidthPx,
      minWidth: descriptorStickyBlockWidthPx,
      maxWidth: descriptorStickyBlockWidthPx,
      boxSizing: "border-box" as const,
    }),
    [descriptorStickyBlockWidthPx]
  )

  const platformComboboxOptions: ComboboxOption[] = useMemo(
    () => platformNames.map((name) => ({ value: name, label: name })),
    [platformNames]
  )

  const normalizedRows = useMemo(() => {
    return rows.map((r) => {
      const nextWeekly: ExpertWeeklyValues = {} as ExpertWeeklyValues
      for (const k of weekKeys) {
        const v = r.weeklyValues[k]
        // Expert UX: backend/default zeroes for untouched weeks should render blank.
        nextWeekly[k] = normalizeWeekValueForExpertGridBoundary(v)
      }
      return {
        ...r,
        weeklyValues: nextWeekly,
        mergedWeekSpans: Array.isArray(r.mergedWeekSpans)
          ? r.mergedWeekSpans
          : [],
      }
    })
  }, [rows, weekKeys])

  const rowMergeMaps = useMemo<readonly ProgDisplayRowMergeMap[]>(() => {
    const maps = normalizedRows.map((row) => {
      const anchorByWeekKey: Record<string, string> = {}
      const interiorByWeekKey: Record<string, string> = {}
      const spanById: Record<string, ProgExpertMergedWeekSpan> = {}
      const spanMetaByAnchorWeekKey: Record<string, ProgDisplayRowMergeSpanMeta> = {}
      const occupiedWeekKeys = new Set<string>()
      // A row can contain multiple non-overlapping merged groups with gaps.
      // Each accepted span contributes its own anchor/interior occupancy maps.
      for (const span of row.mergedWeekSpans ?? []) {
        if (spanById[span.id]) {
          if (DEBUG_PROGDISPLAY_MERGE) {
            console.debug("[Programmatic Display merge] occupancy duplicate span id ignored", {
              rowId: row.id,
              rowIndex: normalizedRows.indexOf(row),
              spanId: span.id,
            })
          }
          continue
        }
        const keysRaw = weekKeysInSpanInclusive(
          weekKeys,
          span.startWeekKey,
          span.endWeekKey
        )
        const keys = keysRaw.filter((k) => weekKeys.includes(k))
        if (keys.length === 0) continue
        // Prefer first valid span: later overlapping/conflicting spans are ignored.
        if (keys.some((k) => occupiedWeekKeys.has(k))) {
          if (DEBUG_PROGDISPLAY_MERGE) {
            console.debug("[Programmatic Display merge] occupancy overlap ignored", {
              rowId: row.id,
              rowIndex: normalizedRows.indexOf(row),
              spanId: span.id,
              keys,
            })
          }
          continue
        }
        const anchorWeekKey = keys[0]!
        anchorByWeekKey[anchorWeekKey] = span.id
        for (let i = 1; i < keys.length; i += 1) {
          interiorByWeekKey[keys[i]!] = span.id
        }
        for (const key of keys) occupiedWeekKeys.add(key)
        spanById[span.id] = span
        spanMetaByAnchorWeekKey[anchorWeekKey] = Object.freeze({
          id: span.id,
          startWeekKey: span.startWeekKey,
          endWeekKey: span.endWeekKey,
          totalQty: span.totalQty,
          spanLength: keys.length,
          weekKeysIncluded: Object.freeze([...keys]),
        })
      }
      return Object.freeze({
        anchorByWeekKey: Object.freeze(anchorByWeekKey),
        interiorByWeekKey: Object.freeze(interiorByWeekKey),
        spanById: Object.freeze(spanById),
        spanMetaByAnchorWeekKey: Object.freeze(spanMetaByAnchorWeekKey),
      })
    })
    return Object.freeze(maps)
  }, [normalizedRows, weekKeys])

  useEffect(() => {
    if (!DEBUG_PROGDISPLAY_MERGE) return
    const nextSig = pendingMergeSelection
      ? `${pendingMergeSelection.rowIndex}:${pendingMergeSelection.keys.join(",")}:${pendingMergeSelection.anchorWeekKey}`
      : "null"
    if (lastPendingMergeSelectionLogRef.current === nextSig) return
    lastPendingMergeSelectionLogRef.current = nextSig
    console.debug("[Programmatic Display merge] pending selection updated", pendingMergeSelection)
  }, [pendingMergeSelection])

  const normalizedRowsRef = useRef(normalizedRows)
  normalizedRowsRef.current = normalizedRows
  const weekMultiSelectRef = useRef(weekMultiSelect)
  weekMultiSelectRef.current = weekMultiSelect

  const pushRows = useCallback(
    (next: ProgDisplayExpertScheduleRow[]) => {
      const withDates = next.map((r) => ({
        ...r,
        ...deriveProgExpertRowScheduleYmdFromRow(
          r,
          weekColumns,
          campaignStartDate,
          campaignEndDate
        ),
      }))
      onRowsChange(withDates)
    },
    [onRowsChange, weekColumns, campaignStartDate, campaignEndDate]
  )

  const resolveWeekDragSource = useCallback(
    (rowIndex: number, weekKey: string): WeekDragSource | null => {
      const row = normalizedRows[rowIndex]
      if (!row) return null
      const span = findMergedSpanForWeek(row, weekKey, weekKeys)
      if (span && span.startWeekKey === weekKey) {
        const keys = weekKeysInSpanInclusive(
          weekKeys,
          span.startWeekKey,
          span.endWeekKey
        )
        return {
          type: "merged",
          rowIndex,
          weekKey,
          spanId: span.id,
          startWeekKey: span.startWeekKey,
          endWeekKey: span.endWeekKey,
          spanLength: keys.length,
          totalQty: span.totalQty,
        }
      }
      if (span && span.startWeekKey !== weekKey) return null
      const value = row.weeklyValues[weekKey]
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        (typeof value === "number" && value === 0)
      ) {
        return null
      }
      return {
        type: "single",
        rowIndex,
        weekKey,
        value,
      }
    },
    [normalizedRows, weekKeys]
  )

  const validateWeekDropTarget = useCallback(
    (
      drag: WeekDragSource,
      targetRowIndex: number,
      targetWeekKey: string
    ): { ok: boolean; reason?: string } => {
      const targetRow = normalizedRows[targetRowIndex]
      if (!targetRow) return { ok: false, reason: "Target row is unavailable." }
      const targetRowMergeMap = rowMergeMaps[targetRowIndex]
      const targetAnchorSpanId = targetRowMergeMap?.anchorByWeekKey[targetWeekKey]
      const targetInteriorSpanId = targetRowMergeMap?.interiorByWeekKey[targetWeekKey]
      const targetMembership: "anchor" | "interior" | "none" = targetInteriorSpanId
        ? "interior"
        : targetAnchorSpanId
          ? "anchor"
          : "none"
      if (targetMembership === "interior") {
        return { ok: false, reason: "Cannot drop into interior merged weeks." }
      }
      if (drag.type === "single") {
        if (drag.rowIndex === targetRowIndex && drag.weekKey === targetWeekKey) {
          return { ok: false, reason: "Same source and destination cell." }
        }
        if (targetMembership !== "none") {
          return {
            ok: false,
            reason: "Dropping onto merged anchors is not supported in phase 1.",
          }
        }
        return { ok: true }
      }
      const startIdx = weekKeys.indexOf(targetWeekKey)
      if (startIdx < 0) return { ok: false, reason: "Invalid target week." }
      const endIdx = startIdx + drag.spanLength - 1
      if (endIdx >= weekKeys.length) {
        return {
          ok: false,
          reason: "Merged span does not fit from this starting week.",
        }
      }
      for (let wi = startIdx; wi <= endIdx; wi++) {
        const wk = weekKeys[wi]!
        const existingSpanId =
          targetRowMergeMap?.anchorByWeekKey[wk] ??
          targetRowMergeMap?.interiorByWeekKey[wk]
        if (!existingSpanId) continue
        const isOwnSpan =
          targetRowIndex === drag.rowIndex && existingSpanId === drag.spanId
        if (!isOwnSpan) {
          return {
            ok: false,
            reason: "Target range overlaps another merged span.",
          }
        }
      }
      return { ok: true }
    },
    [normalizedRows, rowMergeMaps, weekKeys]
  )

  const clearWeekDragUiState = useCallback(() => {
    setWeekDragSource(null)
    setWeekDragOver(null)
  }, [])

  const resetTransientWeekUiState = useCallback(
    (options?: { preserveFocus?: boolean; preserveMergePulse?: boolean }) => {
      setWeekStripSelection(null)
      setWeekMultiSelect(null)
      setWeekRectSelection(null)
      setMultiCellSelection(null)
      setCopiedCells(null)
      setIsSelecting(false)
      setPendingMergeSelection(null)
      setWeekDragSource(null)
      setWeekDragOver(null)
      lastWeekAnchorRef.current = null
      weekAreaDragRef.current = null
      lastDragRectDuringGestureRef.current = null
      postDragWeekClickRectRef.current = null

      if (!options?.preserveMergePulse) {
        setMergeSpanHighlightPulse(null)
      }

      if (!options?.preserveFocus) {
        const focused = focusedCellRef.current
        if (focused && weekKeys.includes(focused.columnKey)) {
          focusedCellRef.current = null
          setFocusedCell(null)
        }
      }
    },
    [weekKeys]
  )

  const updateRow = useCallback(
    (rowIndex: number, patch: Partial<ProgDisplayExpertScheduleRow>) => {
      const next = normalizedRows.map((r, i) =>
        i === rowIndex ? { ...r, ...patch } : r
      )
      pushRows(next)
    },
    [normalizedRows, pushRows]
  )

  const tryFuzzyMatch = useCallback(
    (rowIndex: number, field: FuzzyMatchField, value: string) => {
      if (!value.trim()) return
      const corrKey = `${field}:${value.trim().toLowerCase()}`
      const corrected = fuzzyCorrectionMapRef.current[corrKey]
      if (corrected) {
        updateRow(rowIndex, { [field]: corrected } as Partial<ProgDisplayExpertScheduleRow>)
        return
      }
      let match: { matched: string } | null = null
      if (field === "platform") {
        match = fuzzyMatchNetwork(value, platformNames)
      }
      if (!match) return
      if (fuzzyMatchAutoApplyRef.current) {
        updateRow(rowIndex, { [field]: match.matched } as Partial<ProgDisplayExpertScheduleRow>)
      } else {
        setPendingFuzzyMatch({
          rowIndex,
          field,
          value: value.trim(),
          matched: match.matched,
        })
      }
    },
    [platformNames, updateRow]
  )

  const handleFuzzyMatchConfirm = useCallback(
    (enableAutoMatch: boolean) => {
      if (!pendingFuzzyMatch) return
      const { field, matched, value } = pendingFuzzyMatch
      const key = `${field}:${value.trim().toLowerCase()}`
      if (enableAutoMatch) {
        fuzzyMatchAutoApplyRef.current = true
        fuzzyCorrectionMapRef.current[key] = matched
      }
      const targetNorm = value.trim().toLowerCase()
      const next = normalizedRows.map((r) => {
        const cur = String(r[field] ?? "")
        if (cur.trim().toLowerCase() === targetNorm) {
          return { ...r, [field]: matched }
        }
        return r
      })
      pushRows(next)
      setPendingFuzzyMatch(null)
    },
    [pendingFuzzyMatch, normalizedRows, pushRows]
  )

  const handleRowCountBlur = useCallback(() => {
    if (rowCountInput === "") {
      setRowCountInput("1")
      return
    }
    const n = Math.max(1, Math.min(500, parseInt(rowCountInput, 10) || 1))
    setRowCountInput(String(n))
  }, [rowCountInput])

  const navColCount =
    progDisplayDescriptorKeys.length + WEEK_GRID_COL_OFFSET + weekKeys.length
  const firstWeekNavColIndex = progDisplayDescriptorKeys.length + WEEK_GRID_COL_OFFSET
  const unitRateNavColIndex = progDisplayDescriptorKeys.indexOf("unitRate")

  const stickyThCorner = (className?: string) =>
    cn(
      "sticky top-0 border-b border-r px-1.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))] backdrop-blur-sm",
      className
    )

  const stickyThWeek = cn(
    "sticky top-0 z-[55] border-b border-r px-1 py-3.5 text-center text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))] backdrop-blur-sm align-middle"
  )

  const stickyTd = (index: number, className?: string) =>
    cn(
      "border-b border-r bg-inherit px-1 py-0.5 align-middle",
      className
    )

  const stickyStyleBody = (index: number) => ({
    width: descriptorColWidths[index],
    minWidth: descriptorColWidths[index],
    maxWidth: descriptorColWidths[index],
    boxSizing: "border-box" as const,
  })

  const stickyStyleHeaderCorner = (index: number) => ({
    width: descriptorColWidths[index],
    minWidth: descriptorColWidths[index],
    maxWidth: descriptorColWidths[index],
    boxSizing: "border-box" as const,
  })

  const handleGridInputKeyDown = useCallback(
    (
      rowIndex: number,
      colIndex: number,
      e: KeyboardEvent<HTMLInputElement>
    ) => {
      const t = e.currentTarget
      const isDate = t.type === "date"
      if (
        e.key === "ArrowRight" &&
        !isDate &&
        colIndex === unitRateNavColIndex &&
        unitRateNavColIndex >= 0
      ) {
        const len = t.value.length
        const start = t.selectionStart ?? 0
        const end = t.selectionEnd ?? 0
        if (start === len && end === len) {
          e.preventDefault()
          focusExpertGridCell(domGridId, rowIndex, firstWeekNavColIndex)
          return
        }
      }
      if (
        e.key === "ArrowLeft" &&
        !isDate &&
        colIndex === firstWeekNavColIndex
      ) {
        const start = t.selectionStart ?? 0
        const end = t.selectionEnd ?? 0
        if (start === 0 && end === 0 && unitRateNavColIndex >= 0) {
          e.preventDefault()
          focusExpertGridCell(domGridId, rowIndex, unitRateNavColIndex)
          return
        }
      }
      handleExpertGridInputKeyDown({
        gridId: domGridId,
        rowIndex,
        colIndex,
        rowCount: normalizedRows.length,
        colCount: navColCount,
        event: e,
      })
    },
    [
      domGridId,
      firstWeekNavColIndex,
      navColCount,
      normalizedRows.length,
      unitRateNavColIndex,
    ]
  )

  const updateWeeklyCell = useCallback(
    (rowIndex: number, weekKey: string, raw: string) => {
      const row = normalizedRows[rowIndex]
      if (!row) return
      const span = findMergedSpanForWeek(row, weekKey, weekKeys)
      if (span && span.startWeekKey !== weekKey) return

      const cleaned = raw.replace(/[^\d.-]/g, "")
      if (cleaned === "" || cleaned === "-") {
        if (span) {
          // Preserve merge topology on edit clear/delete; only the X control unmerges.
          const mergedWeekSpans = (row.mergedWeekSpans ?? []).map((s) =>
            s.id === span.id ? { ...s, totalQty: 0 } : s
          )
          pushRows(
            normalizedRows.map((r, i) =>
              i === rowIndex ? { ...r, mergedWeekSpans } : r
            )
          )
          return
        }
        const weeklyValues = { ...row.weeklyValues, [weekKey]: "" as const }
        pushRows(
          normalizedRows.map((r, i) =>
            i === rowIndex ? { ...r, weeklyValues } : r
          )
        )
        return
      }
      const n = Number.parseFloat(cleaned)
      if (!Number.isFinite(n)) return
      if (span) {
        const mergedWeekSpans = (row.mergedWeekSpans ?? []).map((s) =>
          s.id === span.id ? { ...s, totalQty: n } : s
        )
        pushRows(
          normalizedRows.map((r, i) =>
            i === rowIndex ? { ...r, mergedWeekSpans } : r
          )
        )
        return
      }
      const weeklyValues = { ...row.weeklyValues, [weekKey]: n }
      pushRows(
        normalizedRows.map((r, i) => (i === rowIndex ? { ...r, weeklyValues } : r))
      )
    },
    [normalizedRows, pushRows, weekKeys]
  )

  const unmergeWeekSpan = useCallback(
    (rowIndex: number, spanId: string) => {
      const row = normalizedRows[rowIndex]
      if (!row) return
      // Dedicated and only destructive merge removal path.
      // Remove only the chosen span; all other merged groups on this row are preserved.
      const mergedWeekSpans = (row.mergedWeekSpans ?? []).filter(
        (span) => span.id !== spanId
      )
      pushRows(
        normalizedRows.map((r, i) =>
          i === rowIndex ? { ...r, mergedWeekSpans } : r
        )
      )
      resetTransientWeekUiState()
      if (DEBUG_PROGDISPLAY_MERGE) {
        console.debug("[Programmatic Display merge] unmerge applied", { rowIndex, spanId })
      }
    },
    [normalizedRows, pushRows, resetTransientWeekUiState]
  )

  const addRow = useCallback(() => {
    const parsed = Math.max(
      1,
      Math.min(500, parseInt(rowCountInput, 10) || 1)
    )
    const idPrefix =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `progdisplay-expert-${Date.now()}`
    const newRows = Array.from({ length: parsed }, (_, i) =>
      createEmptyProgDisplayExpertRow(
        `${idPrefix}-${i}`,
        campaignStartDate,
        campaignEndDate,
        weekKeys
      )
    )
    const next = [...normalizedRows, ...newRows]
    pushRows(next)
    resetTransientWeekUiState()
    setRowCountInput(String(parsed))
  }, [
    campaignStartDate,
    campaignEndDate,
    normalizedRows,
    pushRows,
    resetTransientWeekUiState,
    rowCountInput,
    weekKeys,
  ])

  const duplicateRow = useCallback(
    (rowIndex: number) => {
      const source = normalizedRows[rowIndex]
      if (!source) return
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `progdisplay-expert-${Date.now()}-${rowIndex}`
      const weeklyValues = { ...source.weeklyValues }
      const mergedWeekSpans = (source.mergedWeekSpans ?? []).map((s, i) => ({
        ...s,
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `sp-${Date.now()}-${i}`,
      }))
      pushRows([
        ...normalizedRows.slice(0, rowIndex + 1),
        { ...source, id, weeklyValues, mergedWeekSpans },
        ...normalizedRows.slice(rowIndex + 1),
      ])
      resetTransientWeekUiState()
    },
    [normalizedRows, pushRows, resetTransientWeekUiState]
  )

  const clearPendingMergeSelection = useCallback((reason: string) => {
    // Sticky by default: only explicit reset paths should clear merge intent.
    setPendingMergeSelection((prev) => {
      if (!prev) return prev
      void reason
      return null
    })
  }, [])

  /** Clears only week-area state that involves this merged anchor (not other rows/ranges). */
  const clearWeekSelectionWhereMergedAnchorInvolved = useCallback(
    (rowIndex: number, weekKey: string) => {
      setWeekRectSelection((prev) =>
        prev && progDisplayWeekCellInRect(rowIndex, weekKey, prev, weekKeys)
          ? null
          : prev
      )
      setWeekMultiSelect((prev) =>
        prev &&
        prev.rowIndex === rowIndex &&
        prev.keys.includes(weekKey)
          ? null
          : prev
      )
      setWeekStripSelection((prev) =>
        prev && prev.rowIndex === rowIndex ? null : prev
      )
      setPendingMergeSelection((p) => {
        if (!p || p.rowIndex !== rowIndex) return p
        if (p.keys.includes(weekKey)) return null
        return p
      })
      postDragWeekClickRectRef.current = null
      weekAreaDragRef.current = null
    },
    [weekKeys]
  )

  /** Single interaction gateway for merged anchors: edit focus only, no week-range selection. */
  const focusMergedAnchorEditSurface = useCallback(
    (rowIndex: number, weekKey: string, e?: React.SyntheticEvent) => {
      e?.preventDefault()
      e?.stopPropagation()
      clearWeekSelectionWhereMergedAnchorInvolved(rowIndex, weekKey)
      lastWeekAnchorRef.current = { rowIndex, weekKey }
      mergedAnchorInputRefs.current[`${rowIndex}:${weekKey}`]?.focus()
    },
    [clearWeekSelectionWhereMergedAnchorInvolved]
  )

  const deleteRow = useCallback(
    (rowIndex: number) => {
      if (normalizedRows.length <= 1) return
      pushRows(normalizedRows.filter((_, i) => i !== rowIndex))
      resetTransientWeekUiState()
    },
    [normalizedRows, pushRows, resetTransientWeekUiState]
  )

  const toggleWeekMultiSelect = useCallback(
    (rowIndex: number, weekKey: string) => {
      setWeekRectSelection(null)
      setWeekMultiSelect((prev) => {
        if (!prev || prev.rowIndex !== rowIndex) {
          return { rowIndex, keys: [weekKey] }
        }
        const set = new Set(prev.keys)
        if (set.has(weekKey)) set.delete(weekKey)
        else set.add(weekKey)
        const keys = sortWeekKeysByTimeline([...set], weekKeys)
        return { rowIndex, keys }
      })
      setWeekStripSelection(null)
    },
    [weekKeys]
  )

  const rangeWeekMultiSelect = useCallback(
    (rowIndex: number, anchorKey: string, endKey: string) => {
      const i0 = weekKeys.indexOf(anchorKey)
      const i1 = weekKeys.indexOf(endKey)
      if (i0 < 0 || i1 < 0) return
      const lo = Math.min(i0, i1)
      const hi = Math.max(i0, i1)
      setWeekMultiSelect({
        rowIndex,
        keys: weekKeys.slice(lo, hi + 1),
      })
      setWeekRectSelection(
        normalizeProgDisplayWeekRect(rowIndex, anchorKey, rowIndex, endKey, weekKeys)
      )
      setWeekStripSelection(null)
    },
    [weekKeys]
  )

  const lockPendingMergeSelectionFromCurrentSelection = useCallback(() => {
    const n = deriveProgDisplayMergeEligibility(
      weekRectSelectionRef.current,
      weekMultiSelectRef.current,
      weekKeys
    )
    if (!n || n.orderedWeekKeys.length < 2) return
    setPendingMergeSelection((prev) => {
      const next = {
        rowIndex: n.rowIndex,
        keys: n.orderedWeekKeys,
        anchorWeekKey: n.anchorWeekKey,
      }
      if (
        prev &&
        prev.rowIndex === next.rowIndex &&
        prev.anchorWeekKey === next.anchorWeekKey &&
        prev.keys.length === next.keys.length &&
        prev.keys.every((k, i) => k === next.keys[i])
      ) {
        return prev
      }
      return next
    })
  }, [weekKeys])

  useEffect(() => {
    lockPendingMergeSelectionFromCurrentSelection()
  }, [
    weekRectSelection,
    weekMultiSelect,
    lockPendingMergeSelectionFromCurrentSelection,
  ])

  const derivedMergeTarget = useMemo(() => {
    const n = deriveProgDisplayMergeEligibility(weekRectSelection, weekMultiSelect, weekKeys)
    if (!n || n.orderedWeekKeys.length < 2) return null
    return { rowIndex: n.rowIndex, keys: n.orderedWeekKeys }
  }, [weekRectSelection, weekMultiSelect, weekKeys])

  const mergeTarget = useMemo(() => {
    if (!derivedMergeTarget || derivedMergeTarget.keys.length < 2) {
      return null
    }
    const sorted = sortWeekKeysByTimeline([...derivedMergeTarget.keys], weekKeys)
    if (sorted.length < 2 || !weekKeysAreContiguous(sorted, weekKeys)) {
      return null
    }
    const rowIndex = derivedMergeTarget.rowIndex
    const row = normalizedRows[rowIndex]
    if (!row) return null
    if (selectionOverlapsMergedSpan(rowMergeMaps[rowIndex], sorted, weekKeys)) {
      return null
    }
    return { rowIndex, keys: sorted }
  }, [derivedMergeTarget, normalizedRows, rowMergeMaps, weekKeys])
  const mergeTargetRef = useRef(mergeTarget)
  mergeTargetRef.current = mergeTarget

  useEffect(() => {
    const endDrag = () => {
      setIsSelecting(false)
      const r = lastDragRectDuringGestureRef.current
      lastDragRectDuringGestureRef.current = null
      weekAreaDragRef.current = null
      const multiCellDrag =
        Boolean(r) &&
        !(
          r!.rowStart === r!.rowEnd && r!.weekKeyStart === r!.weekKeyEnd
        )
      if (multiCellDrag) {
        postDragWeekClickRectRef.current = r
      } else {
        postDragWeekClickRectRef.current = null
      }
      if (DEBUG_PROGDISPLAY_MERGE) {
        console.debug("[Programmatic Display merge] drag end", {
          lastRect: r,
          postDragClickGuard: multiCellDrag,
        })
      }
    }
    window.addEventListener("pointerup", endDrag)
    window.addEventListener("pointercancel", endDrag)
    return () => {
      window.removeEventListener("pointerup", endDrag)
      window.removeEventListener("pointercancel", endDrag)
    }
  }, [])

  useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false)
    }
    document.addEventListener("mouseup", handleMouseUp)
    return () => document.removeEventListener("mouseup", handleMouseUp)
  }, [])

  const handleMergeSelectedWeeks = useCallback(() => {
    // Prefer current selection so users can merge any contiguous week combo on any row.
    const n = deriveProgDisplayMergeEligibility(
      weekRectSelectionRef.current,
      weekMultiSelectRef.current,
      weekKeys
    )
    const sel =
      n && n.orderedWeekKeys.length >= 2
        ? {
            rowIndex: n.rowIndex,
            keys: n.orderedWeekKeys,
            anchorWeekKey: n.anchorWeekKey,
          }
        : null
    if (!sel || sel.keys.length < 2) {
      const r = weekRectSelectionRef.current
      if (r && r.rowStart !== r.rowEnd) {
        toast({
          variant: "destructive",
          title: "Merge one row only",
          description:
            "Select contiguous weeks on a single row. Multi-row selections are for copy and paste.",
        })
      }
      return
    }
    const sorted = sortWeekKeysByTimeline(sel.keys, weekKeys)
    if (!weekKeysAreContiguous(sorted, weekKeys)) {
      toast({
        variant: "destructive",
        title: "Contiguous weeks only",
        description:
          "Select adjacent weeks on one line (use Shift+click for a range).",
      })
      return
    }
    const rowIndex = sel.rowIndex
    const rowsNow = normalizedRowsRef.current
    const row = rowsNow[rowIndex]
    if (!row) return
    if (selectionOverlapsMergedSpan(rowMergeMaps[rowIndex], sorted, weekKeys)) {
      if (DEBUG_PROGDISPLAY_MERGE) {
        console.debug("[Programmatic Display merge] validation overlap failure", {
          rowIndex,
          selectedWeekKeys: sorted,
        })
      }
      toast({
        variant: "destructive",
        title: "Selection overlaps a merged block",
        description:
          "Leave at least one unmerged week between groups, or unmerge the existing block first.",
      })
      return
    }
    let sum = 0
    for (const k of sorted) {
      sum += parseNum(row.weeklyValues[k])
    }
    const newId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `merge-${Date.now()}`
    const newSpan: ProgExpertMergedWeekSpan = {
      id: newId,
      startWeekKey: sorted[0]!,
      endWeekKey: sorted[sorted.length - 1]!,
      totalQty: sum,
    }
    const weeklyValues = { ...row.weeklyValues }
    for (const k of sorted) weeklyValues[k] = ""
    // Append-only for merge topology: existing non-overlapping spans on this row remain untouched.
    const mergedWeekSpans = [...(row.mergedWeekSpans ?? []), newSpan]
    if (DEBUG_PROGDISPLAY_MERGE) {
      console.debug("[Programmatic Display merge] merge applied", {
        rowIndex,
        spanId: newSpan.id,
        startWeekKey: newSpan.startWeekKey,
        endWeekKey: newSpan.endWeekKey,
        totalQty: newSpan.totalQty,
        mergedWeekKeys: sorted,
      })
    }
    pushRows(
      rowsNow.map((r, i) =>
        i === rowIndex ? { ...r, weeklyValues, mergedWeekSpans } : r
      )
    )
    resetTransientWeekUiState()
    toast({
      title: "Weeks merged",
      description: `Merged ${sorted.length} weeks into one burst. Edit the value or click the red ✕ to unmerge.`,
    })
  }, [pushRows, resetTransientWeekUiState, rowMergeMaps, toast, weekKeys])

  const mergeWeeksReady =
    mergeTarget !== null &&
    mergeTarget.keys.length >= 2 &&
    weekKeysAreContiguous(mergeTarget.keys, weekKeys)

  useEffect(() => {
    if (!mergeWeeksReady || !mergeTarget) return
    const lastKey = mergeTarget.keys[mergeTarget.keys.length - 1]
    if (!lastKey) return
    const lastWi = weekKeys.indexOf(lastKey)
    if (lastWi < 0) return
    const cellId = expertGridCellId(
      domGridId,
      mergeTarget.rowIndex,
      progDisplayDescriptorKeys.length + WEEK_GRID_COL_OFFSET + lastWi
    )
    document
      .getElementById(cellId)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
  }, [domGridId, mergeTarget, mergeWeeksReady, progDisplayDescriptorKeys.length, weekKeys])

  useEffect(() => {
    if (!DEBUG_PROGDISPLAY_MERGE) return
    console.debug("[Programmatic Display merge] merge eligibility derived", {
      mergeTarget,
      derivedMergeTarget,
      mergeWeeksReady,
      weekRectSelection,
      weekMultiSelect,
    })
  }, [
    mergeTarget,
    derivedMergeTarget,
    mergeWeeksReady,
    weekRectSelection,
    weekMultiSelect,
  ])

  const gridScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleDocumentPointerDown = (ev: PointerEvent) => {
      const root = gridScrollRef.current
      if (!root) return
      const target = ev.target
      if (!(target instanceof Node)) return
      if (!root.contains(target)) {
        resetTransientWeekUiState()
      }
    }
    window.addEventListener("pointerdown", handleDocumentPointerDown, true)
    return () => {
      window.removeEventListener("pointerdown", handleDocumentPointerDown, true)
    }
  }, [resetTransientWeekUiState])

  const handleCellFocus = useCallback((rowIndex: number, columnKey: string) => {
    const next = { rowIndex, columnKey }
    focusedCellRef.current = next
    setFocusedCell(next)
  }, [])

  const pasteMatrixIntoGrid = useCallback(
    (matrix: string[][]) => {
      if (!matrix || matrix.length === 0) return

      const fc = focusedCellRef.current
      if (!fc) {
        toast({
          variant: "destructive",
          title: "Paste skipped",
          description:
            "Focus a cell in the grid before pasting from Excel.",
        })
        return
      }

      const anchor = anchorPasteColumnFromKey(
        fc.columnKey,
        progDisplayDescriptorKeys,
        weekKeys
      )
      if (anchor === null) {
        toast({
          variant: "destructive",
          title: "Paste skipped",
          description:
            "Focus a cell in the grid before pasting from Excel.",
        })
        return
      }

      const fcIsWeek = weekKeys.includes(fc.columnKey)

      if (fcIsWeek) {
        let working = trimEmptyEdgeColumns(matrix)
        if (working.length === 0) return

        const nextRows: ProgDisplayExpertScheduleRow[] = normalizedRows.map((r) => ({
          ...r,
          weeklyValues: { ...r.weeklyValues },
          mergedWeekSpans: [...(r.mergedWeekSpans ?? [])],
        }))

        const { applied, errorReasons, layout, usedWeekAlignmentToast } =
          applyWeeklyPasteMatrixToSelection({
            matrix: working,
            weekColumns,
            anchorRow: fc.rowIndex,
            anchorWeekKey: fc.columnKey,
            weekRectSelection: weekRectSelectionRef.current,
            weekStripSelection: weekStripSelectionRef.current,
            weekMultiSelect: weekMultiSelectRef.current,
            weekKeys,
            rowCount: normalizedRows.length,
            nextRows,
          })

        if (applied > 0) {
          pushRows(nextRows)
          if (usedWeekAlignmentToast) {
            toast({
              title: "Weeks aligned",
              description:
                "Pasted weeks were aligned to the closest campaign weeks.",
            })
          }
          if (layout !== "direct") {
            if (layout === "tile") {
              toast({
                title: "Pattern repeated across selection",
                description:
                  "Clipboard values were tiled or repeated to fill the selected weeks.",
              })
            } else {
              toast({
                title: "Paste clipped to selection",
                description:
                  "Only the top-left part of the clipboard fit the selected area.",
              })
            }
          }
        }

        const uniqueErrors = [...new Set(errorReasons)]
        if (uniqueErrors.length > 0) {
          const preview = uniqueErrors.slice(0, 2).join(" ")
          toast({
            variant: "destructive",
            title: "Some pasted values were skipped",
            description: `${preview}${uniqueErrors.length > 2 ? " …" : ""}`,
          })
        }
        return
      }

      let working = trimEmptyEdgeColumns(matrix)
      if (working.length === 0) return

      const anchorRow = fc.rowIndex

      const nextRows: ProgDisplayExpertScheduleRow[] = normalizedRows.map((r) => ({
        ...r,
        weeklyValues: { ...r.weeklyValues },
        mergedWeekSpans: [...(r.mergedWeekSpans ?? [])],
      }))

      let applied = 0
      const errorReasons: string[] = []

      for (let dr = 0; dr < working.length; dr++) {
        const targetRow = anchorRow + dr
        if (targetRow < 0 || targetRow >= nextRows.length) continue

        const pasteRow = working[dr] ?? []
        for (let dc = 0; dc < pasteRow.length; dc++) {
          const raw = pasteRow[dc] ?? ""
          const pasteCol = anchor + dc
          const target = resolvePasteColumn(
            pasteCol,
            progDisplayDescriptorKeys,
            weekKeys
          )
          if (!target) continue

          const cur = nextRows[targetRow]

          if (target.kind === "week") {
            const res = parseWeeklyPasteValue(raw)
            if (!res.ok) {
              errorReasons.push(res.reason)
              continue
            }
            const sp = findMergedSpanForWeek(cur, target.weekKey, weekKeys)
            if (sp && sp.startWeekKey !== target.weekKey) {
              continue
            }
            if (sp && sp.startWeekKey === target.weekKey) {
              // Preserve merged spans in generic paste flow; empty paste zeroes quantity.
              const nextQty = res.value === "" ? 0 : (res.value as number)
              nextRows[targetRow] = {
                ...cur,
                mergedWeekSpans: (cur.mergedWeekSpans ?? []).map((s) =>
                  s.id === sp.id ? { ...s, totalQty: nextQty } : s
                ),
              }
              applied += 1
              continue
            }
            nextRows[targetRow] = {
              ...cur,
              weeklyValues: { ...cur.weeklyValues, [target.weekKey]: res.value },
            }
            applied += 1
            continue
          }

          const field = target.field as keyof ProgDisplayExpertScheduleRow
          if (field === "startDate" || field === "endDate") {
            continue
          }
          if (field === "unitRate") {
            const res = parseRatePasteValue(raw)
            if (!res.ok) {
              errorReasons.push(res.reason)
              continue
            }
            nextRows[targetRow] = { ...cur, unitRate: res.value }
            applied += 1
          } else if (
            field === "fixedCostMedia" ||
            field === "clientPaysForMedia" ||
            field === "budgetIncludesFees" ||
            field === "noadserving"
          ) {
            const v = raw.trim().toLowerCase()
            const truthy =
              v === "true" || v === "1" || v === "yes" || v === "y"
            nextRows[targetRow] = {
              ...cur,
              [field]: truthy,
            } as ProgDisplayExpertScheduleRow
            applied += 1
          } else if (field === "buyType") {
            nextRows[targetRow] = {
              ...cur,
              buyType: normalizeProgDisplayBuyTypePaste(raw),
            }
            applied += 1
          } else if (field === "bidStrategy") {
            nextRows[targetRow] = {
              ...cur,
              bidStrategy: normalizeProgDisplayBidStrategyPaste(raw),
            }
            applied += 1
          } else if (field === "platform") {
            const plt = normalizeProgDisplayPlatformPaste(raw, platformNames)
            nextRows[targetRow] = {
              ...cur,
              platform: plt,
            }
            applied += 1
          } else {
            const v = raw.trim()
            nextRows[targetRow] = { ...cur, [field]: v } as ProgDisplayExpertScheduleRow
            applied += 1
          }
        }
      }

      if (applied > 0) {
        pushRows(nextRows)
      }

      const uniqueErrors = [...new Set(errorReasons)]
      if (uniqueErrors.length > 0) {
        const preview = uniqueErrors.slice(0, 2).join(" ")
        toast({
          variant: "destructive",
          title: "Some pasted values were skipped",
          description: `${preview}${uniqueErrors.length > 2 ? " …" : ""}`,
        })
      }
    },
    [
      normalizedRows,
      platformNames,
      progDisplayDescriptorKeys,
      pushRows,
      toast,
      weekColumns,
      weekKeys,
    ]
  )

  const copySelectedWeekRangeToClipboard = useCallback(async (): Promise<boolean> => {
    const rows = normalizedRowsRef.current
    const sel = resolveWeeklyExportSelection(
      weekRectSelectionRef.current,
      weekStripSelectionRef.current,
      mergeTargetRef.current,
      focusedCellRef.current,
      weekKeys,
      rows
    )
    if (!sel) return false
    const text = buildWeeklyExportTsv(sel, rows, weekKeys)
    if (!text) return false
    const selection = selectionBoundsFromWeeklyExportSelection(sel, weekKeys)
    const matrix = text.split("\n").map((line) => line.split("\t"))
    try {
      await navigator.clipboard.writeText(text)
      if (selection) {
        setCopiedCells({
          data: matrix,
          sourceRows: selection.endRow - selection.startRow + 1,
          sourceCols: selection.endCol - selection.startCol + 1,
          selection,
        })
      }
      return true
    } catch {
      return false
    }
  }, [weekKeys])

  const cutSelectedWeekRangeToClipboard = useCallback(async (): Promise<boolean> => {
    const rows = normalizedRowsRef.current
    const sel = resolveWeeklyExportSelection(
      weekRectSelectionRef.current,
      weekStripSelectionRef.current,
      mergeTargetRef.current,
      focusedCellRef.current,
      weekKeys,
      rows
    )
    if (!sel) return false
    const text = buildWeeklyExportTsv(sel, rows, weekKeys)
    if (!text) return false
    const selection = selectionBoundsFromWeeklyExportSelection(sel, weekKeys)
    const matrix = text.split("\n").map((line) => line.split("\t"))
    try {
      await navigator.clipboard.writeText(text)
      if (selection) {
        setCopiedCells({
          data: matrix,
          sourceRows: selection.endRow - selection.startRow + 1,
          sourceCols: selection.endCol - selection.startCol + 1,
          selection,
        })
      }
    } catch {
      return false
    }
    const next = applyWeeklyCutToRows(sel, rows, weekKeys)
    if (!next) return true
    pushRows(next)
    switch (sel.kind) {
      case "rect":
      case "mergeContiguous":
        setWeekRectSelection(null)
        setWeekMultiSelect(null)
        break
      case "strip":
        setWeekStripSelection(null)
        break
      default:
        break
    }
    return true
  }, [pushRows, weekKeys])

  const handlePasteCapture = useCallback(
    (e: React.ClipboardEvent) => {
      if (suppressNextPasteApplyRef.current) {
        suppressNextPasteApplyRef.current = false
        e.preventDefault()
        e.stopPropagation()
        return
      }
      e.preventDefault()
      e.stopPropagation()

      const plainText = e.clipboardData.getData("text/plain")
      const plainMatrix = parseClipboardToMatrix(plainText)
      let matrix =
        plainMatrix.length > 0
          ? plainMatrix
          : clipboardMatrixFromDataTransfer(e.clipboardData)
      if (!matrix || matrix.length === 0) return
      matrix = trimEmptyEdgeColumns(matrix)
      if (matrix.length === 0) return
      pasteMatrixIntoGrid(matrix)
    },
    [pasteMatrixIntoGrid]
  )

  const handleGridKeyDownCapture = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const root = gridScrollRef.current
      if (!root) return
      const t = e.target
      if (!(t instanceof Node) || !root.contains(t)) return

      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (key === "c") {
        const sel = resolveWeeklyExportSelection(
          weekRectSelectionRef.current,
          weekStripSelectionRef.current,
          mergeTargetRef.current,
          focusedCellRef.current,
          weekKeys,
          normalizedRowsRef.current
        )
        if (sel) {
          e.preventDefault()
          e.stopPropagation()
          void copySelectedWeekRangeToClipboard()
        }
        return
      }

      if (key === "x") {
        const sel = resolveWeeklyExportSelection(
          weekRectSelectionRef.current,
          weekStripSelectionRef.current,
          mergeTargetRef.current,
          focusedCellRef.current,
          weekKeys,
          normalizedRowsRef.current
        )
        if (sel) {
          e.preventDefault()
          e.stopPropagation()
          void cutSelectedWeekRangeToClipboard()
        }
        return
      }

      if (key === "v") {
        const fc = focusedCellRef.current
        const fcIsWeek = Boolean(
          fc && weekKeys.includes(fc.columnKey)
        )

        if (!fcIsWeek) {
          return
        }

        e.preventDefault()
        e.stopPropagation()
        suppressNextPasteApplyRef.current = true
        window.setTimeout(() => {
          if (suppressNextPasteApplyRef.current) {
            suppressNextPasteApplyRef.current = false
          }
        }, 0)
        void (async () => {
          let matrix = await readClipboardMatrixAsync()
          if (!matrix?.length) return
          matrix = trimEmptyEdgeColumns(matrix)
          if (!matrix.length) return
          pasteMatrixIntoGrid(matrix)
        })()
      }
    },
    [
      copySelectedWeekRangeToClipboard,
      cutSelectedWeekRangeToClipboard,
      pasteMatrixIntoGrid,
      weekKeys,
    ]
  )

  const handleCopyCapture = useCallback(
    (e: React.ClipboardEvent) => {
      const rows = normalizedRowsRef.current
      const sel = resolveWeeklyExportSelection(
        weekRectSelectionRef.current,
        weekStripSelectionRef.current,
        mergeTargetRef.current,
        focusedCellRef.current,
        weekKeys,
        rows
      )
      if (!sel) return
      const text = buildWeeklyExportTsv(sel, rows, weekKeys)
      if (!text) return
      const selection = selectionBoundsFromWeeklyExportSelection(sel, weekKeys)
      const matrix = text.split("\n").map((line) => line.split("\t"))
      e.preventDefault()
      e.stopPropagation()
      e.clipboardData.setData("text/plain", text)
      void navigator.clipboard.writeText(text).catch(() => {})
      if (selection) {
        setCopiedCells({
          data: matrix,
          sourceRows: selection.endRow - selection.startRow + 1,
          sourceCols: selection.endCol - selection.startCol + 1,
          selection,
        })
      }
    },
    [weekKeys]
  )

  const handleCutCapture = useCallback(
    (e: React.ClipboardEvent) => {
      const rows = normalizedRowsRef.current
      const sel = resolveWeeklyExportSelection(
        weekRectSelectionRef.current,
        weekStripSelectionRef.current,
        mergeTargetRef.current,
        focusedCellRef.current,
        weekKeys,
        rows
      )
      if (!sel) return
      const text = buildWeeklyExportTsv(sel, rows, weekKeys)
      if (!text) return
      const selection = selectionBoundsFromWeeklyExportSelection(sel, weekKeys)
      const matrix = text.split("\n").map((line) => line.split("\t"))
      e.preventDefault()
      e.stopPropagation()
      e.clipboardData.setData("text/plain", text)
      void navigator.clipboard.writeText(text).catch(() => {})
      if (selection) {
        setCopiedCells({
          data: matrix,
          sourceRows: selection.endRow - selection.startRow + 1,
          sourceCols: selection.endCol - selection.startCol + 1,
          selection,
        })
      }
      const next = applyWeeklyCutToRows(sel, rows, weekKeys)
      if (next) {
        pushRows(next)
        switch (sel.kind) {
          case "rect":
          case "mergeContiguous":
            setWeekRectSelection(null)
            setWeekMultiSelect(null)
            break
          case "strip":
            setWeekStripSelection(null)
            break
          default:
            break
        }
      }
    },
    [pushRows, weekKeys]
  )

  const containerTotals = useMemo(() => {
    let sumNet = 0
    let sumFee = 0
    let sumQty = 0
    const perWeek: Record<string, number> = {}
    for (const k of weekKeys) perWeek[k] = 0

    for (const row of normalizedRows) {
      const raw = rowGrossCost(row, weekKeys)
      const split = expertRowFeeSplit(
        raw,
        !!row.budgetIncludesFees,
        feeprogdisplay,
        !!row.clientPaysForMedia
      )
      sumNet += split.net
      sumFee += split.fee
      for (const k of weekKeys) {
        const q = parseNum(row.weeklyValues[k])
        perWeek[k] += q
        sumQty += q
      }
      for (const span of row.mergedWeekSpans ?? []) {
        const q = span.totalQty
        if (!Number.isFinite(q) || q === 0) continue
        if (span.startWeekKey in perWeek) {
          perWeek[span.startWeekKey] += q
        }
        sumQty += q
      }
    }

    const totalWithFee = sumNet + sumFee

    return { sumNet, sumQty, perWeek, fee: sumFee, totalWithFee }
  }, [feeprogdisplay, normalizedRows, weekKeys])

  const descriptorHeadLabels = useMemo(() => {
    const billing = showBillingCols
      ? [
          "Fixed Cost Media",
          "Client Pays for Media",
          "Budget Includes Fees",
          "No Ad Serving",
        ]
      : []
    const core = [
      "Start Date",
      "End Date",
      "Platform",
      "Bid Strategy",
      "Buy Type",
      "Creative Targeting",
      "Creative",
    ]
    const tail = ["Market", "Buying Demo", "Unit Rate", "Net Media", "", "Σ qty"]
    return [...billing, ...core, ...tail]
  }, [showBillingCols])

  const colIndexOf = useCallback(
    (key: keyof ProgDisplayExpertScheduleRow) => progDisplayDescriptorKeys.indexOf(key),
    [progDisplayDescriptorKeys]
  )

  const campaignRangeLabel = `${format(campaignStartDate, "MMM d, yyyy")} – ${format(campaignEndDate, "MMM d, yyyy")}`

  return (
    <TooltipProvider delayDuration={300}>
      <Card className="relative overflow-hidden border-0 shadow-md">
        <div className="flex min-w-0 flex-row">
          <div
            className="w-1 shrink-0 self-stretch"
            style={{ backgroundColor: MEDIA_ACCENT_HEX }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/5 pb-3">
          <CardTitle className="text-base font-semibold tracking-tight">
            Programmatic Display — Expert Schedule
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="progdisplay-expert-row-count" className="text-sm whitespace-nowrap">
                Rows:
              </Label>
              <Input
                id="progdisplay-expert-row-count"
                type="number"
                min={1}
                max={500}
                title="Rows to append when Add row is clicked (1–500)."
                className="w-16 h-8 border-0 bg-transparent text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring"
                value={rowCountInput}
                onChange={(e) => setRowCountInput(e.target.value.replace(/\D/g, ""))}
                onBlur={handleRowCountBlur}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              title="Append as many empty rows as the number in the Rows field (1–500)."
            >
              <Plus className="mr-1 h-4 w-4" />
              Add row
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setShowBillingCols((v) => !v)}
            >
              {showBillingCols ? "Hide" : "Show"} billing columns
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Campaign</span>{" "}
              <span className="tabular-nums">{campaignRangeLabel}</span>
              <span className="mx-1.5 text-border">·</span>
              <span>{weekColumns.length} week columns</span>
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-border/80 bg-card/30 shadow-sm">
            {normalizedRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
                <div
                  className="rounded-full border border-border/60 p-3 text-muted-foreground/45"
                  style={{ backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.06) }}
                  aria-hidden
                >
                  <Grid3x3 className="h-8 w-8" strokeWidth={1.25} />
                </div>
                <div className="space-y-2 max-w-md">
                  <p className="text-sm font-medium text-foreground">
                    No expert schedule rows
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Add a row to enter buy details and weekly quantities, or
                    return to Standard mode to build line items first—switching
                    to Expert again will map them into this grid.
                  </p>
                </div>
                <Button type="button" size="sm" onClick={addRow}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add first row
                </Button>
              </div>
            ) : (
              <div
                ref={gridScrollRef}
                className="relative min-h-[400px] max-h-[min(70vh,900px)] min-w-0 overflow-x-auto overflow-y-auto overscroll-contain scroll-smooth [scrollbar-gutter:stable]"
                onKeyDownCapture={handleGridKeyDownCapture}
                onPasteCapture={handlePasteCapture}
                onCopyCapture={handleCopyCapture}
                onCutCapture={handleCutCapture}
                data-expert-grid={domGridId}
                data-progdisplay-expert-grid-scroll=""
              >
                <table className="w-max min-w-full border-collapse text-sm">
                  <thead className="[&_tr]:border-b-0">
                    <tr>
                      {descriptorHeadLabels.map((label, i) => (
                        <th
                          key={`h-${i}`}
                          className={stickyThCorner(
                            i === descriptorHeadLabels.length - 1
                              ? PROGDISPLAY_EXPERT_WEEK_SCROLLER_EDGE
                              : undefined
                          )}
                          style={{
                            ...stickyStyleHeaderCorner(i),
                            ...progDisplayExpertHeaderCellBgStyle,
                          }}
                        >
                          {label === "Unit Rate" ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{label}</span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs text-xs">
                                Rate (CPC / CPM / CPV depending on Buy Type)
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <ExpertGridBillingHeaderLabel label={label} />
                          )}
                        </th>
                      ))}
                      {weekColumns.map((col) => (
                        <th
                          key={col.weekKey}
                          className={stickyThWeek}
                          style={{
                            ...progDisplayExpertWeekColLayoutStyle,
                            ...progDisplayExpertHeaderCellBgStyle,
                          }}
                          title={col.labelFull}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-h-[3rem] w-full cursor-default items-center justify-center px-0.5 py-1">
                                <span className="text-[11px] font-semibold uppercase leading-snug tracking-wider text-foreground tabular-nums">
                                  {col.labelShort}
                                </span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              className="max-w-xs text-xs"
                            >
                              {col.labelFull}
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {normalizedRows.map((row, rowIndex) => {
                      const net = rowNetMedia(row, weekKeys, feeprogdisplay)
                      const qtySum =
                        sumWeeklyQuantities(row.weeklyValues, weekKeys) +
                        sumMergedQuantities(row)
                      const netMediaTooltip = rowNetMediaTooltip(row, qtySum)
                      const stripe =
                        rowIndex % 2 === 1 ? "bg-muted/10" : ""
                      const stripeStyle =
                        rowIndex % 2 === 0
                          ? {
                              backgroundColor: rgbaFromHex(
                                MEDIA_ACCENT_HEX,
                                0.03
                              ),
                            }
                          : undefined
                      const grossCol = progDisplayDescriptorKeys.length
                      const actionsCol = progDisplayDescriptorKeys.length + 1
                      const sigmaCol = progDisplayDescriptorKeys.length + 2
                      const cStart = colIndexOf("startDate")
                      const cEnd = colIndexOf("endDate")
                      const cPlt = colIndexOf("platform")
                      const cBid = colIndexOf("bidStrategy")
                      const cBuy = colIndexOf("buyType")
                      const cTgt = colIndexOf("creativeTargeting")
                      const cCre = colIndexOf("creative")
                      const cDemo = colIndexOf("buyingDemo")
                      const cMkt = colIndexOf("market")
                      const cRate = colIndexOf("unitRate")
                      const cFixed = colIndexOf("fixedCostMedia")
                      const cClient = colIndexOf("clientPaysForMedia")
                      const cBif = colIndexOf("budgetIncludesFees")

                      const cNoad = colIndexOf("noadserving")

                      return (
                        <tr
                          key={row.id}
                          className={cn(
                            stripe,
                            "transition-colors hover:bg-muted/35 focus-within:bg-muted/35"
                          )}
                          style={stripeStyle}
                        >
                          {showBillingCols ? (
                            <>
                              <td
                                className={stickyTd(cFixed)}
                                style={stickyStyleBody(cFixed)}
                              >
                                <div className="flex min-h-10 items-center justify-center py-1.5">
                                  <Checkbox
                                    id={expertGridCellId(
                                      domGridId,
                                      rowIndex,
                                      cFixed
                                    )}
                                    checked={row.fixedCostMedia}
                                    onCheckedChange={(v) =>
                                      updateRow(rowIndex, {
                                        fixedCostMedia: v === true,
                                      })
                                    }
                                    onFocus={() =>
                                      handleCellFocus(
                                        rowIndex,
                                        "fixedCostMedia"
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        cFixed,
                                        e as KeyboardEvent<HTMLInputElement>
                                      )
                                    }
                                  />
                                </div>
                              </td>
                              <td
                                className={stickyTd(cClient)}
                                style={stickyStyleBody(cClient)}
                              >
                                <div className="flex min-h-10 items-center justify-center py-1.5">
                                  <Checkbox
                                    id={expertGridCellId(
                                      domGridId,
                                      rowIndex,
                                      cClient
                                    )}
                                    checked={row.clientPaysForMedia}
                                    onCheckedChange={(v) =>
                                      updateRow(rowIndex, {
                                        clientPaysForMedia: v === true,
                                      })
                                    }
                                    onFocus={() =>
                                      handleCellFocus(
                                        rowIndex,
                                        "clientPaysForMedia"
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        cClient,
                                        e as KeyboardEvent<HTMLInputElement>
                                      )
                                    }
                                  />
                                </div>
                              </td>
                              <td
                                className={stickyTd(cBif)}
                                style={stickyStyleBody(cBif)}
                              >
                                <div className="flex min-h-10 items-center justify-center py-1.5">
                                  <Checkbox
                                    id={expertGridCellId(
                                      domGridId,
                                      rowIndex,
                                      cBif
                                    )}
                                    checked={row.budgetIncludesFees}
                                    onCheckedChange={(v) =>
                                      updateRow(rowIndex, {
                                        budgetIncludesFees: v === true,
                                      })
                                    }
                                    onFocus={() =>
                                      handleCellFocus(
                                        rowIndex,
                                        "budgetIncludesFees"
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        cBif,
                                        e as KeyboardEvent<HTMLInputElement>
                                      )
                                    }
                                  />
                                </div>
                              </td>
                              <td
                                className={stickyTd(cNoad)}
                                style={stickyStyleBody(cNoad)}
                              >
                                <div className="flex min-h-10 items-center justify-center py-1.5">
                                  <Checkbox
                                    id={expertGridCellId(
                                      domGridId,
                                      rowIndex,
                                      cNoad
                                    )}
                                    checked={row.noadserving}
                                    onCheckedChange={(v) =>
                                      updateRow(rowIndex, {
                                        noadserving: v === true,
                                      })
                                    }
                                    onFocus={() =>
                                      handleCellFocus(
                                        rowIndex,
                                        "noadserving"
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        cNoad,
                                        e as KeyboardEvent<HTMLInputElement>
                                      )
                                    }
                                  />
                                </div>
                              </td>
                            </>
                          ) : null}
                          <td
                            className={stickyTd(cStart)}
                            style={stickyStyleBody(cStart)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cStart
                              )}
                              readOnly
                              tabIndex={-1}
                              title={row.startDate}
                              className="h-8 cursor-default border-0 bg-transparent px-0 text-[11px] tabular-nums text-muted-foreground shadow-none focus-visible:ring-0"
                              value={formatYmdDisplay(row.startDate)}
                            />
                          </td>
                          <td
                            className={stickyTd(cEnd)}
                            style={stickyStyleBody(cEnd)}
                          >
                            <Input
                              id={expertGridCellId(domGridId, rowIndex, cEnd)}
                              readOnly
                              tabIndex={-1}
                              title={row.endDate}
                              className="h-8 cursor-default border-0 bg-transparent px-0 text-[11px] tabular-nums text-muted-foreground shadow-none focus-visible:ring-0"
                              value={formatYmdDisplay(row.endDate)}
                            />
                          </td>
                          <td
                            className={stickyTd(cPlt)}
                            style={stickyStyleBody(cPlt)}
                          >
                            <Combobox
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cPlt
                              )}
                              options={platformComboboxOptions}
                              value={row.platform}
                              onValueChange={(v) =>
                                updateRow(rowIndex, { platform: v })
                              }
                              placeholder="Select"
                              searchPlaceholder="Search platforms…"
                              emptyText={
                                platformNames.length === 0
                                  ? "No platforms."
                                  : "No match."
                              }
                              buttonClassName="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              onTriggerFocus={() =>
                                handleCellFocus(rowIndex, "platform")
                              }
                              onOpenChange={(open) => {
                                if (open) {
                                  handleCellFocus(rowIndex, "platform")
                                } else {
                                  tryFuzzyMatch(
                                    rowIndex,
                                    "platform",
                                    row.platform
                                  )
                                }
                              }}
                            />
                          </td>
                          <td
                            className={stickyTd(cBid)}
                            style={stickyStyleBody(cBid)}
                          >
                            <Combobox
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cBid
                              )}
                              options={PROGDISPLAY_BID_STRATEGY_OPTIONS}
                              value={row.bidStrategy}
                              onValueChange={(v) =>
                                updateRow(rowIndex, { bidStrategy: v })
                              }
                              placeholder="Select"
                              searchPlaceholder="Search bid strategies…"
                              buttonClassName="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              onTriggerFocus={() =>
                                handleCellFocus(rowIndex, "bidStrategy")
                              }
                              onOpenChange={(open) => {
                                if (open) {
                                  handleCellFocus(rowIndex, "bidStrategy")
                                }
                              }}
                            />
                          </td>
                          <td
                            className={stickyTd(cBuy)}
                            style={stickyStyleBody(cBuy)}
                          >
                            <Combobox
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cBuy
                              )}
                              options={PROGDISPLAY_BUY_TYPE_OPTIONS}
                              value={row.buyType}
                              onValueChange={(v) =>
                                updateRow(rowIndex, { buyType: v })
                              }
                              placeholder="Select"
                              searchPlaceholder="Search buy types…"
                              buttonClassName="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              onTriggerFocus={() =>
                                handleCellFocus(rowIndex, "buyType")
                              }
                              onOpenChange={(open) => {
                                if (open) {
                                  handleCellFocus(rowIndex, "buyType")
                                }
                              }}
                            />
                          </td>
                          <td
                            className={stickyTd(cTgt)}
                            style={stickyStyleBody(cTgt)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cTgt
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.creativeTargeting}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "creativeTargeting")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cTgt, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  creativeTargeting: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cCre)}
                            style={stickyStyleBody(cCre)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cCre
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.creative}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "creative")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cCre, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  creative: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cMkt)}
                            style={stickyStyleBody(cMkt)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cMkt
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.market}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "market")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cMkt, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, { market: e.target.value })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cDemo)}
                            style={stickyStyleBody(cDemo)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cDemo
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              value={row.buyingDemo}
                              onFocus={() =>
                                handleCellFocus(rowIndex, "buyingDemo")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cDemo, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  buyingDemo: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(cRate)}
                            style={stickyStyleBody(cRate)}
                          >
                            <Input
                              id={expertGridCellId(
                                domGridId,
                                rowIndex,
                                cRate
                              )}
                              className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                              inputMode="decimal"
                              value={
                                row.unitRate === "" ||
                                row.unitRate === undefined
                                  ? ""
                                  : String(row.unitRate)
                              }
                              onFocus={() =>
                                handleCellFocus(rowIndex, "unitRate")
                              }
                              onKeyDown={(e) =>
                                handleGridInputKeyDown(rowIndex, cRate, e)
                              }
                              onChange={(e) =>
                                updateRow(rowIndex, {
                                  unitRate: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td
                            className={stickyTd(grossCol)}
                            style={stickyStyleBody(grossCol)}
                          >
                            <div
                              className="flex h-8 items-center px-1 text-xs tabular-nums"
                              title={netMediaTooltip}
                            >
                              {formatCurrencyFull(net, moneyOpts)}
                            </div>
                          </td>
                          <td
                            className={cn(stickyTd(actionsCol), "text-center")}
                            style={stickyStyleBody(actionsCol)}
                          >
                            <div className="flex justify-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => duplicateRow(rowIndex)}
                                aria-label="Duplicate row"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                                onClick={() => deleteRow(rowIndex)}
                                disabled={normalizedRows.length <= 1}
                                aria-label="Delete row"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                          <td
                            className={cn(
                              stickyTd(sigmaCol),
                              "text-muted-foreground",
                              PROGDISPLAY_EXPERT_WEEK_SCROLLER_EDGE
                            )}
                            style={stickyStyleBody(sigmaCol)}
                          >
                            <div
                              className="flex h-8 items-center justify-end px-1 text-xs tabular-nums"
                              title="Row subtotal: sum of weekly quantities"
                            >
                              {qtySum === 0
                                ? "—"
                                : qtySum.toLocaleString(undefined, {
                                    maximumFractionDigits: 2,
                                  })}
                            </div>
                          </td>
                          {(() => {
                            const renderedWeekCells: React.ReactNode[] = []
                            const rowMergeMap = rowMergeMaps[rowIndex]
                            for (let wi = 0; wi < weekColumns.length; wi += 1) {
                              const col = weekColumns[wi]!
                              const cell = row.weeklyValues[col.weekKey]
                              const interiorSpanId =
                                rowMergeMap?.interiorByWeekKey[col.weekKey]
                              if (interiorSpanId) {
                                // Interior weeks are owned by the anchor td via colSpan.
                                continue
                              }
                              const anchorSpanId =
                                rowMergeMap?.anchorByWeekKey[col.weekKey]
                              const mSpan = anchorSpanId
                                ? rowMergeMap?.spanById[anchorSpanId] ?? null
                                : null
                              const spanMeta = anchorSpanId
                                ? rowMergeMap?.spanMetaByAnchorWeekKey[col.weekKey]
                                : null
                              const spanKeys = spanMeta
                                ? [...spanMeta.weekKeysIncluded]
                                : [col.weekKey]
                              const spanLen = Math.max(1, spanMeta?.spanLength ?? 1)
                              const display = weeklyCellDisplayValue(cell, mSpan)
                              const colIndex =
                                progDisplayDescriptorKeys.length +
                                WEEK_GRID_COL_OFFSET +
                                wi
                              const multiHighlight = spanKeys.some(
                                (key) =>
                                  weekMultiSelect?.rowIndex === rowIndex &&
                                  weekMultiSelect.keys.includes(key)
                              )
                              const weekQtyVisual = mSpan
                                ? Number.isFinite(mSpan.totalQty) && mSpan.totalQty !== 0
                                : (() => {
                                    const v = row.weeklyValues[col.weekKey]
                                    if (v === "" || v === undefined || v === null)
                                      return false
                                    return (
                                      Number.isFinite(parseNum(v)) && parseNum(v) !== 0
                                    )
                                  })()
                              const mergeReadyOnCell = spanKeys.some(
                                (key) =>
                                  mergeTarget !== null &&
                                  mergeTarget.rowIndex === rowIndex &&
                                  mergeTarget.keys.includes(key)
                              )
                              const stripOutlineRow =
                                !weekRectSelection &&
                                weekStripSelection !== null &&
                                weekStripSelection.rowIndex === rowIndex
                                  ? weekStripSelection.rowIndex
                                  : null
                              const rangeOutline = tvWeekRangeOutlineFlags(
                                rowIndex,
                                wi,
                                weekRectSelection,
                                stripOutlineRow,
                                weekKeys
                              )
                              const mergeReadyOutline = oohMergeReadyOutlineFlags(
                                rowIndex,
                                wi,
                                mergeTarget,
                                mergeWeeksReady,
                                weekKeys
                              )
                              const inRectPasteBand = Boolean(
                                weekRectSelection && rangeOutline.inRange
                              )
                              const inStripPasteBand = Boolean(
                                !weekRectSelection &&
                                  weekStripSelection &&
                                  rangeOutline.inRange
                              )
                              const inMergePulseHighlight = spanKeys.some(
                                (key) =>
                                  tvWeekCellInMergePulseHighlight(
                                    rowIndex,
                                    key,
                                    mergeSpanHighlightPulse,
                                    weekKeys
                                  )
                              )
                              const isMergedAnchorCell = Boolean(mSpan)
                              const showMergeContextTrigger =
                                mergeWeeksReady &&
                                mergeTarget !== null &&
                                mergeTarget.rowIndex === rowIndex &&
                                !isMergedAnchorCell &&
                                col.weekKey ===
                                  mergeTarget.keys[mergeTarget.keys.length - 1]!
                              const isActiveWeekCell =
                                focusedCell?.rowIndex === rowIndex &&
                                focusedCell.columnKey === col.weekKey
                              const isSingleDraggableCell =
                                !isMergedAnchorCell && weekQtyVisual
                              const isMergedDraggableCell = isMergedAnchorCell
                              const isDraggableWeekCell =
                                (isSingleDraggableCell || isMergedDraggableCell) &&
                                display.trim() !== ""
                              const isRangeOutlined = rangeOutline.inRange
                              const isDragDropTargetCell =
                                weekDragOver?.rowIndex === rowIndex &&
                                weekDragOver.weekKey === col.weekKey
                              const isDragDropTargetValid = Boolean(
                                isDragDropTargetCell && weekDragOver?.valid
                              )
                              const isSelectionHighlighted =
                                isRangeOutlined ||
                                inRectPasteBand ||
                                inStripPasteBand ||
                                multiHighlight ||
                                mergeReadyOnCell ||
                                inMergePulseHighlight
                              const isInMultiSelection = Boolean(
                                multiCellSelection &&
                                  rowIndex >= multiCellSelection.startRow &&
                                  rowIndex <= multiCellSelection.endRow &&
                                  wi >= multiCellSelection.startCol &&
                                  wi <= multiCellSelection.endCol
                              )
                              const isInCopiedSelection = Boolean(
                                copiedCells &&
                                  rowIndex >= copiedCells.selection.startRow &&
                                  rowIndex <= copiedCells.selection.endRow &&
                                  wi >= copiedCells.selection.startCol &&
                                  wi <= copiedCells.selection.endCol
                              )
                              const isEmptyWeekCell = !weekQtyVisual && !isMergedAnchorCell
                              const isPopulatedNonMergedCell =
                                weekQtyVisual &&
                                !isMergedAnchorCell &&
                                !isSelectionHighlighted
                              const isFocusVisible = isActiveWeekCell
                              const tdClassName = cn(
                                "border-b border-r p-0 align-middle",
                                // Base states (empty / populated non-merged / merged anchor via wrapper).
                                isEmptyWeekCell && "bg-inherit",
                                isPopulatedNonMergedCell &&
                                  PROGDISPLAY_WEEK_CELL_VISUAL_CLASSES.populatedSingleTd,
                                // Selection overlays remain readable above base fills.
                                !isMergedAnchorCell &&
                                  inRectPasteBand &&
                                  "bg-primary/[0.14] dark:bg-primary/12",
                                !isMergedAnchorCell &&
                                  inStripPasteBand &&
                                  "bg-emerald-500/[0.13] dark:bg-emerald-500/[0.1]",
                                !isMergedAnchorCell &&
                                  inMergePulseHighlight &&
                                  "z-[5] bg-fuchsia-500/16 ring-2 ring-inset ring-fuchsia-600/55 dark:bg-fuchsia-500/12 dark:ring-fuchsia-400/50",
                                !isMergedAnchorCell &&
                                  multiHighlight &&
                                  !isRangeOutlined &&
                                  "bg-primary/10 ring-1 ring-inset ring-primary/40",
                                !isMergedAnchorCell &&
                                  isInMultiSelection &&
                                  "ring-2 ring-blue-500 ring-inset bg-blue-100/50 dark:bg-blue-900/30",
                                !isMergedAnchorCell &&
                                  isInCopiedSelection &&
                                  "ring-2 ring-dashed ring-green-500 animate-pulse",
                                !isMergedAnchorCell &&
                                  mergeReadyOnCell &&
                                  "progdisplay-expert-week-cell--merge-ready z-[6] bg-amber-500/24 ring-2 ring-inset ring-amber-600/75 shadow-sm dark:bg-amber-500/20 dark:ring-amber-400/70",
                                isDragDropTargetValid &&
                                  "z-[6] ring-2 ring-inset ring-sky-500/55 bg-sky-500/10 dark:ring-sky-400/55 dark:bg-sky-500/10",
                                isDragDropTargetCell &&
                                  !isDragDropTargetValid &&
                                  "z-[6] ring-1 ring-inset ring-destructive/55 bg-destructive/8",
                                isMergedAnchorCell && "bg-transparent overflow-hidden",
                                isDraggableWeekCell && "cursor-grab",
                                isDragDropTargetCell &&
                                  !isDragDropTargetValid &&
                                  "cursor-not-allowed",
                                tvWeekOutlineEdgeClasses(rangeOutline),
                                !isMergedAnchorCell &&
                                  oohMergeReadyOutlineEdgeClasses(mergeReadyOutline),
                                // Focus wins visual priority.
                                isFocusVisible &&
                                  !isMergedAnchorCell &&
                                  !mergeReadyOnCell &&
                                  "z-[6] ring-2 ring-primary ring-offset-1 ring-offset-background shadow-md"
                              )
                              const mergedAnchorWrapperClassName = cn(
                                !isMergedAnchorCell &&
                                  "relative flex h-full min-h-8 w-full items-center",
                                isMergedAnchorCell &&
                                  PROGDISPLAY_WEEK_CELL_VISUAL_CLASSES.mergedSurface,
                                isMergedAnchorCell && "cursor-pointer",
                                isDragDropTargetCell &&
                                  !isDragDropTargetValid &&
                                  "cursor-not-allowed"
                              )
                              const inputClassName = cn(
                                "box-border w-full min-w-0 max-w-full rounded-none border-0 text-center text-[11px] tabular-nums shadow-none transition-colors duration-150",
                                isMergedAnchorCell
                                  ? PROGDISPLAY_WEEK_CELL_VISUAL_CLASSES.mergedInput
                                  : "h-8 px-0.5 bg-transparent",
                                !isMergedAnchorCell && "focus-visible:ring-2 focus-visible:ring-offset-0",
                                mergeReadyOnCell
                                  ? "focus-visible:ring-amber-600/70 dark:focus-visible:ring-amber-400/70"
                                  : !isMergedAnchorCell &&
                                      "focus-visible:ring-primary/55",
                                isMergedAnchorCell &&
                                  "absolute inset-0 z-[1] max-h-none",
                                isFocusVisible &&
                                  !isMergedAnchorCell &&
                                  !mergeReadyOnCell &&
                                  "bg-background/50 dark:bg-background/35",
                                weekQtyVisual &&
                                  !isMergedAnchorCell &&
                                  "text-foreground font-medium",
                                weekQtyVisual &&
                                  isMergedAnchorCell &&
                                  "text-violet-950 dark:text-violet-100"
                              )
                              renderedWeekCells.push(
                                <td
                                  key={`${row.id}-${col.weekKey}`}
                                  colSpan={spanLen}
                                  style={
                                    isMergedAnchorCell
                                      ? {
                                          width: PROGDISPLAY_EXPERT_WEEK_COL_WIDTH_PX * spanLen,
                                          minWidth:
                                            PROGDISPLAY_EXPERT_WEEK_COL_WIDTH_PX * spanLen,
                                          maxWidth:
                                            PROGDISPLAY_EXPERT_WEEK_COL_WIDTH_PX * spanLen,
                                          boxSizing: "border-box",
                                        }
                                      : progDisplayExpertWeekColLayoutStyle
                                  }
                                  className={tdClassName}
                                  title={
                                    isMergedAnchorCell
                                      ? "Drag to move merged burst"
                                      : isSingleDraggableCell
                                        ? "Drag to move deliverable"
                                        : weekDragSource
                                          ? "Merged interior — drop on anchor or empty week"
                                          : undefined
                                  }
                                  onMouseEnter={(e) => {
                                    if (!isSelecting) return
                                    if ((e.buttons & 1) === 0) return
                                    const drag = weekAreaDragRef.current
                                    if (!drag) return
                                    if (isMergedAnchorCell) return
                                    const next = normalizeProgDisplayWeekRect(
                                      drag.rowIndex,
                                      drag.weekKey,
                                      rowIndex,
                                      col.weekKey,
                                      weekKeys
                                    )
                                    lastDragRectDuringGestureRef.current = next
                                    setWeekRectSelection(next)
                                    setWeekMultiSelect(null)
                                    setWeekStripSelection(null)
                                    if (DEBUG_PROGDISPLAY_MERGE) {
                                      console.debug("[Programmatic Display merge] drag update", {
                                        rect: next,
                                      })
                                    }
                                  }}
                                  onDragOver={(e) => {
                                    if (!weekDragSource) return
                                    const verdict = validateWeekDropTarget(
                                      weekDragSource,
                                      rowIndex,
                                      col.weekKey
                                    )
                                    if (!verdict.ok) {
                                      setWeekDragOver({
                                        rowIndex,
                                        weekKey: col.weekKey,
                                        valid: false,
                                      })
                                      return
                                    }
                                    e.preventDefault()
                                    e.dataTransfer.dropEffect = "move"
                                    setWeekDragOver({
                                      rowIndex,
                                      weekKey: col.weekKey,
                                      valid: true,
                                    })
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault()
                                    const drag = weekDragSource
                                    if (!drag) return
                                    const verdict = validateWeekDropTarget(
                                      drag,
                                      rowIndex,
                                      col.weekKey
                                    )
                                    if (!verdict.ok) {
                                      clearWeekDragUiState()
                                      if (verdict.reason) {
                                        toast({
                                          variant: "destructive",
                                          title: "Invalid drop target",
                                          description: verdict.reason,
                                        })
                                      }
                                      return
                                    }

                                    const nextRows = normalizedRows.map((r) => ({
                                      ...r,
                                      weeklyValues: { ...r.weeklyValues },
                                      mergedWeekSpans: [...(r.mergedWeekSpans ?? [])],
                                    }))
                                    if (drag.type === "single") {
                                      if (
                                        drag.rowIndex === rowIndex &&
                                        drag.weekKey === col.weekKey
                                      ) {
                                        clearWeekDragUiState()
                                        return
                                      }
                                      const srcRow = nextRows[drag.rowIndex]
                                      const dstRow = nextRows[rowIndex]
                                      if (!srcRow || !dstRow) {
                                        clearWeekDragUiState()
                                        return
                                      }
                                      srcRow.weeklyValues[drag.weekKey] = ""
                                      dstRow.weeklyValues[col.weekKey] = drag.value
                                      pushRows(nextRows)
                                      clearWeekDragUiState()
                                      return
                                    }

                                    const targetStartIdx = weekKeys.indexOf(col.weekKey)
                                    if (targetStartIdx < 0) {
                                      clearWeekDragUiState()
                                      return
                                    }
                                    const targetEndIdx =
                                      targetStartIdx + drag.spanLength - 1
                                    if (targetEndIdx >= weekKeys.length) {
                                      clearWeekDragUiState()
                                      return
                                    }
                                    const newStartWeekKey = weekKeys[targetStartIdx]!
                                    const newEndWeekKey = weekKeys[targetEndIdx]!
                                    const sourceRow = nextRows[drag.rowIndex]
                                    const targetRow = nextRows[rowIndex]
                                    if (!sourceRow || !targetRow) {
                                      clearWeekDragUiState()
                                      return
                                    }
                                    sourceRow.mergedWeekSpans = (
                                      sourceRow.mergedWeekSpans ?? []
                                    ).filter((sp) => sp.id !== drag.spanId)
                                    for (const k of weekKeysInSpanInclusive(
                                      weekKeys,
                                      drag.startWeekKey,
                                      drag.endWeekKey
                                    )) {
                                      sourceRow.weeklyValues[k] = ""
                                    }
                                    for (const k of weekKeysInSpanInclusive(
                                      weekKeys,
                                      newStartWeekKey,
                                      newEndWeekKey
                                    )) {
                                      targetRow.weeklyValues[k] = ""
                                    }
                                    targetRow.mergedWeekSpans = [
                                      ...(targetRow.mergedWeekSpans ?? []),
                                      {
                                        id: drag.spanId,
                                        startWeekKey: newStartWeekKey,
                                        endWeekKey: newEndWeekKey,
                                        totalQty: drag.totalQty,
                                      },
                                    ]
                                    pushRows(nextRows)
                                    clearWeekDragUiState()
                                  }}
                                >
                                  <div
                                    className={mergedAnchorWrapperClassName}
                                    onMouseDown={(e) => {
                                      if (!isMergedAnchorCell) return
                                      if (e.button !== 0) return
                                      focusMergedAnchorEditSurface(
                                        rowIndex,
                                        col.weekKey,
                                        e
                                      )
                                    }}
                                    onClick={(e) => {
                                      if (!isMergedAnchorCell) return
                                      if (
                                        e.target instanceof HTMLElement &&
                                        e.target.closest("button")
                                      ) {
                                        return
                                      }
                                      focusMergedAnchorEditSurface(
                                        rowIndex,
                                        col.weekKey,
                                        e
                                      )
                                    }}
                                    onDoubleClick={(e) => {
                                      if (!isMergedAnchorCell) return
                                      focusMergedAnchorEditSurface(
                                        rowIndex,
                                        col.weekKey,
                                        e
                                      )
                                    }}
                                  >
                                    <Input
                                      ref={(el) => {
                                        const refKey = `${rowIndex}:${col.weekKey}`
                                        if (isMergedAnchorCell) {
                                          mergedAnchorInputRefs.current[refKey] = el
                                          return
                                        }
                                        delete mergedAnchorInputRefs.current[refKey]
                                      }}
                                      id={expertGridCellId(
                                        domGridId,
                                        rowIndex,
                                        colIndex
                                      )}
                                      className={cn(
                                        inputClassName,
                                        isMergedAnchorCell &&
                                          "bg-transparent shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                      )}
                                      inputMode="decimal"
                                      value={display}
                                      draggable={isDraggableWeekCell}
                                      onDragStart={(e) => {
                                        // resolveWeekDragSource returns the "merged" variant when called on a
                                        // merged anchor cell, so the same path serves both single and merged drags.
                                        const source = resolveWeekDragSource(
                                          rowIndex,
                                          col.weekKey
                                        )
                                        if (!source) {
                                          e.preventDefault()
                                          return
                                        }
                                        e.dataTransfer.effectAllowed = "move"
                                        e.dataTransfer.setData(
                                          "text/plain",
                                          `${source.rowIndex}:${source.weekKey}`
                                        )
                                        setWeekDragSource(source)
                                        setWeekDragOver(null)
                                      }}
                                      onDragEnd={() => {
                                        clearWeekDragUiState()
                                      }}
                                      onMouseDown={(e) => {
                                      if (isMergedAnchorCell) {
                                        // Merged anchors never start drag-select: edit surface only.
                                        e.stopPropagation()
                                        return
                                      }
                                      if (
                                        e.button !== 0 ||
                                        e.ctrlKey ||
                                        e.metaKey ||
                                        e.shiftKey
                                      ) {
                                        return
                                      }
                                      const currentRect = weekRectSelectionRef.current
                                      const currentMulti = weekMultiSelectRef.current
                                      if (
                                        weekPlainClickPreservesWeekAreaSelection(
                                          rowIndex,
                                          col.weekKey,
                                          currentRect,
                                          currentMulti,
                                          weekKeys
                                        )
                                      ) {
                                        return
                                      }
                                      weekAreaDragRef.current = {
                                        rowIndex,
                                        weekKey: col.weekKey,
                                      }
                                      setIsSelecting(true)
                                      if (DEBUG_PROGDISPLAY_MERGE) {
                                        console.debug("[Programmatic Display merge] drag start", {
                                          rowIndex,
                                          weekKey: col.weekKey,
                                        })
                                      }
                                      clearPendingMergeSelection(
                                        "brand new incompatible selection"
                                      )
                                    }}
                                      onClick={(e) => {
                                      if (isMergedAnchorCell) {
                                        focusMergedAnchorEditSurface(
                                          rowIndex,
                                          col.weekKey,
                                          e
                                        )
                                        return
                                      }
                                      const prevSel = weekMultiSelectRef.current
                                      if (
                                        prevSel &&
                                        prevSel.rowIndex !== rowIndex
                                      ) {
                                        setWeekMultiSelect(null)
                                        setWeekRectSelection(null)
                                      }
                                      const ctrl = e.ctrlKey || e.metaKey
                                      const shift = e.shiftKey

                                      if (ctrl || shift) {
                                        postDragWeekClickRectRef.current = null
                                      } else {
                                        const postDragRect =
                                          postDragWeekClickRectRef.current
                                        if (postDragRect) {
                                          postDragWeekClickRectRef.current = null
                                          if (
                                            progDisplayWeekCellInRect(
                                              rowIndex,
                                              col.weekKey,
                                              postDragRect,
                                              weekKeys
                                            )
                                          ) {
                                            lastWeekAnchorRef.current = {
                                              rowIndex,
                                              weekKey: col.weekKey,
                                            }
                                            setWeekStripSelection(null)
                                            return
                                          }
                                        }
                                      }

                                      if (ctrl) {
                                        e.preventDefault()
                                        const pending = pendingMergeSelection
                                        if (
                                          pending &&
                                          pending.keys.length >= 2 &&
                                          pending.rowIndex !== rowIndex
                                        ) {
                                          clearPendingMergeSelection(
                                            "brand new incompatible selection"
                                          )
                                        }
                                        toggleWeekMultiSelect(
                                          rowIndex,
                                          col.weekKey
                                        )
                                        return
                                      }
                                      if (shift && lastWeekAnchorRef.current) {
                                        e.preventDefault()
                                        if (
                                          lastWeekAnchorRef.current.rowIndex ===
                                          rowIndex
                                        ) {
                                          // Same row — single-row range (existing behavior)
                                          rangeWeekMultiSelect(
                                            rowIndex,
                                            lastWeekAnchorRef.current.weekKey,
                                            col.weekKey
                                          )
                                        } else {
                                          // Cross-row — create a multi-row rectangle selection
                                          const rect = normalizeProgDisplayWeekRect(
                                            lastWeekAnchorRef.current.rowIndex,
                                            lastWeekAnchorRef.current.weekKey,
                                            rowIndex,
                                            col.weekKey,
                                            weekKeys
                                          )
                                          setWeekRectSelection(rect)
                                          setWeekMultiSelect(null)
                                          setWeekStripSelection(null)
                                          clearPendingMergeSelection(
                                            "cross-row shift-click selection"
                                          )
                                        }
                                        return
                                      }
                                      lastWeekAnchorRef.current = {
                                        rowIndex,
                                        weekKey: col.weekKey,
                                      }
                                      if (!shift && !isMergedAnchorCell) {
                                        if (
                                          weekPlainClickPreservesWeekAreaSelection(
                                            rowIndex,
                                            col.weekKey,
                                            weekRectSelectionRef.current,
                                            weekMultiSelectRef.current,
                                            weekKeys
                                          )
                                        ) {
                                          setWeekStripSelection(null)
                                          return
                                        }
                                        clearPendingMergeSelection(
                                          "brand new incompatible selection"
                                        )
                                        setWeekMultiSelect(null)
                                        setWeekRectSelection(
                                          normalizeProgDisplayWeekRect(
                                            rowIndex,
                                            col.weekKey,
                                            rowIndex,
                                            col.weekKey,
                                            weekKeys
                                          )
                                        )
                                      }
                                      setWeekStripSelection(null)
                                    }}
                                      onFocus={() => {
                                      if (isMergedAnchorCell) {
                                        clearWeekSelectionWhereMergedAnchorInvolved(
                                          rowIndex,
                                          col.weekKey
                                        )
                                      }
                                      if (
                                        weekStripSelection &&
                                        weekStripSelection.rowIndex !== rowIndex
                                      ) {
                                        setWeekStripSelection(null)
                                      }
                                      // Non-merged: week area selection is not cleared on focus alone.
                                      handleCellFocus(rowIndex, col.weekKey)
                                    }}
                                      onKeyDown={(e) => {
                                      // Delete/Backspace can clear qty, but must never unmerge.
                                      if (
                                        isMergedAnchorCell &&
                                        (e.key === "Delete" || e.key === "Backspace")
                                      ) {
                                        // Intentionally allow native input editing path.
                                      }
                                      if (
                                        (e.ctrlKey || e.metaKey) &&
                                        e.key.toLowerCase() === "a"
                                      ) {
                                        e.preventDefault()
                                        if (isMergedAnchorCell) {
                                          return
                                        }
                                        setWeekStripSelection({ rowIndex })
                                        setWeekMultiSelect(null)
                                        setWeekRectSelection(null)
                                        clearPendingMergeSelection(
                                          "brand new incompatible selection"
                                        )
                                        return
                                      }
                                      if (
                                        (e.ctrlKey || e.metaKey) &&
                                        e.key.toLowerCase() === "m"
                                      ) {
                                        e.preventDefault()
                                        if (mergeWeeksReady) {
                                          handleMergeSelectedWeeks()
                                        }
                                        return
                                      }
                                      if (e.key === "Escape") {
                                        // Escape is an explicit user reset for all transient selection state.
                                        resetTransientWeekUiState()
                                      }
                                      handleGridInputKeyDown(
                                        rowIndex,
                                        colIndex,
                                        e
                                      )
                                    }}
                                      onChange={(e) =>
                                        updateWeeklyCell(
                                          rowIndex,
                                          col.weekKey,
                                          e.target.value
                                        )
                                      }
                                    />
                                    {mSpan ? (
                                      <button
                                        type="button"
                                        className="pointer-events-auto absolute right-1 top-1 z-[60] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-600/70 bg-red-100 text-red-800 shadow-md transition-colors hover:border-red-700 hover:bg-red-600 hover:text-white dark:border-red-400/70 dark:bg-red-500/28 dark:text-red-200 dark:hover:border-red-300 dark:hover:bg-red-500 dark:hover:text-white"
                                        aria-label="Unmerge weeks"
                                        title="Unmerge weeks"
                                        onMouseDown={(e) => {
                                          // Unmerge is X-only; never pass through to cell/input handlers.
                                          e.preventDefault()
                                          e.stopPropagation()
                                        }}
                                        onPointerDown={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                        }}
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          unmergeWeekSpan(rowIndex, mSpan.id)
                                        }}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    ) : null}
                                    {showMergeContextTrigger ? (
                                      <button
                                        type="button"
                                        className="pointer-events-auto absolute right-0 top-0 z-[70] flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background/95 shadow-md transition-colors hover:bg-muted"
                                        aria-label="Merge selected weeks into one burst"
                                        title="Merge selected weeks into one burst"
                                        onMouseDown={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                        }}
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          handleMergeSelectedWeeks()
                                        }}
                                      >
                                        <GitMerge className="h-3.5 w-3.5" />
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              )
                              wi += spanLen - 1
                            }
                            return renderedWeekCells
                          })()}
                        </tr>
                      )
                    })}
                    <tr
                      className="border-t-2 border-solid font-medium"
                      style={mediaTypeTotalsRowStyle(MEDIA_ACCENT_HEX)}
                    >
                      <td
                        className={stickyTd(0)}
                        style={{
                          ...stickyStyleBodyDescriptorTotalLabel,
                          ...progDisplayExpertTotalsRowBgStyle,
                        }}
                        colSpan={progDisplayDescriptorKeys.length}
                      >
                        <div className="flex h-8 items-center px-1">
                          <span
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: MEDIA_ACCENT_HEX }}
                          >
                            Weekly totals
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          stickyTd(progDisplayDescriptorKeys.length),
                          "h-8 px-1 text-xs tabular-nums"
                        )}
                        style={{
                          ...stickyStyleBody(progDisplayDescriptorKeys.length),
                          ...progDisplayExpertTotalsRowBgStyle,
                        }}
                      >
                        <div className="flex h-full items-center">
                          {formatCurrencyFull(containerTotals.sumNet, moneyOpts)}
                        </div>
                      </td>
                      <td
                        className={cn(
                          stickyTd(progDisplayDescriptorKeys.length + 1),
                          "h-8"
                        )}
                        style={{
                          ...stickyStyleBody(progDisplayDescriptorKeys.length + 1),
                          ...progDisplayExpertTotalsRowBgStyle,
                        }}
                      />
                      <td
                        className={cn(
                          stickyTd(progDisplayDescriptorKeys.length + 2),
                          "h-8 px-1 text-xs tabular-nums text-muted-foreground",
                          PROGDISPLAY_EXPERT_WEEK_SCROLLER_EDGE
                        )}
                        style={{
                          ...stickyStyleBody(progDisplayDescriptorKeys.length + 2),
                          ...progDisplayExpertTotalsRowBgStyle,
                        }}
                      >
                        <div className="flex h-full items-center justify-end">
                          {containerTotals.sumQty === 0
                            ? "—"
                            : containerTotals.sumQty.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}
                        </div>
                      </td>
                      {weekColumns.map((col) => (
                        <td
                          key={`t-${col.weekKey}`}
                          style={{
                            ...progDisplayExpertWeekColLayoutStyle,
                            ...progDisplayExpertTotalsRowBgStyle,
                          }}
                          className="h-8 border-b border-r px-0.5 text-center text-xs tabular-nums align-middle"
                        >
                          <div className="flex h-full items-center justify-center">
                            {containerTotals.perWeek[col.weekKey] === 0
                              ? "—"
                              : containerTotals.perWeek[col.weekKey].toLocaleString(
                                  undefined,
                                  { maximumFractionDigits: 2 }
                                )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {normalizedRows.length > 0 ? (
          <div
            className="rounded-lg border border-border/80 bg-muted/15 px-3 py-2.5 shadow-sm"
            style={{
              borderLeftWidth: 3,
              borderLeftColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.45),
            }}
          >
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-baseline gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs shadow-sm">
                <span className="text-muted-foreground">Total Deliverables</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {containerTotals.sumQty.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
              </span>
              <span className="inline-flex items-baseline gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs shadow-sm">
                <span className="text-muted-foreground">Net media</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrencyFull(containerTotals.sumNet, moneyOpts)}
                </span>
              </span>
              <span className="inline-flex items-baseline gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs shadow-sm">
                <span className="text-muted-foreground">
                  Fees ({feeprogdisplay}% on net)
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrencyFull(containerTotals.fee, moneyOpts)}
                </span>
              </span>
              <span
                className="inline-flex items-baseline gap-2 rounded-full border px-3 py-1 text-xs shadow-sm"
                style={{
                  borderColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.35),
                  backgroundColor: rgbaFromHex(MEDIA_ACCENT_HEX, 0.08),
                }}
              >
                <span className="text-muted-foreground">Total w/ fees</span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: MEDIA_ACCENT_HEX }}
                >
                  {formatCurrencyFull(containerTotals.totalWithFee, moneyOpts)}
                </span>
              </span>
            </div>
          </div>
          ) : null}
        </CardContent>
          </div>
        </div>
        {DEBUG_PROGDISPLAY_MERGE ? (
          <div className="pointer-events-none absolute bottom-2 right-2 z-50 max-w-[360px] rounded-md border bg-background/95 p-2 text-[11px] leading-snug shadow-lg">
            <div className="mb-1 font-medium text-foreground">Social merge debug</div>
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">
{JSON.stringify(
  {
    focusedCell,
    weekRectSelection,
    weekMultiSelect,
    pendingMergeSelection,
    mergeWeeksReady,
    mergeTarget,
  },
  null,
  2
)}
            </pre>
          </div>
        ) : null}
      </Card>

      <AlertDialog
        open={!!pendingFuzzyMatch}
        onOpenChange={(open) => {
          if (!open) setPendingFuzzyMatch(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fuzzy match suggestion</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingFuzzyMatch ? (
                <>
                  Did you mean &quot;{pendingFuzzyMatch.matched}&quot; instead of
                  &quot;{pendingFuzzyMatch.value}&quot;?
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => handleFuzzyMatchConfirm(false)}
            >
              Use once
            </AlertDialogAction>
            <AlertDialogAction
              type="button"
              onClick={() => handleFuzzyMatchConfirm(true)}
            >
              Use &amp; always auto-match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </TooltipProvider>
  )
}
