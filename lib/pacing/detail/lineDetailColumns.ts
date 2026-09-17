import type { LineCardModel } from "@/lib/pacing/channel/lineCardTypes"

export type LineDetailColumnKey =
  | "line"
  | "channel"
  | "status"
  | "kpiStatus"
  | "spendPace"
  | "burstPace"
  | "spend"
  | "budget"
  | "burstSpend"
  | "burstBudget"
  | "remainingLine"
  | "perDayLeft"
  | "yesterday"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "conversions"
  | "views"
  | "bursts"
  | "lineStart"
  | "lineEnd"
  | "targeting"
  | "buyType"
  | "fixedCost"

export type LineDetailColumn = {
  key: LineDetailColumnKey
  label: string
  numeric: boolean
}

export const LINE_DETAIL_COLUMNS: LineDetailColumn[] = [
  { key: "line", label: "Line", numeric: false },
  { key: "channel", label: "Channel · platform", numeric: false },
  { key: "status", label: "Status", numeric: false },
  { key: "kpiStatus", label: "KPI status", numeric: false },
  { key: "spendPace", label: "Spend pace", numeric: true },
  { key: "burstPace", label: "Burst pace", numeric: true },
  { key: "spend", label: "Spend", numeric: true },
  { key: "budget", label: "Budget", numeric: true },
  { key: "burstSpend", label: "Burst spend", numeric: true },
  { key: "burstBudget", label: "Burst budget", numeric: true },
  { key: "remainingLine", label: "Remaining line", numeric: true },
  { key: "perDayLeft", label: "Per-day left", numeric: true },
  { key: "yesterday", label: "Yesterday", numeric: true },
  { key: "impressions", label: "Impr.", numeric: true },
  { key: "clicks", label: "Clicks", numeric: true },
  { key: "ctr", label: "CTR", numeric: true },
  { key: "cpc", label: "CPC", numeric: true },
  { key: "cpm", label: "CPM", numeric: true },
  { key: "conversions", label: "Conv.", numeric: true },
  { key: "views", label: "Views", numeric: true },
  { key: "bursts", label: "Bursts", numeric: false },
  { key: "lineStart", label: "Line start", numeric: false },
  { key: "lineEnd", label: "Line end", numeric: false },
  { key: "targeting", label: "Targeting", numeric: false },
  { key: "buyType", label: "Buy type", numeric: false },
  { key: "fixedCost", label: "Fixed cost", numeric: false },
]

const ALWAYS_VISIBLE = new Set<LineDetailColumnKey>([
  "line",
  "channel",
  "status",
  "kpiStatus",
  "spendPace",
  "burstPace",
])

function hasValue(line: LineCardModel, key: LineDetailColumnKey): boolean {
  switch (key) {
    case "line":
      return Boolean(line.lineItemId)
    case "channel":
      return Boolean(line.channel || line.platform)
    case "status":
      return Boolean(line.pace)
    case "kpiStatus":
      return line.kpiStatus != null
    case "spendPace":
      return Number.isFinite(line.linePct)
    case "burstPace":
      return line.burstPct != null && Number.isFinite(line.burstPct)
    case "spend":
      return !line.verificationOnly && Number.isFinite(line.spend) && line.spend !== 0
    case "budget":
      return !line.verificationOnly && Number.isFinite(line.budget) && line.budget !== 0
    case "burstSpend":
      return line.burstSpend != null && line.burstSpend !== 0
    case "burstBudget":
      return line.burstBudget != null && line.burstBudget !== 0
    case "remainingLine":
      return Number.isFinite(line.remainingLine) && line.remainingLine !== 0
    case "perDayLeft":
      return line.perDayLeft != null && line.perDayLeft !== 0
    case "yesterday":
      return Number.isFinite(line.yesterday) && line.yesterday !== 0
    case "impressions":
      return line.impressions != null && line.impressions !== 0
    case "clicks":
      return line.clicks != null && line.clicks !== 0
    case "ctr":
      return line.ctr != null && Number.isFinite(line.ctr)
    case "cpc":
      return line.cpc != null && Number.isFinite(line.cpc)
    case "cpm":
      return line.cpm != null && Number.isFinite(line.cpm)
    case "conversions":
      return line.conversions != null && line.conversions !== 0
    case "views":
      return line.views != null && line.views !== 0
    case "bursts":
      return line.bursts.total > 0
    case "lineStart":
      return Boolean(line.lineStart)
    case "lineEnd":
      return Boolean(line.lineEnd)
    case "targeting":
      return Boolean(line.targeting)
    case "buyType":
      return Boolean(line.buyType)
    case "fixedCost":
      return line.fixedCost === true
    default: {
      const _exhaustive: never = key
      return _exhaustive
    }
  }
}

/** Identity columns always show. Optional columns show when any line has a value. */
export function visibleLineDetailColumns(lines: readonly LineCardModel[]): LineDetailColumn[] {
  return LINE_DETAIL_COLUMNS.filter(
    (column) => ALWAYS_VISIBLE.has(column.key) || lines.some((line) => hasValue(line, column.key)),
  )
}
