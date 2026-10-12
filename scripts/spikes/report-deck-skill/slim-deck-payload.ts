/**
 * Deck input for the report-deck spike. The app keeps the full assembled
 * report. This copy keeps the figures the deck prints and drops day-level rows.
 */

const MAX_BYTES = 25_000
const DATE_KEYS = ["date", "day", "iso", "dateISO"] as const
const NUMERIC_KEYS = ["spend", "impressions", "clicks", "results", "views", "videoViews3s"] as const

type JsonRecord = Record<string, unknown>

export type WeeklyPoint = {
  weekStart: string
  channel?: string
  spend?: number
  impressions?: number
  clicks?: number
  results?: number
  views?: number
  videoViews3s?: number
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function dateOf(row: JsonRecord): string | null {
  for (const key of DATE_KEYS) {
    const value = row[key]
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  }
  return null
}

function isDailyRow(value: unknown): value is JsonRecord {
  if (!isRecord(value)) return false
  if (!dateOf(value)) return false
  return NUMERIC_KEYS.some((key) => typeof value[key] === "number" && Number.isFinite(value[key]))
}

function isDailyArray(value: unknown): value is JsonRecord[] {
  return Array.isArray(value) && value.length > 0 && value.every(isDailyRow)
}

function weekStartMonday(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - weekday + 1)
  return date.toISOString().slice(0, 10)
}

function channelName(node: JsonRecord): string | undefined {
  if (typeof node.label === "string" && node.label) return node.label
  if (typeof node.group === "string" && node.group) return node.group
  return undefined
}

function collectWeekly(node: unknown, channel: string | undefined, buckets: Map<string, WeeklyPoint>): void {
  if (isDailyArray(node)) {
    for (const row of node) addDailyRow(buckets, row, channel)
    return
  }
  if (Array.isArray(node)) {
    for (const item of node) collectWeekly(item, channel, buckets)
    return
  }
  if (!isRecord(node)) return
  const next = channelName(node) ?? channel
  for (const value of Object.values(node)) collectWeekly(value, next, buckets)
}

function addDailyRow(buckets: Map<string, WeeklyPoint>, row: JsonRecord, channel: string | undefined): void {
  const day = dateOf(row)
  if (!day) return
  const weekStart = weekStartMonday(day)
  const key = `${weekStart}\t${channel ?? ""}`
  const bucket = buckets.get(key) ?? { weekStart, ...(channel ? { channel } : {}) }
  for (const metric of NUMERIC_KEYS) {
    const value = row[metric]
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    const current = bucket[metric]
    bucket[metric] = typeof current === "number" ? current + value : value
  }
  buckets.set(key, bucket)
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

export function slimDeckPayload(report: unknown): JsonRecord {
  if (!isRecord(report)) throw new Error("assembled report data is not an object")
  const channels = Array.isArray(report.channels) ? report.channels.map(slimChannel) : []
  const buckets = new Map<string, WeeklyPoint>()
  collectWeekly(report, undefined, buckets)
  const weekly = [...buckets.values()].sort((a, b) => {
    const byWeek = a.weekStart.localeCompare(b.weekStart)
    if (byWeek !== 0) return byWeek
    return (a.channel ?? "").localeCompare(b.channel ?? "")
  })
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
  if (weekly.length > 0) payload.weekly = weekly
  const bytes = Buffer.byteLength(JSON.stringify(payload))
  if (bytes > MAX_BYTES) {
    throw new Error(`slim deck payload is ${bytes} bytes, over the ${MAX_BYTES} byte cap`)
  }
  return payload
}
