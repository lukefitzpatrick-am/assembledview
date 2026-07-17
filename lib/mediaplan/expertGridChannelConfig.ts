/**
 * Per-channel descriptor for the shared {@link ExpertGrid}.
 * Columns, buy/bid options, labels, fee wiring, and empty-row factory live here —
 * the grid shell stays channel-agnostic.
 */
import { format, startOfDay } from "date-fns"
import type { ComboboxOption } from "@/components/media-containers/ExpertGridCombobox"
import type { ExpertDailyValues } from "@/lib/mediaplan/expertDayModel"
import type {
  ExpertWeeklyValues,
  OohExpertMergedWeekSpan,
  OohExpertScheduleRow,
  ProgDisplayExpertScheduleRow,
  ProgVideoExpertScheduleRow,
  SearchExpertScheduleRow,
} from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  deriveOohExpertRowScheduleYmdFromRow,
  deriveProgExpertRowScheduleYmdFromRow,
  deriveSearchExpertRowScheduleYmdFromRow,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  exactCanonicalBuyType,
  exactCanonicalFormat,
  fuzzyMatchBuyType,
  fuzzyMatchFormat,
} from "@/lib/mediaplan/expertOohFuzzyMatch"
import type { MediaTypeThemeKey } from "@/lib/mediaplan/mediaTypeAccents"
import type { WeeklyGanttWeekColumn } from "@/lib/utils/weeklyGanttColumns"

export type ExpertGridPublisherField = "platform" | "network"

export type ExpertDescriptorColumnKind =
  | "date-start"
  | "date-end"
  | "combobox-publishers"
  | "combobox-static"
  | "text"
  | "checkbox-billing"
  | "unit-rate"

export type ExpertDescriptorColumn = {
  key: string
  label: string
  widthPx: number
  kind: ExpertDescriptorColumnKind
  /** Static options when kind === "combobox-static" */
  options?: ComboboxOption[]
  /** Clipboard paste normalizer (value/label → stored value). */
  normalizePaste?: (raw: string, ctx: { publisherNames: string[] }) => string
  /** Optional header hover tooltip. */
  headerTooltip?: string
  /** Combobox search box placeholder when kind === "combobox-static". */
  searchPlaceholder?: string
}

/** Structural fields the ExpertGrid shell reads without channel-specific keys. */
export type ExpertScheduleRowCommon = {
  id: string
  startDate: string
  endDate: string
  buyType: string
  unitRate: number | string
  grossCost: number | string
  fixedCostMedia: boolean
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  weeklyValues: ExpertWeeklyValues
  dailyValues?: ExpertDailyValues
  mergedWeekSpans?: OohExpertMergedWeekSpan[]
  sourceLineItemId?: string
}

export type ExpertGridChannelConfig<TRow extends ExpertScheduleRowCommon> = {
  /** Channel id for accents / debug. */
  mediaTypeKey: MediaTypeThemeKey
  /** Human channel name in UI chrome. */
  channelLabel: string
  /** Publisher fuzzy-match field (Search/Prog: platform; OOH: network). */
  publisherField: ExpertGridPublisherField
  billingFlagKeys: readonly string[]
  billingFlagLabels: readonly string[]
  billingFlagWidthsPx: readonly number[]
  descriptorCore: readonly ExpertDescriptorColumn[]
  descriptorTail: readonly ExpertDescriptorColumn[]
  /** Labels after unit rate (computed cols — not stored on the row). */
  trailingHeaderLabels: readonly string[]
  /**
   * Sticky widths for trailing computed cols (Net Media / actions / Σ qty).
   * Included in {@link expertGridDescriptorColWidths} so sticky offsets stay correct.
   */
  trailingColWidthsPx?: readonly number[]
  createEmptyRow: (
    id: string,
    campaignStartDate: Date,
    campaignEndDate: Date,
    weekKeys: string[]
  ) => TRow
  /** Derive line start/end ymd from weekly qty + merges (channel mapper). */
  deriveScheduleYmdFromRow: (
    row: TRow,
    weekColumns: WeeklyGanttWeekColumn[],
    campaignStartDate: Date,
    campaignEndDate: Date,
    dayKeysByWeekKey?: Readonly<Record<string, readonly string[]>>
  ) => { startDate: string; endDate: string }
}

export function getRowString(row: object, key: string): string {
  const v = (row as Record<string, unknown>)[key]
  if (v == null) return ""
  return String(v)
}

export function getRowBoolean(row: object, key: string): boolean {
  return (row as Record<string, unknown>)[key] === true
}

function normalizeOptionPaste(
  raw: string,
  options: ComboboxOption[]
): string {
  const v = raw.trim()
  if (!v) return ""
  const byValue = options.find((o) => o.value.toLowerCase() === v.toLowerCase())
  if (byValue) return byValue.value
  const byLabel = options.find((o) => o.label.toLowerCase() === v.toLowerCase())
  if (byLabel) return byLabel.value
  return v
}

export const SEARCH_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export const SEARCH_BID_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "manual_cpc", label: "Manual CPC" },
  { value: "maximize_conversions", label: "Maximise Conversions" },
  { value: "target_cpa", label: "Target CPA" },
  { value: "target_roas", label: "Target ROAS" },
]

export function createEmptySearchExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): SearchExpertScheduleRow {
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
    unitRate: "",
    grossCost: 0,
    weeklyValues,
    mergedWeekSpans: [],
  }
}

export const SEARCH_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<SearchExpertScheduleRow> =
  {
    mediaTypeKey: "search",
    channelLabel: "Search",
    publisherField: "platform",
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees",
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees",
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      {
        key: "platform",
        label: "Platform",
        widthPx: 120,
        kind: "combobox-publishers",
      },
      {
        key: "bidStrategy",
        label: "Bid Strategy",
        widthPx: 110,
        kind: "combobox-static",
        options: SEARCH_BID_STRATEGY_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, SEARCH_BID_STRATEGY_OPTIONS),
      },
      {
        key: "buyType",
        label: "Buy Type",
        widthPx: 96,
        kind: "combobox-static",
        options: SEARCH_BUY_TYPE_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, SEARCH_BUY_TYPE_OPTIONS),
      },
      {
        key: "creativeTargeting",
        label: "Creative Targeting",
        widthPx: 120,
        kind: "text",
        headerTooltip: "Creative / Keyword Targeting",
      },
      { key: "creative", label: "Creative", widthPx: 110, kind: "text" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
        key: "unitRate",
        label: "Unit Rate",
        widthPx: 88,
        kind: "unit-rate",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptySearchExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveSearchExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

/** Match labels/values on ProgVideoContainer buy-type combobox. */
export const PROGVIDEO_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export const PROGVIDEO_BID_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "completed_views", label: "Completed Views" },
  { value: "reach", label: "Reach" },
  { value: "target_cpa", label: "Target CPA" },
  { value: "viewability", label: "Viewability" },
]

export function createEmptyProgVideoExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): ProgVideoExpertScheduleRow {
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
    placement: "",
    size: "",
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

export const PROGVIDEO_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<ProgVideoExpertScheduleRow> =
  {
    mediaTypeKey: "progvideo",
    channelLabel: "Prog Video",
    publisherField: "platform",
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees",
      "noadserving",
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees",
      "No Ad Serving",
    ],
    billingFlagWidthsPx: [56, 56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      {
        key: "platform",
        label: "Platform",
        widthPx: 120,
        kind: "combobox-publishers",
      },
      {
        key: "bidStrategy",
        label: "Bid Strategy",
        widthPx: 110,
        kind: "combobox-static",
        options: PROGVIDEO_BID_STRATEGY_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, PROGVIDEO_BID_STRATEGY_OPTIONS),
      },
      {
        key: "buyType",
        label: "Buy Type",
        widthPx: 96,
        kind: "combobox-static",
        options: PROGVIDEO_BUY_TYPE_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, PROGVIDEO_BUY_TYPE_OPTIONS),
      },
      {
        key: "creativeTargeting",
        label: "Creative Targeting",
        widthPx: 120,
        kind: "text",
      },
      { key: "placement", label: "Placement", widthPx: 110, kind: "text" },
      { key: "creative", label: "Creative", widthPx: 110, kind: "text" },
      { key: "size", label: "Size", widthPx: 80, kind: "text" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
        key: "unitRate",
        label: "Unit Rate",
        widthPx: 88,
        kind: "unit-rate",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyProgVideoExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveProgExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

/** Match labels/values on Prog Display / Prog OOH buy-type combobox. */
export const PROGDISPLAY_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export const PROGDISPLAY_BID_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "clicks", label: "Clicks" },
  { value: "conversions", label: "Conversions" },
  { value: "reach", label: "Reach" },
  { value: "viewability", label: "Viewability" },
]

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

export const PROGDISPLAY_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<ProgDisplayExpertScheduleRow> =
  {
    mediaTypeKey: "progdisplay",
    channelLabel: "Prog Display",
    publisherField: "platform",
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees",
      "noadserving",
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees",
      "No Ad Serving",
    ],
    billingFlagWidthsPx: [56, 56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      {
        key: "platform",
        label: "Platform",
        widthPx: 120,
        kind: "combobox-publishers",
      },
      {
        key: "bidStrategy",
        label: "Bid Strategy",
        widthPx: 110,
        kind: "combobox-static",
        options: PROGDISPLAY_BID_STRATEGY_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, PROGDISPLAY_BID_STRATEGY_OPTIONS),
      },
      {
        key: "buyType",
        label: "Buy Type",
        widthPx: 96,
        kind: "combobox-static",
        options: PROGDISPLAY_BUY_TYPE_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, PROGDISPLAY_BUY_TYPE_OPTIONS),
      },
      {
        key: "creativeTargeting",
        label: "Creative Targeting",
        widthPx: 120,
        kind: "text",
      },
      { key: "creative", label: "Creative", widthPx: 110, kind: "text" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
        key: "unitRate",
        label: "Unit Rate",
        widthPx: 88,
        kind: "unit-rate",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyProgDisplayExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveProgExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

/** Match labels/values on {@link OOHContainer} comboboxes. */
export const OOH_FORMAT_OPTIONS: ComboboxOption[] = [
  { value: "active", label: "Active" },
  { value: "large_format", label: "Large Format" },
  { value: "other", label: "Other" },
  { value: "retail", label: "Retail" },
  { value: "small_format", label: "Small Format" },
  { value: "street_furniture", label: "Street Furniture" },
  { value: "transit", label: "Transit" },
]

export const OOH_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpm", label: "CPM" },
  { value: "fixed_cost", label: "Fixed Cost" },
  { value: "package", label: "Package" },
  { value: "panels", label: "Panels" },
]

function normalizeOohFormatPaste(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  const fromOpts = normalizeOptionPaste(v, OOH_FORMAT_OPTIONS)
  if (OOH_FORMAT_OPTIONS.some((o) => o.value === fromOpts)) return fromOpts
  const ex = exactCanonicalFormat(v)
  if (ex) return ex
  const fz = fuzzyMatchFormat(v)
  return fz?.matched ?? v
}

function normalizeOohBuyTypePaste(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  const fromOpts = normalizeOptionPaste(v, OOH_BUY_TYPE_OPTIONS)
  if (OOH_BUY_TYPE_OPTIONS.some((o) => o.value === fromOpts)) return fromOpts
  const ex = exactCanonicalBuyType(v)
  if (ex) return ex
  const fz = fuzzyMatchBuyType(v)
  return fz?.matched ?? v
}

export function createEmptyOohExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): OohExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) {
    weeklyValues[k] = ""
  }
  return {
    id,
    market: "",
    network: "",
    format: "",
    type: "",
    placement: "",
    startDate: ymd(campaignStartDate),
    endDate: ymd(campaignEndDate),
    size: "",
    panels: "",
    buyingDemo: "",
    buyType: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: "",
    grossCost: 0,
    weeklyValues,
    mergedWeekSpans: [],
  }
}

export const OOH_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<OohExpertScheduleRow> =
  {
    mediaTypeKey: "ooh",
    channelLabel: "OOH",
    publisherField: "network",
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees",
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees",
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      {
        key: "network",
        label: "Network",
        widthPx: 130,
        kind: "combobox-publishers",
      },
      {
        key: "format",
        label: "Format",
        widthPx: 130,
        kind: "combobox-static",
        options: OOH_FORMAT_OPTIONS,
        searchPlaceholder: "Search formats…",
        normalizePaste: (raw) => normalizeOohFormatPaste(raw),
      },
      {
        key: "buyType",
        label: "Buy Type",
        widthPx: 110,
        kind: "combobox-static",
        options: OOH_BUY_TYPE_OPTIONS,
        searchPlaceholder: "Search buy types…",
        normalizePaste: (raw) => normalizeOohBuyTypePaste(raw),
      },
      { key: "placement", label: "Placement", widthPx: 120, kind: "text" },
      { key: "type", label: "Type", widthPx: 96, kind: "text" },
      { key: "size", label: "Size", widthPx: 96, kind: "text" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 120, kind: "text" },
      {
        key: "unitRate",
        label: "Unit Rate",
        widthPx: 88,
        kind: "unit-rate",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    trailingColWidthsPx: [100, 76, 68],
    createEmptyRow: createEmptyOohExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveOohExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

/** Descriptor keys in sticky order (billing optional). */
export function expertGridDescriptorKeys(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>,
  showBillingCols: boolean
): string[] {
  return [
    ...(showBillingCols ? config.billingFlagKeys : []),
    ...config.descriptorCore.map((c) => c.key),
    ...config.descriptorTail.map((c) => c.key),
  ]
}

export function expertGridDescriptorColWidths(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>,
  showBillingCols: boolean
): number[] {
  const core = config.descriptorCore.map((c) => c.widthPx)
  const tail = config.descriptorTail.map((c) => c.widthPx)
  const trailing = config.trailingColWidthsPx ?? []
  return showBillingCols
    ? [...config.billingFlagWidthsPx, ...core, ...tail, ...trailing]
    : [...core, ...tail, ...trailing]
}

export function expertGridDescriptorHeadLabels(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>,
  showBillingCols: boolean
): string[] {
  const core = config.descriptorCore.map((c) => c.label)
  const billing = showBillingCols ? [...config.billingFlagLabels] : []
  const tail = [
    ...config.descriptorTail.map((c) => c.label),
    ...config.trailingHeaderLabels,
  ]
  return [...billing, ...core, ...tail]
}

/** Flattened descriptor columns for body/paste (billing as checkbox-billing). */
export function expertGridBodyDescriptorColumns(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>,
  showBillingCols: boolean
): ExpertDescriptorColumn[] {
  const billing: ExpertDescriptorColumn[] = showBillingCols
    ? config.billingFlagKeys.map((key, i) => ({
        key,
        label: config.billingFlagLabels[i] ?? key,
        widthPx: config.billingFlagWidthsPx[i] ?? 56,
        kind: "checkbox-billing" as const,
      }))
    : []
  return [...billing, ...config.descriptorCore, ...config.descriptorTail]
}
