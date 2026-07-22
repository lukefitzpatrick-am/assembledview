/**
 * One-shot P-1: descriptor surfaces/optionFlags + trailingColumns SoT.
 * Run: node scripts/_p1-migrate-descriptor-sot.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, "../lib/mediaplan/expertGridChannelConfig.ts")
let src = fs.readFileSync(file, "utf8")
const hadCrlf = src.includes("\r\n")
src = src.replace(/\r\n/g, "\n")

const NEW_TYPES = `export type ExpertDescriptorColumnKind =
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

/** Where a descriptor field appears. Omit = "both". */
export type ExpertDescriptorSurface = "grid" | "card" | "both"

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
   * Which surfaces render this field. Default \`both\`.
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
  /** Billing flags — optional for channels with empty \`optionFlags\` (e.g. Production). */
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
   * @deprecated Prefer {@link optionFlags} \`.widthPx\`. Kept in sync for ExpertGrid / callers.
   */
  billingFlagWidthsPx: readonly number[]
  descriptorCore: readonly ExpertDescriptorColumn[]
  descriptorTail: readonly ExpertDescriptorColumn[]
  /**
   * Trailing computed columns after unit rate (SoT). Prefer this over trailingHeaderLabels.
   * Typically Net Media / actions / Σ qty — marked \`surfaces: "grid"\`.
   */
  trailingColumns: readonly ExpertDescriptorColumn[]
  /**
   * @deprecated Prefer {@link trailingColumns}. Labels after unit rate (computed cols).
   */
  trailingHeaderLabels: readonly string[]
  /**
   * Sticky widths for trailing computed cols (Net Media / actions / Σ qty).
   * Included in {@link expertGridDescriptorColWidths} so sticky offsets stay correct.
   * @deprecated Prefer {@link trailingColumns} \`.widthPx\`.
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
}`

const start = src.indexOf("export type ExpertDescriptorColumnKind =")
const end = src.indexOf("export function getRowString")
if (start < 0 || end < 0) {
  console.error("type block markers not found", { start, end })
  process.exit(1)
}
src = src.slice(0, start) + NEW_TYPES + "\n\n" + src.slice(end)

// Tag every unitRate descriptor with surfaces:"grid" (preserve headerTooltip)
let unitRateTagged = 0
src = src.replace(
  /(key:\s*"unitRate",[\s\S]*?kind:\s*"unit-rate")(\s*,?\s*(?:headerTooltip:[\s\S]*?)?\})/g,
  (full, before, after) => {
    if (full.includes('surfaces:')) return full
    unitRateTagged++
    return `${before}, surfaces: "grid"${after}`
  }
)
console.log("unitRate surfaces:grid tagged:", unitRateTagged)

const DEFAULT_KEYS = ["netMedia", "actions", "sumQty"]
const PRODUCTION_KEYS = ["totalCost", "actions", "sumQty"]
const DEFAULT_WIDTHS = [88, 72, 64]

function fmtCol(c) {
  const parts = [
    `key: ${JSON.stringify(c.key)}`,
    `label: ${JSON.stringify(c.label)}`,
    `widthPx: ${c.widthPx}`,
    `kind: ${JSON.stringify(c.kind)}`,
  ]
  if (c.surfaces) parts.push(`surfaces: ${JSON.stringify(c.surfaces)}`)
  return `{ ${parts.join(", ")} }`
}

function fmtTrailing(cols) {
  return `[\n    ${cols.map(fmtCol).join(",\n    ")},\n  ]`
}

function fmtOptionFlags(keys, labels, widths) {
  if (!keys.length) return "[]"
  const lines = keys.map((k, i) => {
    const w = widths[i] ?? 44
    return `{ key: ${JSON.stringify(k)}, label: ${JSON.stringify(labels[i] ?? "")}, widthPx: ${w} }`
  })
  return `[\n    ${lines.join(",\n    ")},\n  ]`
}

function evalArr(str) {
  return Function(`"use strict"; return (${str})`)()
}

const billingBlock =
  /billingFlagKeys:\s*(\[[\s\S]*?\]),\s*\n\s*billingFlagLabels:\s*(\[[\s\S]*?\]),\s*\n\s*billingFlagWidthsPx:\s*(\[[\s\S]*?\]),/g

let n = 0
src = src.replace(billingBlock, (full, kStr, lStr, wStr) => {
  n++
  const keys = evalArr(kStr)
  const labels = evalArr(lStr)
  const widths = evalArr(wStr)
  const of = fmtOptionFlags(keys, labels, widths)
  return `optionFlags: ${of},\n    billingFlagKeys: ${kStr},\n    billingFlagLabels: ${lStr},\n    billingFlagWidthsPx: ${wStr},`
})
console.log("optionFlags inserted:", n)

const trailingBlock =
  /trailingHeaderLabels:\s*(\[[\s\S]*?\]),(\s*\n\s*trailingColWidthsPx:\s*(\[[\s\S]*?\]),)?/g

let t = 0
src = src.replace(trailingBlock, (full, labelsStr, widthsPart, widthsStr) => {
  t++
  const labels = evalArr(labelsStr)
  const isProd = labels[0] === "Total Cost"
  const keys = isProd ? PRODUCTION_KEYS : DEFAULT_KEYS
  const widths = widthsStr ? evalArr(widthsStr) : DEFAULT_WIDTHS
  const synced = labels.map((label, i) => ({
    key: keys[i] ?? `trailing${i}`,
    label,
    widthPx: widths[i] ?? DEFAULT_WIDTHS[i] ?? 64,
    kind: "text",
    surfaces: "grid",
  }))
  const widthsLine = widthsPart ?? ""
  return `trailingColumns: ${fmtTrailing(synced)},\n    trailingHeaderLabels: ${labelsStr},${widthsLine}`
})
console.log("trailingColumns inserted:", t)

const HELPERS = `
/** Resolve option flags (SoT) with back-compat from billingFlag* triples. */
export function getExpertOptionFlags(
  config: Pick<
    ExpertGridChannelConfig<ExpertScheduleRowCommon>,
    "optionFlags" | "billingFlagKeys" | "billingFlagLabels" | "billingFlagWidthsPx"
  >
): readonly ExpertOptionFlag[] {
  // \`!= null\` so empty Production \`[]\` is authoritative SoT.
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
    key: keys[i] ?? \`trailing\${i}\`,
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

`

const helperAnchor = "/** Descriptor keys in sticky order"
if (!src.includes(helperAnchor)) {
  console.error("helper anchor not found:", helperAnchor)
  process.exit(1)
}
if (!src.includes("export function getExpertOptionFlags")) {
  src = src.replace(helperAnchor, HELPERS + helperAnchor)
}

if (hadCrlf) src = src.replace(/\n/g, "\r\n")
fs.writeFileSync(file, src)
console.log("Wrote", file)
