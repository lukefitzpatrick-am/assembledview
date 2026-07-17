/**
 * Per-channel descriptor for the shared {@link ExpertGrid}.
 * Columns, buy/bid options, labels, fee wiring, and empty-row factory live here —
 * the grid shell stays channel-agnostic.
 */
import { format, startOfDay } from "date-fns"
import type { ComboboxOption } from "@/components/media-containers/ExpertGridCombobox"
import type {
  ExpertWeeklyValues,
  SearchExpertScheduleRow,
} from "@/lib/mediaplan/expertModeWeeklySchedule"
import { deriveSearchExpertRowScheduleYmdFromRow } from "@/lib/mediaplan/expertChannelMappings"
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
}

export type ExpertGridChannelConfig<TRow> = {
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
      },
      { key: "creative", label: "Creative", widthPx: 110, kind: "text" },
    ],
    descriptorTail: [
      { key: "market", label: "Market", widthPx: 96, kind: "text" },
      { key: "buyingDemo", label: "Buying Demo", widthPx: 110, kind: "text" },
      { key: "unitRate", label: "Unit Rate", widthPx: 88, kind: "unit-rate" },
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

/** Descriptor keys in sticky order (billing optional). */
export function expertGridDescriptorKeys(
  config: ExpertGridChannelConfig<unknown>,
  showBillingCols: boolean
): string[] {
  return [
    ...(showBillingCols ? config.billingFlagKeys : []),
    ...config.descriptorCore.map((c) => c.key),
    ...config.descriptorTail.map((c) => c.key),
  ]
}

export function expertGridDescriptorColWidths(
  config: ExpertGridChannelConfig<unknown>,
  showBillingCols: boolean
): number[] {
  const core = config.descriptorCore.map((c) => c.widthPx)
  const tail = config.descriptorTail.map((c) => c.widthPx)
  return showBillingCols
    ? [...config.billingFlagWidthsPx, ...core, ...tail]
    : [...core, ...tail]
}

export function expertGridDescriptorHeadLabels(
  config: ExpertGridChannelConfig<unknown>,
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
