/** CTR and VCR ranks ignore creatives below this impression floor. They stay in the list. */
export const CREATIVE_RATE_MIN_IMPRESSIONS = 1_000

export type RankMetric = "impressions" | "ctr" | "vcr"

export type CreativeFormatKind = "video" | "image" | "carousel"

export type CreativeFormatHint = {
  kind: CreativeFormatKind | null
  aspect: string | null
}

export type CreativeDailyRow = {
  platform: string
  creativeKey: string
  creativeName: string | null
  lineItemId: string | null
  date: string
  spend: number | null
  impressions: number
  clicks: number
  viewableImpressions: number | null
  videoViews: number | null
  videoCompletions: number | null
  conversions: number | null
}

export type PlanLineHint = {
  label: string
  size: string | null
}

export type CreativePerformanceRow = {
  platform: string
  creativeKey: string
  name: string | null
  lineItemId: string | null
  lineLabel: string | null
  format: CreativeFormatHint
  spend: number | null
  impressions: number
  clicks: number
  ctr: number | null
  cpm: number | null
  viewableRate: number | null
  vcr: number | null
  conversions: number | null
  firstDate: string
  lastDate: string
  preview: { status: "none" }
  rank: number | null
}

function field(row: Record<string, unknown>, name: string): unknown {
  if (name in row) return row[name]
  const upper = name.toUpperCase()
  if (upper in row) return row[upper]
  return undefined
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function text(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s || null
}

function dateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const s = text(value)
  const match = s?.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? null
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}

/** Kind from the creative name and an optional size string. Aspect from a ratio or pixel size. */
export function formatHint(name: string | null, size: string | null): CreativeFormatHint {
  const textBlob = `${name ?? ""} ${size ?? ""}`
  let kind: CreativeFormatKind | null = null
  if (/carousel/i.test(textBlob)) kind = "carousel"
  else if (/video|\breel\b|\d+\s*s(?:ec)?\b|:\d{2}\b|\.mp4\b/i.test(textBlob)) kind = "video"
  else if (/\bimage\b|\bstatic\b|\.jpe?g\b|\.png\b|\.gif\b/i.test(textBlob)) kind = "image"

  const ratio = textBlob.match(/\b(1:1|4:5|9:16|16:9|2:3|3:2|4:3|3:4)\b/)
  if (ratio) return { kind, aspect: ratio[1] }

  const px = textBlob.match(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/i)
  if (!px) return { kind, aspect: null }
  const w = Number(px[1])
  const h = Number(px[2])
  const divisor = gcd(w, h)
  return { kind, aspect: `${w / divisor}:${h / divisor}` }
}

export function creativeRowsFromWarehouse(
  raw: Array<Record<string, unknown>>,
): CreativeDailyRow[] {
  const rows: CreativeDailyRow[] = []
  for (const row of raw) {
    const platform = text(field(row, "platform"))?.toLowerCase() ?? null
    const creativeKey = text(field(row, "creative_key"))
    const date = dateOnly(field(row, "date"))
    if (!platform || !creativeKey || !date) continue
    rows.push({
      platform,
      creativeKey,
      creativeName: text(field(row, "creative_name")),
      lineItemId: text(field(row, "line_item_id")),
      date,
      spend: num(field(row, "spend")),
      impressions: num(field(row, "impressions")) ?? 0,
      clicks: num(field(row, "clicks")) ?? 0,
      viewableImpressions: num(field(row, "viewable_impressions")),
      videoViews: num(field(row, "video_views")),
      videoCompletions: num(field(row, "video_completions")),
      conversions: num(field(row, "conversions")),
    })
  }
  return rows
}

type Acc = {
  platform: string
  creativeKey: string
  name: string | null
  nameDate: string
  lineItemId: string | null
  lineDate: string
  spend: number | null
  impressions: number
  clicks: number
  viewable: number | null
  videoViews: number | null
  videoCompletions: number | null
  conversions: number | null
  firstDate: string
  lastDate: string
}

function addNullable(current: number | null, next: number | null): number | null {
  if (next == null) return current
  return (current ?? 0) + next
}

function groupKey(platform: string, creativeKey: string): string {
  return `${platform}\0${creativeKey}`
}

function metricValue(
  row: { impressions: number; ctr: number | null; vcr: number | null },
  metric: RankMetric,
): number {
  if (metric === "impressions") return row.impressions
  if (metric === "ctr") return row.ctr ?? Number.NEGATIVE_INFINITY
  return row.vcr ?? Number.NEGATIVE_INFINITY
}

function eligible(
  row: { impressions: number; ctr: number | null; vcr: number | null },
  metric: RankMetric,
): boolean {
  if (metric === "impressions") return true
  if (row.impressions < CREATIVE_RATE_MIN_IMPRESSIONS) return false
  if (metric === "ctr") return row.ctr != null
  return row.vcr != null
}

export function groupAndRank(
  daily: CreativeDailyRow[],
  labels: ReadonlyMap<string, PlanLineHint>,
  sort: RankMetric,
): CreativePerformanceRow[] {
  const groups = new Map<string, Acc>()
  for (const row of daily) {
    const key = groupKey(row.platform, row.creativeKey)
    let acc = groups.get(key)
    if (!acc) {
      acc = {
        platform: row.platform,
        creativeKey: row.creativeKey,
        name: row.creativeName,
        nameDate: row.creativeName ? row.date : "",
        lineItemId: row.lineItemId,
        lineDate: row.lineItemId ? row.date : "",
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        viewable: row.viewableImpressions,
        videoViews: row.videoViews,
        videoCompletions: row.videoCompletions,
        conversions: row.conversions,
        firstDate: row.date,
        lastDate: row.date,
      }
      groups.set(key, acc)
      continue
    }
    acc.impressions += row.impressions
    acc.clicks += row.clicks
    acc.spend = addNullable(acc.spend, row.spend)
    acc.viewable = addNullable(acc.viewable, row.viewableImpressions)
    acc.videoViews = addNullable(acc.videoViews, row.videoViews)
    acc.videoCompletions = addNullable(acc.videoCompletions, row.videoCompletions)
    acc.conversions = addNullable(acc.conversions, row.conversions)
    if (row.date < acc.firstDate) acc.firstDate = row.date
    if (row.date > acc.lastDate) acc.lastDate = row.date
    if (row.creativeName && row.date >= acc.nameDate) {
      acc.name = row.creativeName
      acc.nameDate = row.date
    }
    if (row.lineItemId && row.date >= acc.lineDate) {
      acc.lineItemId = row.lineItemId
      acc.lineDate = row.date
    }
  }

  const built: CreativePerformanceRow[] = []
  for (const acc of groups.values()) {
    const hint = acc.lineItemId
      ? labels.get(acc.lineItemId.trim().toLowerCase()) ?? null
      : null
    const impressions = acc.impressions
    const ctr = impressions > 0 ? acc.clicks / impressions : null
    const cpm =
      acc.spend != null && impressions > 0 ? (acc.spend / impressions) * 1000 : null
    const viewableRate =
      acc.viewable != null && impressions > 0 ? acc.viewable / impressions : null
    const vcr =
      acc.videoViews != null && acc.videoViews > 0 && acc.videoCompletions != null
        ? acc.videoCompletions / acc.videoViews
        : null
    built.push({
      platform: acc.platform,
      creativeKey: acc.creativeKey,
      name: acc.name,
      lineItemId: acc.lineItemId,
      lineLabel: hint?.label ?? null,
      format: formatHint(acc.name, hint?.size ?? null),
      spend: acc.spend,
      impressions,
      clicks: acc.clicks,
      ctr,
      cpm,
      viewableRate,
      vcr,
      conversions: acc.conversions,
      firstDate: acc.firstDate,
      lastDate: acc.lastDate,
      preview: { status: "none" },
      rank: null,
    })
  }

  const ranked = built
    .filter((row) => eligible(row, sort))
    .toSorted((a, b) => {
      const delta = metricValue(b, sort) - metricValue(a, sort)
      if (delta !== 0) return delta
      const platform = a.platform.localeCompare(b.platform)
      if (platform !== 0) return platform
      return a.creativeKey.localeCompare(b.creativeKey)
    })
  const rankByKey = new Map(
    ranked.map((row, index) => [groupKey(row.platform, row.creativeKey), index + 1]),
  )
  for (const row of built) {
    row.rank = rankByKey.get(groupKey(row.platform, row.creativeKey)) ?? null
  }

  return built.toSorted((a, b) => {
    if (a.rank == null && b.rank == null) {
      const platform = a.platform.localeCompare(b.platform)
      if (platform !== 0) return platform
      return a.creativeKey.localeCompare(b.creativeKey)
    }
    if (a.rank == null) return 1
    if (b.rank == null) return -1
    return a.rank - b.rank
  })
}
