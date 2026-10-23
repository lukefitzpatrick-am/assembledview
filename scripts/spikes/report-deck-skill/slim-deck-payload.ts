/**
 * Deck input for the report-deck spike. The app keeps the full assembled
 * report. This copy keeps the figures the deck prints, and copies `charts`
 * after formatting so point numbers stay numbers.
 */

const MAX_BYTES = 80_000

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function slimScalars(value: unknown): JsonRecord {
  if (!isRecord(value)) return {}
  const out: JsonRecord = {}
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) continue
    if (isRecord(child)) {
      const nested = slimScalars(child)
      if (Object.keys(nested).length > 0) out[key] = nested
      continue
    }
    out[key] = child
  }
  return out
}

function slimChannel(value: unknown): JsonRecord {
  return slimScalars(value)
}

const MONEY_KEYS = new Set([
  "plannedBudget",
  "spend",
  "previousSpend",
  "expectedSpendToDate",
  "rateExcludedSpend",
  "cpm",
  "cpc",
  "cpa",
  "cpv",
  "cpr",
  // A channel's plan CPV (the CPV target). Only on channels with CPV-bought lines.
  "planCpvTarget",
  // CF5 conversions: revenue and the spend it is measured against.
  "revenue",
])
const COUNT_KEYS = new Set([
  "impressions",
  "clicks",
  "results",
  "conversions",
  "views",
  "videoViews3s",
  "plannedImpressions",
  "plannedClicks",
  "plannedViews",
  "previousImpressions",
  "versionNumber",
  // CF5 conversions: the headline count and its parts.
  "count",
  "purchases",
  "leads",
])
const PERCENT_KEYS = new Set(["timeElapsedPct", "ctr"])
const PACE_PERCENT_KEYS = new Set(["spendPacePct"])
const METRIC_KEYS = new Set([...MONEY_KEYS, ...COUNT_KEYS, ...PERCENT_KEYS, ...PACE_PERCENT_KEYS])

function grouped(n: number, digits: number): string {
  const negative = n < 0
  const [whole, frac] = Math.abs(n).toFixed(digits).split(".")
  const body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const text = frac ? `${body}.${frac}` : body
  return negative ? `-${text}` : text
}

/** AUD, 2 dp, thousands separators. */
export function formatDeckMoney(value: number): string {
  return `$${grouped(value, 2)}`
}

/** Thousands separators. Results, conversions, clicks and impressions are whole numbers. */
export function formatDeckCount(value: number): string {
  return grouped(Math.round(value), 0)
}

/** A 0–1 fraction as a percent with 2 dp. CTR, conversion rate and VTR stay here. */
export function formatDeckPercent(value: number): string {
  return `${grouped(value * 100, 2)}%`
}

/** A 0–1 pace fraction as a whole-number percent. 0.3485 is 35%. 1.1616 is 116%. */
export function formatDeckPacePercent(value: number): string {
  return `${grouped(value * 100, 0)}%`
}

/** A ratio kept as a grouped number, without a new unit. */
export function formatDeckRatio(value: number): string {
  const digits = Number.isInteger(value) ? 0 : 2
  return grouped(value, digits)
}

export function formatDeckNumber(key: string, value: number): string {
  if (MONEY_KEYS.has(key)) return formatDeckMoney(value)
  if (COUNT_KEYS.has(key)) return formatDeckCount(value)
  if (PACE_PERCENT_KEYS.has(key)) return formatDeckPacePercent(value)
  if (PERCENT_KEYS.has(key)) return formatDeckPercent(value)
  return formatDeckRatio(value)
}

/** Frequency targets keep the unit. "1" becomes "1.0 frequency". */
export function formatFrequencyTarget(display: string): string {
  const trimmed = display.trim()
  if (/frequency/i.test(trimmed)) return trimmed
  const value = Number(trimmed.replace(/,/g, ""))
  if (!Number.isFinite(value)) return trimmed
  return `${grouped(value, 1)} frequency`
}

function formatKpi(value: JsonRecord): JsonRecord {
  const out: JsonRecord = { ...value }
  const metric = typeof value.metric === "string" ? value.metric : ""
  if (metric === "frequency" && typeof value.targetDisplay === "string") {
    out.targetDisplay = formatFrequencyTarget(value.targetDisplay)
  }
  if (value.actualDisplay == null || value.actualDisplay === "") {
    out.actualDisplay = "Not yet reported"
  }
  if (value.targetDisplay == null || value.targetDisplay === "") {
    out.targetDisplay = "Not yet reported"
  }
  return out
}

function formatNode(key: string | null, value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatDeckNumber(key ?? "", value)
  }
  if (value == null && key && METRIC_KEYS.has(key)) return "Not yet reported"
  if (Array.isArray(value)) return value.map((item) => formatNode(null, item))
  if (!isRecord(value)) return value
  if (typeof value.metric === "string" && ("targetDisplay" in value || "actualDisplay" in value)) {
    return formatKpi(value)
  }
  const out: JsonRecord = {}
  for (const [childKey, child] of Object.entries(value)) {
    out[childKey] = formatNode(childKey, child)
  }
  return out
}

const AUDIENCE_GROUPS = new Set(["social_meta", "social_tiktok"])
const AUDIENCE_MIN_SHARE = 0.05
const AUDIENCE_MIN_COUNT = 2
const AUDIENCE_MAX_COUNT = 4

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * Meta ad sets and TikTok ad groups for the deck. Input rows are the
 * ad-set breakdown `aggregateSocialForLineItem` already sorts by spend
 * descending. This applies that same order, then keeps the top 2–4 that
 * are at least 5% of the channel's spend.
 */
function audiencesForChannel(channel: JsonRecord): JsonRecord[] | null {
  const group = typeof channel.group === "string" ? channel.group : ""
  if (!AUDIENCE_GROUPS.has(group)) return null
  if (!Array.isArray(channel.adSets)) return null

  const rows = channel.adSets.flatMap((item) => {
    if (!isRecord(item)) return []
    const name =
      typeof item.entityName === "string"
        ? item.entityName
        : typeof item.name === "string"
          ? item.name
          : ""
    const spend = finiteNumber(item.spend) ?? 0
    const impressions = finiteNumber(item.impressions) ?? 0
    const results = finiteNumber(item.results) ?? 0
    const clicks = finiteNumber(item.clicks)
    const storedCtr = finiteNumber(item.ctr)
    const resultLabel = typeof item.resultLabel === "string" ? item.resultLabel : "Results"
    return [{ name, spend, impressions, results, clicks, storedCtr, resultLabel }]
  })

  const statedSpend = finiteNumber(channel.spend)
  const channelSpend =
    statedSpend != null && statedSpend > 0
      ? statedSpend
      : rows.reduce((sum, row) => sum + row.spend, 0)
  if (!(channelSpend > 0)) return null

  // Same order as aggregateSocialForLineItem: spend descending.
  const ranked = [...rows].sort((a, b) => b.spend - a.spend)
  const qualified = ranked
    .filter((row) => row.spend >= channelSpend * AUDIENCE_MIN_SHARE)
    .slice(0, AUDIENCE_MAX_COUNT)
  if (qualified.length < AUDIENCE_MIN_COUNT) return null

  return qualified.map((row) => ({
    name: row.name,
    spend: row.spend,
    impressions: row.impressions,
    results: row.results,
    resultLabel: row.resultLabel,
    cpr: row.results > 0 ? row.spend / row.results : null,
    ctr:
      row.impressions > 0 && row.clicks != null
        ? row.clicks / row.impressions
        : row.storedCtr,
  }))
}

function deckAudiences(channels: unknown): JsonRecord[] {
  if (!Array.isArray(channels)) return []
  const out: JsonRecord[] = []
  for (const channel of channels) {
    if (!isRecord(channel)) continue
    const list = audiencesForChannel(channel)
    if (list) out.push(...list)
  }
  return out
}

function slimCommentary(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null
  const items = Array.isArray(value.items) ? value.items.map(slimScalars) : []
  const out: JsonRecord = {
    summary: typeof value.summary === "string" ? value.summary : "",
    items,
  }
  if (typeof value.coverPhotoId === "string") out.coverPhotoId = value.coverPhotoId
  return out
}

function formatDeckDetail(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.rows)) return []
    return [{
      group: entry.group,
      label: entry.label,
      level: entry.level,
      rankBy: entry.rankBy,
      total: entry.total,
      note: entry.note ?? null,
      rows: entry.rows.flatMap((row) => formatDetailRow(row)),
    }]
  })
}

function formatDetailRow(value: unknown): JsonRecord[] {
  if (!isRecord(value)) return []
  const impressions = finiteNumber(value.impressions)
  const clicks = finiteNumber(value.clicks)
  const results = finiteNumber(value.results)
  const ctr = finiteNumber(value.ctr)
  const spend = finiteNumber(value.spend)
  const row: JsonRecord = {
    name: typeof value.name === "string" ? value.name : "",
  }
  if (value.spend != null) {
    row.spend = spend == null ? "Not yet reported" : formatDeckMoney(spend)
  }
  row.impressions = impressions == null ? "Not yet reported" : formatDeckCount(impressions)
  row.clicks = clicks == null ? "Not yet reported" : formatDeckCount(clicks)
  row.results = results == null ? "Not yet reported" : formatDeckCount(results)
  row.ctr = ctr == null ? "Not yet reported" : formatDeckPercent(ctr)
  return [row]
}

function formatCreativeRow(value: unknown): JsonRecord[] {
  if (!isRecord(value)) return []
  const text = (field: unknown) => (typeof field === "string" && field.trim() ? field.trim() : null)
  const impressions = finiteNumber(value.impressions)
  const clicks = finiteNumber(value.clicks)
  const ctr = finiteNumber(value.ctr)
  const spend = finiteNumber(value.spend)
  const row: JsonRecord = {
    name: text(value.name) ?? "Untitled ad",
    platform: text(value.platform) ?? "",
    adSet: text(value.adSet),
    kind: value.kind === "video" || value.kind === "image" ? value.kind : null,
    imageFile: text(value.imageFile),
    viewUrl: text(value.viewUrl),
  }
  if (spend != null) row.spend = formatDeckMoney(spend)
  row.impressions = impressions == null ? "Not yet reported" : formatDeckCount(impressions)
  row.clicks = clicks == null ? "Not yet reported" : formatDeckCount(clicks)
  row.ctr = ctr == null ? "Not yet reported" : formatDeckPercent(ctr)
  return [row]
}

/** report.creatives (lib/reports/deckCreative) as formatted strings; null when there are none. */
export function formatDeckCreatives(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null
  const campaign = Array.isArray(value.campaign) ? value.campaign.flatMap(formatCreativeRow) : []
  if (campaign.length === 0) return null
  const lines = Array.isArray(value.lines)
    ? value.lines.flatMap((line) => {
        if (!isRecord(line) || !Array.isArray(line.rows)) return []
        const rows = line.rows.flatMap(formatCreativeRow)
        if (rows.length === 0) return []
        return [{
          lineItemId: typeof line.lineItemId === "string" ? line.lineItemId : "",
          label: typeof line.label === "string" ? line.label : "",
          rows,
        }]
      })
    : []
  return { campaign: { label: "Top creative", rows: campaign }, lines }
}

export function slimDeckPayload(report: unknown): JsonRecord {
  if (!isRecord(report)) throw new Error("assembled report data is not an object")
  const channels = Array.isArray(report.channels) ? report.channels.map(slimChannel) : []
  const payload: JsonRecord = {
    mbaNumber: report.mbaNumber,
    clientName: report.clientName,
    campaignName: report.campaignName,
    versionNumber: report.versionNumber ?? null,
    asOf: report.asOf,
    period: slimScalars(report.period),
    summary: slimScalars(report.totals),
    channels,
    notLive: channels
      .filter((channel) => channel.notLive === true)
      .map((channel) => ({
        group: channel.group,
        label: channel.label,
        plannedBudget: channel.plannedBudget,
        plannedStart: channel.plannedStart ?? null,
      })),
    kpis: Array.isArray(report.kpis) ? report.kpis.map(slimScalars) : [],
    commentary: report.commentary == null ? null : slimCommentary(report.commentary),
  }
  const audiences = deckAudiences(report.channels)
  if (audiences.length > 0) payload.audiences = audiences
  const formatted = formatNode(null, payload) as JsonRecord
  if (Array.isArray(report.charts)) formatted.charts = report.charts
  formatted.detailLevel = typeof report.detailLevel === "string" && report.detailLevel ? report.detailLevel : "channel"
  formatted.detail = formatDeckDetail(report.detail)
  // CF5: the client's conversion settings. Null when the switch is off. Set
  // after formatting so a null is not read as a missing count.
  formatted.conversions = isRecord(report.conversions) ? slimScalars(report.conversions) : null
  const creatives = formatDeckCreatives(report.creatives)
  if (creatives) formatted.creatives = creatives
  const bytes = Buffer.byteLength(JSON.stringify(formatted))
  if (bytes > MAX_BYTES) {
    throw new Error(`slim deck payload is ${bytes} bytes, over the ${MAX_BYTES} byte cap`)
  }
  return formatted
}
