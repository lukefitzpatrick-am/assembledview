/**
 * Per-channel descriptor for the shared {@link ExpertGrid}.
 * Columns, buy/bid options, labels, fee wiring, and empty-row factory live here —
 * the grid shell stays channel-agnostic.
 */
import { format, startOfDay } from "date-fns"
import type { ComboboxOption } from "@/components/media-containers/ExpertGridCombobox"
import type { ExpertDailyValues } from "@/lib/mediaplan/expertDayModel"
import type {
  BvodExpertScheduleRow,
  CinemaExpertScheduleRow,
  DigiVideoExpertScheduleRow,
  DigitalAudioExpertScheduleRow,
  DigitalDisplayExpertScheduleRow,
  ExpertWeeklyValues,
  InfluencersExpertScheduleRow,
  IntegrationExpertScheduleRow,
  MagazinesExpertScheduleRow,
  NewspaperExpertScheduleRow,
  OohExpertMergedWeekSpan,
  OohExpertScheduleRow,
  ProductionExpertScheduleRow,
  ProgAudioExpertScheduleRow,
  ProgBvodExpertScheduleRow,
  ProgDisplayExpertScheduleRow,
  ProgOohExpertScheduleRow,
  ProgVideoExpertScheduleRow,
  RadioExpertScheduleRow,
  SearchExpertScheduleRow,
  SocialMediaExpertScheduleRow,
  TelevisionExpertScheduleRow,
} from "@/lib/mediaplan/expertModeWeeklySchedule"
import {
  deriveBvodExpertRowScheduleYmdFromRow,
  deriveCinemaExpertRowScheduleYmdFromRow,
  deriveDigiVideoExpertRowScheduleYmdFromRow,
  deriveDigitalAudioExpertRowScheduleYmdFromRow,
  deriveDigitalDisplayExpertRowScheduleYmdFromRow,
  deriveInfluencersExpertRowScheduleYmdFromRow,
  deriveIntegrationExpertRowScheduleYmdFromRow,
  deriveMagazineExpertRowScheduleYmdFromRow,
  deriveNewspaperExpertRowScheduleYmdFromRow,
  deriveOohExpertRowScheduleYmdFromRow,
  deriveProductionExpertRowScheduleYmdFromRow,
  deriveProgExpertRowScheduleYmdFromRow,
  deriveRadioExpertRowScheduleYmdFromRow,
  deriveSearchExpertRowScheduleYmdFromRow,
  deriveSocialMediaExpertRowScheduleYmdFromRow,
  deriveTelevisionExpertRowScheduleYmdFromRow,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  exactCanonicalBuyType,
  exactCanonicalFormat,
  fuzzyMatchBuyType,
  fuzzyMatchFormat,
} from "@/lib/mediaplan/expertOohFuzzyMatch"
import type { MediaTypeThemeKey } from "@/lib/mediaplan/mediaTypeAccents"
import type { WeeklyGanttWeekColumn } from "@/lib/utils/weeklyGanttColumns"

export type ExpertGridPublisherField = "platform" | "network" | "publisher"

export type ExpertGridSiteOption = {
  platform?: string | null
  site?: string | null
}

export type ExpertGridStationOption = {
  station?: string | null
  id?: number | string | null
}

export type ExpertGridTitleOption = {
  id: string | number
  title: string
  network: string
}

export type ExpertDescriptorColumnKind =
  | "date-start"
  | "date-end"
  | "combobox-publishers"
  | "combobox-static"
  | "combobox-dynamic"
  | "combobox-sites"
  | "combobox-stations"
  | "combobox-titles"
  | "text"
  | "checkbox-billing"
  | "unit-rate"

/**
 * Where a descriptor field appears. Omit = "both".
 * - `grid` / `card` / `both`: rendered on that surface
 * - `none`: persisted on the expert row only (hydration / round-trip); not shown on grid or card
 */
export type ExpertDescriptorSurface = "grid" | "card" | "both" | "none"

/** True when the field should appear as a sticky ExpertGrid body/header column. */
export function isExpertDescriptorGridSurface(
  surfaces: ExpertDescriptorSurface | undefined
): boolean {
  return surfaces == null || surfaces === "both" || surfaces === "grid"
}

/** True when the field should appear on the ExpertCard field grid. */
export function isExpertDescriptorCardSurface(
  surfaces: ExpertDescriptorSurface | undefined
): boolean {
  return surfaces == null || surfaces === "both" || surfaces === "card"
}

/**
 * Channel option / billing flags shown as checkboxes in the descriptor.
 * SoT for keys+labels; {@link ExpertGridChannelConfig.billingFlagKeys} etc. remain as back-compat mirrors.
 */
export type ExpertOptionFlag = {
  key: string
  label: string
  /** Sticky width in the grid (px). Defaults to 44 when omitted. */
  widthPx?: number
}

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
  /** Combobox search box placeholder when kind === "combobox-static" | "combobox-dynamic". */
  searchPlaceholder?: string
  /**
   * Which surfaces render this field. Default `both`.
   * Grid-only examples: unitRate, trailing Net Media / Σ qty.
   */
  surfaces?: ExpertDescriptorSurface
  /** Optional input placeholder (card/grid editors). */
  placeholder?: string
  /** Card layout span (1 = half, 2 = full). Default 1 when omitted. */
  cardSpan?: 1 | 2
}

/** Structural fields the ExpertGrid shell reads without channel-specific keys. */
export type ExpertScheduleRowCommon = {
  id: string
  startDate: string
  endDate: string
  buyType: string
  unitRate: number | string
  grossCost: number | string
  /** Billing flags — optional for channels with empty `optionFlags` (e.g. Production). */
  fixedCostMedia?: boolean
  clientPaysForMedia?: boolean
  budgetIncludesFees?: boolean
  weeklyValues: ExpertWeeklyValues
  dailyValues?: ExpertDailyValues
  mergedWeekSpans?: OohExpertMergedWeekSpan[]
  sourceLineItemId?: string
}

export type ExpertGridChannelConfig<TRow extends ExpertScheduleRowCommon> = {
  /** Channel id for accents / theme. */
  mediaTypeKey: MediaTypeThemeKey
  /** Human channel name in UI chrome. */
  channelLabel: string
  /** Publisher fuzzy-match field (Search/Prog: platform; OOH: network). */
  publisherField: ExpertGridPublisherField
  /**
   * Channel option / billing flags (SoT). Prefer this over billingFlag* mirrors.
   * Empty = no billing checkboxes (e.g. Production).
   */
  optionFlags: readonly ExpertOptionFlag[]
  /**
   * @deprecated Prefer {@link optionFlags}. Kept in sync for ExpertGrid / callers.
   */
  billingFlagKeys: readonly string[]
  /**
   * @deprecated Prefer {@link optionFlags}. Kept in sync for ExpertGrid / callers.
   */
  billingFlagLabels: readonly string[]
  /**
   * @deprecated Prefer {@link optionFlags} `.widthPx`. Kept in sync for ExpertGrid / callers.
   */
  billingFlagWidthsPx: readonly number[]
  descriptorCore: readonly ExpertDescriptorColumn[]
  descriptorTail: readonly ExpertDescriptorColumn[]
  /**
   * Trailing computed columns after unit rate (SoT). Prefer this over trailingHeaderLabels.
   * Typically Net Media / actions / Σ qty — marked `surfaces: "grid"`.
   */
  trailingColumns: readonly ExpertDescriptorColumn[]
  /**
   * @deprecated Prefer {@link trailingColumns}. Labels after unit rate (computed cols).
   */
  trailingHeaderLabels: readonly string[]
  /**
   * Sticky widths for trailing computed cols (Net Media / actions / Σ qty).
   * Included in {@link expertGridDescriptorColWidths} so sticky offsets stay correct.
   * @deprecated Prefer {@link trailingColumns} `.widthPx`.
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

export function normalizeOptionPaste(
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
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
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
        label: "Targeting",
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
        kind: "unit-rate", surfaces: "grid",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
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
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
    { key: "noadserving", label: "No Ad Serving", widthPx: 56 },
  ],
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
        label: "Targeting",
        widthPx: 120,
        kind: "text",
      },
      { key: "placement", label: "Placement", widthPx: 110, kind: "text", surfaces: "both" },
      { key: "creative", label: "Creative", widthPx: 110, kind: "text" },
      { key: "size", label: "Ad Size", widthPx: 80, kind: "text", surfaces: "both" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
        key: "unitRate",
        label: "Unit Rate",
        widthPx: 88,
        kind: "unit-rate", surfaces: "grid",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
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
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
    { key: "noadserving", label: "No Ad Serving", widthPx: 56 },
  ],
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
        label: "Targeting",
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
        kind: "unit-rate", surfaces: "grid",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
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

/** Match labels/values on ProgAudioContainer buy-type combobox. */
export const PROGAUDIO_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export const PROGAUDIO_BID_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "clicks", label: "Clicks" },
  { value: "completed_listens", label: "Completed Listens" },
  { value: "conversions", label: "Conversions" },
  { value: "reach", label: "Reach" },
]

export function createEmptyProgAudioExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): ProgAudioExpertScheduleRow {
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

export const PROGAUDIO_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<ProgAudioExpertScheduleRow> =
  {
    mediaTypeKey: "progaudio",
    channelLabel: "Prog Audio",
    publisherField: "platform",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
    { key: "noadserving", label: "No Ad Serving", widthPx: 56 },
  ],
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
        options: PROGAUDIO_BID_STRATEGY_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, PROGAUDIO_BID_STRATEGY_OPTIONS),
      },
      {
        key: "buyType",
        label: "Buy Type",
        widthPx: 96,
        kind: "combobox-static",
        options: PROGAUDIO_BUY_TYPE_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, PROGAUDIO_BUY_TYPE_OPTIONS),
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
        kind: "unit-rate", surfaces: "grid",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyProgAudioExpertRow,
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

/** Match labels/values on ProgBVODContainer buy-type combobox. */
export const PROGBVOD_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export const PROGBVOD_BID_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "completed_views", label: "Completed Views" },
  { value: "reach", label: "Reach" },
  { value: "target_cpa", label: "Target CPA" },
  { value: "viewability", label: "Viewability" },
]

export function createEmptyProgBvodExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): ProgBvodExpertScheduleRow {
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

export const PROGBVOD_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<ProgBvodExpertScheduleRow> =
  {
    mediaTypeKey: "progbvod",
    channelLabel: "Prog BVOD",
    publisherField: "platform",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
    { key: "noadserving", label: "No Ad Serving", widthPx: 56 },
  ],
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
        options: PROGBVOD_BID_STRATEGY_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, PROGBVOD_BID_STRATEGY_OPTIONS),
      },
      {
        key: "buyType",
        label: "Buy Type",
        widthPx: 96,
        kind: "combobox-static",
        options: PROGBVOD_BUY_TYPE_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, PROGBVOD_BUY_TYPE_OPTIONS),
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
        kind: "unit-rate", surfaces: "grid",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyProgBvodExpertRow,
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

export const PROGOOH_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export const PROGOOH_BID_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "clicks", label: "Clicks" },
  { value: "conversions", label: "Conversions" },
  { value: "reach", label: "Reach" },
  { value: "viewability", label: "Viewability" },
]

export function createEmptyProgOohExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): ProgOohExpertScheduleRow {
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

export const PROGOOH_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<ProgOohExpertScheduleRow> =
  {
    mediaTypeKey: "progooh",
    channelLabel: "Prog OOH",
    publisherField: "platform",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
    { key: "noadserving", label: "No Ad Serving", widthPx: 56 },
  ],
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
        options: PROGOOH_BID_STRATEGY_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, PROGOOH_BID_STRATEGY_OPTIONS),
      },
      {
        key: "buyType",
        label: "Buy Type",
        widthPx: 96,
        kind: "combobox-static",
        options: PROGOOH_BUY_TYPE_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, PROGOOH_BUY_TYPE_OPTIONS),
      },
      {
        key: "creativeTargeting",
        label: "Targeting",
        widthPx: 120,
        kind: "text",
      },
      { key: "placement", label: "Placement", widthPx: 110, kind: "text", surfaces: "both" },
      { key: "creative", label: "Creative", widthPx: 110, kind: "text" },
      { key: "size", label: "Ad Size", widthPx: 80, kind: "text", surfaces: "both" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
        key: "unitRate",
        label: "Unit Rate",
        widthPx: 88,
        kind: "unit-rate", surfaces: "grid",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyProgOohExpertRow,
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

export const SOCIALMEDIA_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export const SOCIALMEDIA_BID_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "manual_cpc", label: "Clicks" },
  { value: "completed_views", label: "Video Views" },
  { value: "conversion_value", label: "Conversion Value" },
  { value: "landing_page_views", label: "Landing Page Views" },
  { value: "leads", label: "Leads" },
  { value: "maximize_conversions", label: "Maximize Conversions" },
  { value: "reach", label: "Reach" },
]

export function createEmptySocialMediaExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): SocialMediaExpertScheduleRow {
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

export const SOCIALMEDIA_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<SocialMediaExpertScheduleRow> =
  {
    mediaTypeKey: "socialmedia",
    channelLabel: "Social Media",
    publisherField: "platform",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
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
        options: SOCIALMEDIA_BID_STRATEGY_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, SOCIALMEDIA_BID_STRATEGY_OPTIONS),
      },
      {
        key: "buyType",
        label: "Buy Type",
        widthPx: 96,
        kind: "combobox-static",
        options: SOCIALMEDIA_BUY_TYPE_OPTIONS,
        normalizePaste: (raw) =>
          normalizeOptionPaste(raw, SOCIALMEDIA_BUY_TYPE_OPTIONS),
      },
      {
        key: "creativeTargeting",
        label: "Targeting",
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
        kind: "unit-rate", surfaces: "grid",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptySocialMediaExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveSocialMediaExpertRowScheduleYmdFromRow(
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
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
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
      // Persisted hydrate field; not shown on card or grid.
      { key: "panels", label: "Panels", widthPx: 80, kind: "text", surfaces: "none" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 120, kind: "text" },
      {
        key: "unitRate",
        label: "Unit Rate",
        widthPx: 88,
        kind: "unit-rate", surfaces: "grid",
        headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
      },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 100, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 76, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 68, kind: "text", surfaces: "grid" },
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


/** Resolve option flags (SoT) with back-compat from billingFlag* triples. */
export function getExpertOptionFlags(
  config: Pick<
    ExpertGridChannelConfig<ExpertScheduleRowCommon>,
    "optionFlags" | "billingFlagKeys" | "billingFlagLabels" | "billingFlagWidthsPx"
  >
): readonly ExpertOptionFlag[] {
  // `!= null` so empty Production `[]` is authoritative SoT.
  if (config.optionFlags != null) return config.optionFlags
  const keys = config.billingFlagKeys ?? []
  const labels = config.billingFlagLabels ?? []
  const widths = config.billingFlagWidthsPx ?? []
  return keys.map((key, i) => ({
    key,
    label: labels[i] ?? "",
    widthPx: widths[i] ?? 44,
  }))
}

/**
 * Descriptor fields that belong on the ExpertCard field grid.
 * Omits `surfaces: "grid"` and `surfaces: "none"`. Does not include
 * trailingColumns or optionFlags — those are separate card sections.
 */
export function getExpertCardSurfaceFields(
  config: Pick<
    ExpertGridChannelConfig<ExpertScheduleRowCommon>,
    "descriptorCore" | "descriptorTail"
  >
): ExpertDescriptorColumn[] {
  return [...config.descriptorCore, ...config.descriptorTail].filter((c) =>
    isExpertDescriptorCardSurface(c.surfaces)
  )
}

/**
 * All descriptor keys (core + tail), including `surfaces: "none"` persist-only
 * fields. Used for descriptor ↔ row-type parity tests.
 */
export function expertDescriptorAllKeys(
  config: Pick<
    ExpertGridChannelConfig<ExpertScheduleRowCommon>,
    "descriptorCore" | "descriptorTail"
  >
): string[] {
  return [
    ...config.descriptorCore.map((c) => c.key),
    ...config.descriptorTail.map((c) => c.key),
  ]
}

/** Descriptor columns that belong on the ExpertGrid sticky strip. */
export function getExpertGridSurfaceFields(
  config: Pick<
    ExpertGridChannelConfig<ExpertScheduleRowCommon>,
    "descriptorCore" | "descriptorTail"
  >
): ExpertDescriptorColumn[] {
  return [...config.descriptorCore, ...config.descriptorTail].filter((c) =>
    isExpertDescriptorGridSurface(c.surfaces)
  )
}

/** @deprecated Prefer {@link getExpertOptionFlags}. */
export function getExpertBillingFlagKeys(
  config: Pick<
    ExpertGridChannelConfig<ExpertScheduleRowCommon>,
    "optionFlags" | "billingFlagKeys" | "billingFlagLabels" | "billingFlagWidthsPx"
  >
): readonly string[] {
  return getExpertOptionFlags(config).map((f) => f.key)
}

/** Build billingFlag* mirrors from optionFlags (for callers still on the old shape). */
export function billingCompatFromOptionFlags(
  flags: readonly ExpertOptionFlag[]
): {
  billingFlagKeys: readonly string[]
  billingFlagLabels: readonly string[]
  billingFlagWidthsPx: readonly number[]
} {
  return {
    billingFlagKeys: flags.map((f) => f.key),
    billingFlagLabels: flags.map((f) => f.label),
    billingFlagWidthsPx: flags.map((f) => f.widthPx ?? 44),
  }
}

/** Resolve trailing computed columns (SoT) with back-compat from trailingHeaderLabels. */
export function getExpertTrailingColumns(
  config: Pick<
    ExpertGridChannelConfig<ExpertScheduleRowCommon>,
    "trailingColumns" | "trailingHeaderLabels" | "trailingColWidthsPx"
  >
): readonly ExpertDescriptorColumn[] {
  if (config.trailingColumns != null) return config.trailingColumns
  const labels = config.trailingHeaderLabels ?? []
  const widths = config.trailingColWidthsPx ?? []
  const keys =
    labels[0] === "Total Cost"
      ? (["totalCost", "actions", "sumQty"] as const)
      : (["netMedia", "actions", "sumQty"] as const)
  return labels.map((label, i) => ({
    key: keys[i] ?? `trailing${i}`,
    label,
    widthPx: widths[i] ?? 64,
    kind: "text" as const,
    surfaces: "grid" as const,
  }))
}

/** @deprecated Prefer {@link getExpertTrailingColumns}. */
export function getExpertTrailingHeaderLabels(
  config: Pick<
    ExpertGridChannelConfig<ExpertScheduleRowCommon>,
    "trailingColumns" | "trailingHeaderLabels" | "trailingColWidthsPx"
  >
): readonly string[] {
  return getExpertTrailingColumns(config).map((c) => c.label)
}

/** Build trailingHeaderLabels / trailingColWidthsPx from trailingColumns. */
export function trailingCompatFromColumns(
  cols: readonly ExpertDescriptorColumn[]
): {
  trailingHeaderLabels: readonly string[]
  trailingColWidthsPx: readonly number[]
} {
  return {
    trailingHeaderLabels: cols.map((c) => c.label),
    trailingColWidthsPx: cols.map((c) => c.widthPx),
  }
}

/** Descriptor keys in sticky order (billing optional). Omits card-only / none. */
export function expertGridDescriptorKeys(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>,
  showBillingCols: boolean
): string[] {
  const gridCols = getExpertGridSurfaceFields(config)
  return [
    ...(showBillingCols ? config.billingFlagKeys : []),
    ...gridCols.map((c) => c.key),
  ]
}

export function expertGridDescriptorColWidths(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>,
  showBillingCols: boolean
): number[] {
  const gridCols = getExpertGridSurfaceFields(config)
  const widths = gridCols.map((c) => c.widthPx)
  const trailing = config.trailingColWidthsPx ?? []
  return showBillingCols
    ? [...config.billingFlagWidthsPx, ...widths, ...trailing]
    : [...widths, ...trailing]
}

export function expertGridDescriptorHeadLabels(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>,
  showBillingCols: boolean
): string[] {
  const gridCols = getExpertGridSurfaceFields(config)
  const billing = showBillingCols ? [...config.billingFlagLabels] : []
  return [
    ...billing,
    ...gridCols.map((c) => c.label),
    ...config.trailingHeaderLabels,
  ]
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
  return [...billing, ...getExpertGridSurfaceFields(config)]
}

export const DIGITALDISPLAY_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export function createEmptyDigitalDisplayExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): DigitalDisplayExpertScheduleRow {
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
    publisher: "",
    site: "",
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

export const DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<DigitalDisplayExpertScheduleRow> =
  {
    mediaTypeKey: "digidisplay",
    channelLabel: "Digital Display",
    publisherField: "publisher",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees"
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees"
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      { key: "publisher", label: "Publisher", widthPx: 120, kind: "combobox-publishers" },
      // Persisted / synced from publisher; not shown on card or grid.
      { key: "platform", label: "Platform", widthPx: 120, kind: "text", surfaces: "none" },
      { key: "site", label: "Site", widthPx: 110, kind: "combobox-sites" },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: DIGITALDISPLAY_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, DIGITALDISPLAY_BUY_TYPE_OPTIONS),
    },
      { key: "creativeTargeting", label: "Creative Targeting", widthPx: 120, kind: "text" },
      { key: "creative", label: "Creative", widthPx: 110, kind: "text" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyDigitalDisplayExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveDigitalDisplayExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export const DIGIVIDEO_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export function createEmptyDigiVideoExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): DigiVideoExpertScheduleRow {
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
    publisher: "",
    site: "",
    bidStrategy: "",
    buyType: "",
    placement: "",
    size: "",
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

export const DIGIVIDEO_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<DigiVideoExpertScheduleRow> =
  {
    mediaTypeKey: "digivideo",
    channelLabel: "Digi Video",
    publisherField: "publisher",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
    { key: "noadserving", label: "No Ad Serving", widthPx: 56 },
  ],
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
      { key: "publisher", label: "Publisher", widthPx: 120, kind: "combobox-publishers" },
      // Persisted / synced from publisher; not shown on card or grid.
      { key: "platform", label: "Platform", widthPx: 120, kind: "text", surfaces: "none" },
      { key: "site", label: "Site", widthPx: 110, kind: "combobox-sites" },
      // Form field retained for hydrate; not on DigiVideo card historically.
      {
        key: "bidStrategy",
        label: "Bid Strategy",
        widthPx: 110,
        kind: "text",
        surfaces: "none",
      },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: DIGIVIDEO_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, DIGIVIDEO_BUY_TYPE_OPTIONS),
    },
      { key: "creativeTargeting", label: "Targeting", widthPx: 120, kind: "text" },
      { key: "placement", label: "Placement", widthPx: 110, kind: "text", surfaces: "both" },
      { key: "creative", label: "Creative", widthPx: 110, kind: "text" },
      { key: "size", label: "Ad Size", widthPx: 80, kind: "text", surfaces: "both" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyDigiVideoExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveDigiVideoExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export const DIGIAUDIO_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export function createEmptyDigitalAudioExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): DigitalAudioExpertScheduleRow {
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
    publisher: "",
    site: "",
    bidStrategy: "",
    buyType: "",
    targetingAttribute: "",
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

export const DIGIAUDIO_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<DigitalAudioExpertScheduleRow> =
  {
    mediaTypeKey: "digiaudio",
    channelLabel: "Digital Audio",
    publisherField: "publisher",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees"
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees"
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      { key: "publisher", label: "Publisher", widthPx: 120, kind: "combobox-publishers" },
      // Persisted / synced from publisher; not shown on card or grid.
      { key: "platform", label: "Platform", widthPx: 120, kind: "text", surfaces: "none" },
      { key: "site", label: "Site", widthPx: 110, kind: "combobox-sites" },
      // Form field retained for hydrate; not on DigiAudio card historically.
      {
        key: "bidStrategy",
        label: "Bid Strategy",
        widthPx: 110,
        kind: "text",
        surfaces: "none",
      },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: DIGIAUDIO_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, DIGIAUDIO_BUY_TYPE_OPTIONS),
    },
      { key: "targetingAttribute", label: "Targeting Attribute", widthPx: 120, kind: "text" },
      { key: "creativeTargeting", label: "Creative Targeting", widthPx: 120, kind: "text" },
      { key: "creative", label: "Creative", widthPx: 110, kind: "text" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyDigitalAudioExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveDigitalAudioExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export const BVOD_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export function createEmptyBvodExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): BvodExpertScheduleRow {
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
    publisher: "",
    site: "",
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

export const BVOD_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<BvodExpertScheduleRow> =
  {
    mediaTypeKey: "bvod",
    channelLabel: "BVOD",
    publisherField: "publisher",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees"
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees"
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      { key: "publisher", label: "Publisher", widthPx: 120, kind: "combobox-publishers" },
      // Persisted / synced from publisher; not shown on card or grid.
      { key: "platform", label: "Platform", widthPx: 120, kind: "text", surfaces: "none" },
      { key: "site", label: "Site", widthPx: 110, kind: "combobox-sites" },
      // Form field retained for hydrate; not on BVOD card historically.
      {
        key: "bidStrategy",
        label: "Bid Strategy",
        widthPx: 110,
        kind: "text",
        surfaces: "none",
      },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: BVOD_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, BVOD_BUY_TYPE_OPTIONS),
    },
      { key: "creativeTargeting", label: "Creative Targeting", widthPx: 120, kind: "text" },
      { key: "creative", label: "Creative", widthPx: 110, kind: "text" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyBvodExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveBvodExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export const TV_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "cpm", label: "CPM" },
  { value: "cpt", label: "CPT" },
  { value: "fixed_cost", label: "Fixed Cost" },
  { value: "package", label: "Package" },
  { value: "spots", label: "Spots" },
  { value: "CPP", label: "CPP" },
  { value: "cpp", label: "CPP (lower)" },
]

export function createEmptyTelevisionExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): TelevisionExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) {
    weeklyValues[k] = ""
  }
  return {
    id,
    startDate: ymd(campaignStartDate),
    endDate: ymd(campaignEndDate),
    market: "",
    network: "",
    station: "",
    daypart: "",
    placement: "",
    buyType: "",
    buyingDemo: "",
    size: "30s",
    tarps: "",
    creative: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: "",
    grossCost: 0,
    weeklyValues,
    mergedWeekSpans: [],
  }
}

export const TELEVISION_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<TelevisionExpertScheduleRow> =
  {
    mediaTypeKey: "television",
    channelLabel: "Television",
    publisherField: "network",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees"
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees"
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      { key: "network", label: "Network", widthPx: 130, kind: "combobox-publishers" },
      { key: "station", label: "Station", widthPx: 110, kind: "combobox-stations" },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: TV_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, TV_BUY_TYPE_OPTIONS),
    },
      { key: "placement", label: "Placement", widthPx: 110, kind: "text" },
      { key: "daypart", label: "Daypart", widthPx: 96, kind: "text" },
      {
        key: "size",
        label: "Ad Size",
        widthPx: 80,
        kind: "text",
        surfaces: "both",
      },
      {
        key: "tarps",
        label: "TARPs",
        widthPx: 72,
        kind: "text",
        surfaces: "both",
      },
      {
        key: "creative",
        label: "Creative Length",
        widthPx: 96,
        kind: "text",
        surfaces: "both",
      },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyTelevisionExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveTelevisionExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export const RADIO_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpm", label: "CPM" },
  { value: "fixed_cost", label: "Fixed Cost" },
  { value: "package", label: "Package" },
  { value: "spots", label: "Spots" },
]

export function createEmptyRadioExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): RadioExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) {
    weeklyValues[k] = ""
  }
  return {
    id,
    startDate: ymd(campaignStartDate),
    endDate: ymd(campaignEndDate),
    network: "",
    station: "",
    market: "",
    placement: "",
    duration: "",
    format: "",
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

export const RADIO_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<RadioExpertScheduleRow> =
  {
    mediaTypeKey: "radio",
    channelLabel: "Radio",
    publisherField: "network",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees"
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees"
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      { key: "network", label: "Network", widthPx: 130, kind: "combobox-publishers" },
      { key: "station", label: "Station", widthPx: 110, kind: "combobox-stations" },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: RADIO_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, RADIO_BUY_TYPE_OPTIONS),
    },
      { key: "placement", label: "Placement", widthPx: 110, kind: "text" },
      { key: "duration", label: "Duration", widthPx: 80, kind: "text" },
      { key: "format", label: "Format", widthPx: 96, kind: "text" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyRadioExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveRadioExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export const CINEMA_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpm", label: "CPM" },
  { value: "fixed_cost", label: "Fixed Cost" },
  { value: "package", label: "Package" },
  { value: "spots", label: "Spots" },
]

export function createEmptyCinemaExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): CinemaExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) {
    weeklyValues[k] = ""
  }
  return {
    id,
    startDate: ymd(campaignStartDate),
    endDate: ymd(campaignEndDate),
    network: "",
    station: "",
    market: "",
    placement: "",
    duration: "",
    format: "",
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

export const CINEMA_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<CinemaExpertScheduleRow> =
  {
    mediaTypeKey: "cinema",
    channelLabel: "Cinema",
    publisherField: "network",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees"
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees"
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      { key: "network", label: "Network", widthPx: 130, kind: "combobox-publishers" },
      { key: "station", label: "Station", widthPx: 110, kind: "combobox-stations" },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: CINEMA_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, CINEMA_BUY_TYPE_OPTIONS),
    },
      { key: "placement", label: "Placement", widthPx: 110, kind: "text" },
      { key: "duration", label: "Duration", widthPx: 80, kind: "text" },
      { key: "format", label: "Format", widthPx: 96, kind: "text" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyCinemaExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveCinemaExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export const NEWSPAPER_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpm", label: "CPM" },
  { value: "fixed_cost", label: "Fixed Cost" },
  { value: "insertions", label: "Insertions" },
  { value: "package", label: "Package" },
]

export function createEmptyNewspaperExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): NewspaperExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) {
    weeklyValues[k] = ""
  }
  return {
    id,
    startDate: ymd(campaignStartDate),
    endDate: ymd(campaignEndDate),
    network: "",
    publisher: "",
    title: "",
    buyType: "",
    size: "",
    format: "",
    placement: "",
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

export const NEWSPAPER_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<NewspaperExpertScheduleRow> =
  {
    mediaTypeKey: "newspaper",
    channelLabel: "Newspaper",
    publisherField: "network",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees"
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees"
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      { key: "network", label: "Network", widthPx: 130, kind: "combobox-publishers" },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: NEWSPAPER_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, NEWSPAPER_BUY_TYPE_OPTIONS),
    },
      { key: "placement", label: "Placement", widthPx: 110, kind: "text" },
      { key: "title", label: "Title", widthPx: 120, kind: "combobox-titles" },
      {
        key: "size",
        label: "Ad Size",
        widthPx: 80,
        kind: "combobox-dynamic",
      },
      // Persisted hydrate field; size is the visible control.
      { key: "format", label: "Format", widthPx: 80, kind: "text", surfaces: "none" },
      // Grid-only: card publisher control is Network (publisherField). Old card had no Publisher text field.
      { key: "publisher", label: "Publisher", widthPx: 120, kind: "text", surfaces: "grid" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyNewspaperExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveNewspaperExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export const MAGAZINES_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpm", label: "CPM" },
  { value: "fixed_cost", label: "Fixed Cost" },
  { value: "insertions", label: "Insertions" },
  { value: "package", label: "Package" },
]

export function createEmptyMagazinesExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): MagazinesExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) {
    weeklyValues[k] = ""
  }
  return {
    id,
    startDate: ymd(campaignStartDate),
    endDate: ymd(campaignEndDate),
    network: "",
    title: "",
    buyType: "",
    size: "",
    publisher: "",
    placement: "",
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

export const MAGAZINES_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<MagazinesExpertScheduleRow> =
  {
    mediaTypeKey: "magazines",
    channelLabel: "Magazines",
    publisherField: "network",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees"
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees"
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      { key: "network", label: "Network", widthPx: 130, kind: "combobox-publishers" },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: MAGAZINES_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, MAGAZINES_BUY_TYPE_OPTIONS),
    },
      { key: "placement", label: "Placement", widthPx: 110, kind: "text" },
      { key: "title", label: "Title", widthPx: 120, kind: "combobox-titles" },
      {
        key: "size",
        label: "Ad Size",
        widthPx: 80,
        kind: "combobox-dynamic",
      },
      // Grid-only: card publisher control is Network (publisherField). Old card had no Publisher text field.
      { key: "publisher", label: "Publisher", widthPx: 120, kind: "text", surfaces: "grid" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyMagazinesExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveMagazineExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export const INFLUENCERS_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export const INFLUENCERS_BID_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "manual_cpc", label: "Clicks" },
  { value: "completed_views", label: "Video Views" },
  { value: "conversion_value", label: "Conversion Value" },
  { value: "landing_page_views", label: "Landing Page Views" },
  { value: "leads", label: "Leads" },
  { value: "maximize_conversions", label: "Maximize Conversions" },
  { value: "reach", label: "Reach" },
]

export function createEmptyInfluencersExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): InfluencersExpertScheduleRow {
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
    objective: "",
    campaign: "",
    bidStrategy: "",
    buyType: "",
    targetingAttribute: "",
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

export const INFLUENCERS_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<InfluencersExpertScheduleRow> =
  {
    mediaTypeKey: "influencers",
    channelLabel: "Influencers",
    publisherField: "platform",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees"
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees"
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      { key: "platform", label: "Platform", widthPx: 120, kind: "combobox-publishers" },
      {
      key: "bidStrategy",
      label: "Bid Strategy",
      widthPx: 110,
      kind: "combobox-static",
      options: INFLUENCERS_BID_STRATEGY_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, INFLUENCERS_BID_STRATEGY_OPTIONS),
    },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: INFLUENCERS_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, INFLUENCERS_BUY_TYPE_OPTIONS),
    },
      {
        key: "targetingAttribute",
        label: "Creative Targeting",
        widthPx: 120,
        kind: "text",
        surfaces: "card",
      },
      {
        key: "creativeTargeting",
        label: "Placement",
        widthPx: 120,
        kind: "text",
        surfaces: "both",
      },
      {
        key: "creative",
        label: "Creative",
        widthPx: 110,
        kind: "text",
        surfaces: "both",
      },
      {
        key: "objective",
        label: "Objective",
        widthPx: 110,
        kind: "text",
        surfaces: "none",
      },
      {
        key: "campaign",
        label: "Campaign",
        widthPx: 110,
        kind: "text",
        surfaces: "none",
      },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyInfluencersExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveInfluencersExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export const INTEGRATION_BUY_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "bonus", label: "Bonus" },
  { value: "package", label: "Package" },
  { value: "package_inclusions", label: "Package Inclusions" },
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpv", label: "CPV" },
  { value: "fixed_cost", label: "Fixed Cost" },
]

export const INTEGRATION_BID_STRATEGY_OPTIONS: ComboboxOption[] = [
  { value: "manual_cpc", label: "Clicks" },
  { value: "completed_views", label: "Video Views" },
  { value: "conversion_value", label: "Conversion Value" },
  { value: "landing_page_views", label: "Landing Page Views" },
  { value: "leads", label: "Leads" },
  { value: "maximize_conversions", label: "Maximize Conversions" },
  { value: "reach", label: "Reach" },
]

export function createEmptyIntegrationExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): IntegrationExpertScheduleRow {
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
    objective: "",
    campaign: "",
    bidStrategy: "",
    buyType: "",
    targetingAttribute: "",
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

export const INTEGRATION_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<IntegrationExpertScheduleRow> =
  {
    mediaTypeKey: "integration",
    channelLabel: "Integration",
    publisherField: "platform",
    optionFlags: [
    { key: "fixedCostMedia", label: "Fixed Cost Media", widthPx: 56 },
    { key: "clientPaysForMedia", label: "Client Pays for Media", widthPx: 56 },
    { key: "budgetIncludesFees", label: "Budget Includes Fees", widthPx: 56 },
  ],
    billingFlagKeys: [
      "fixedCostMedia",
      "clientPaysForMedia",
      "budgetIncludesFees"
    ],
    billingFlagLabels: [
      "Fixed Cost Media",
      "Client Pays for Media",
      "Budget Includes Fees"
    ],
    billingFlagWidthsPx: [56, 56, 56],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      { key: "platform", label: "Platform", widthPx: 120, kind: "combobox-publishers" },
      {
      key: "bidStrategy",
      label: "Bid Strategy",
      widthPx: 110,
      kind: "combobox-static",
      options: INTEGRATION_BID_STRATEGY_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, INTEGRATION_BID_STRATEGY_OPTIONS),
    },
      {
      key: "buyType",
      label: "Buy Type",
      widthPx: 96,
      kind: "combobox-static",
      options: INTEGRATION_BUY_TYPE_OPTIONS,
      normalizePaste: (raw) =>
        normalizeOptionPaste(raw, INTEGRATION_BUY_TYPE_OPTIONS),
    },
      {
        key: "targetingAttribute",
        label: "Creative Targeting",
        widthPx: 120,
        kind: "text",
        surfaces: "card",
      },
      {
        key: "creativeTargeting",
        label: "Placement",
        widthPx: 120,
        kind: "text",
        surfaces: "both",
      },
      {
        key: "creative",
        label: "Creative",
        widthPx: 110,
        kind: "text",
        surfaces: "both",
      },
      {
        key: "objective",
        label: "Objective",
        widthPx: 110,
        kind: "text",
        surfaces: "none",
      },
      {
        key: "campaign",
        label: "Campaign",
        widthPx: 110,
        kind: "text",
        surfaces: "none",
      },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      {
      key: "unitRate",
      label: "Unit Rate",
      widthPx: 88,
      kind: "unit-rate", surfaces: "grid",
      headerTooltip: "Rate (CPC / CPM / CPV depending on Buy Type)",
    },
    ],
    trailingColumns: [
    { key: "netMedia", label: "Net Media", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Net Media", "", "Σ qty"],
    createEmptyRow: createEmptyIntegrationExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveIntegrationExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }

export function createEmptyProductionExpertRow(
  id: string,
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekKeys: string[]
): ProductionExpertScheduleRow {
  const ymd = (d: Date) => format(startOfDay(d), "yyyy-MM-dd")
  const weeklyValues = {} as ExpertWeeklyValues
  for (const k of weekKeys) {
    weeklyValues[k] = ""
  }
  return {
    id,
    startDate: ymd(campaignStartDate),
    endDate: ymd(campaignEndDate),
    mediaType: "",
    publisher: "",
    description: "",
    market: "",
    buyType: "production",
    unitRate: "",
    grossCost: 0,
    weeklyValues,
    mergedWeekSpans: [],
  }
}

export const PRODUCTION_EXPERT_CHANNEL_CONFIG: ExpertGridChannelConfig<ProductionExpertScheduleRow> =
  {
    mediaTypeKey: "production",
    channelLabel: "Production",
    publisherField: "publisher",
    optionFlags: [],
    billingFlagKeys: [],
    billingFlagLabels: [],
    billingFlagWidthsPx: [],
    descriptorCore: [
      { key: "startDate", label: "Start Date", widthPx: 48, kind: "date-start" },
      { key: "endDate", label: "End Date", widthPx: 48, kind: "date-end" },
      {
        key: "mediaType",
        label: "Production type",
        widthPx: 120,
        kind: "combobox-dynamic",
        searchPlaceholder: "Search production types…",
      },
      { key: "publisher", label: "Publisher", widthPx: 120, kind: "text" },
      { key: "description", label: "Description", widthPx: 110, kind: "text" },
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      // Fixed buy type for production rows; retained for hydrate, not shown.
      { key: "buyType", label: "Buy Type", widthPx: 96, kind: "text", surfaces: "none" },
    ],
    descriptorTail: [
      {
        key: "unitRate",
        label: "Unit Cost",
        widthPx: 88,
        kind: "unit-rate",
        surfaces: "both",
        headerTooltip: "Unit cost × quantity = total cost",
      },
    ],
    trailingColumns: [
    { key: "totalCost", label: "Total Cost", widthPx: 88, kind: "text", surfaces: "grid" },
    { key: "actions", label: "", widthPx: 72, kind: "text", surfaces: "grid" },
    { key: "sumQty", label: "Σ qty", widthPx: 64, kind: "text", surfaces: "grid" },
  ],
    trailingHeaderLabels: ["Total Cost", "", "Σ qty"],
    createEmptyRow: createEmptyProductionExpertRow,
    deriveScheduleYmdFromRow: (
      row,
      weekColumns,
      campaignStartDate,
      campaignEndDate,
      dayKeysByWeekKey
    ) =>
      deriveProductionExpertRowScheduleYmdFromRow(
        row,
        weekColumns,
        campaignStartDate,
        campaignEndDate,
        dayKeysByWeekKey
      ),
  }
