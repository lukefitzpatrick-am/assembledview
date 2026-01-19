import { querySnowflake } from "@/lib/snowflake/query"

export type Dv360DailyRow = {
  date: string
  lineItem?: string | null
  insertionOrder?: string | null
  spend: number
  impressions: number
  clicks: number
  conversions: number
  matchedPostfix?: string | null
}

export type Dv360Totals = {
  spend: number
  impressions: number
  clicks: number
  conversions: number
}

export type Dv360PacingResult = {
  daily: Dv360DailyRow[]
  totals: Dv360Totals
  dateSeries: string[]
}

type MartTable = "DV360DISPLAYPACING" | "DV360VIDEOPACING"

function normalizeDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

function toISO(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function buildSeries(startISO: string | null, endISO: string | null): string[] {
  if (!startISO || !endISO) return []
  const start = normalizeDate(startISO)
  const end = normalizeDate(endISO)
  if (!start || !end || end < start) return []

  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(toISO(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function zeroTotals(): Dv360Totals {
  return { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
}

export async function queryDv360Pacing(
  martTable: MartTable,
  startDate: string | undefined,
  endDate: string | undefined,
  postfixes: string[]
): Promise<Dv360PacingResult> {
  const startISO = normalizeDate(startDate)?.toISOString().slice(0, 10) ?? null
  const endISO = normalizeDate(endDate)?.toISOString().slice(0, 10) ?? null
  const dateSeries = buildSeries(startISO, endISO)

  if (!postfixes.length || !startISO || !endISO) {
    return { daily: [], totals: zeroTotals(), dateSeries }
  }

  let cappedPostfixes = postfixes
  if (postfixes.length > 500) {
    console.warn("[dv360 pacing] postfixes truncated to 500")
    cappedPostfixes = postfixes.slice(0, 500)
  }

  const lowerPostfixes = cappedPostfixes.map((p) => String(p).toLowerCase())

  const sql = `
    WITH ids AS (
      SELECT LOWER(value::string) AS postfix
      FROM TABLE(FLATTEN(input => PARSE_JSON(?)))
    ),
    src AS (
      SELECT
        DATE::DATE AS DATE_DAY,
        LINE_ITEM,
        INSERTION_ORDER,
        SPEND,
        IMPRESSIONS,
        CLICKS,
        COALESCE(TOTAL_CONVERSIONS, 0) AS CONVERSIONS,
        LOWER(REGEXP_SUBSTR(LINE_ITEM, '([a-z0-9]+)$')) AS LINE_ITEM_SUFFIX,
        LOWER(REGEXP_SUBSTR(CAST(INSERTION_ORDER AS VARCHAR), '([a-z0-9]+)$')) AS IO_SUFFIX
      FROM ASSEMBLEDVIEW.MART.${martTable}
      WHERE DATE BETWEEN TO_DATE(?) AND TO_DATE(?)
    ),
    matched AS (
      SELECT
        s.DATE_DAY,
        s.LINE_ITEM,
        s.INSERTION_ORDER,
        s.SPEND,
        s.IMPRESSIONS,
        s.CLICKS,
        s.CONVERSIONS,
        i.postfix AS MATCHED_POSTFIX
      FROM src s
      JOIN ids i
        ON (s.LINE_ITEM_SUFFIX = i.postfix OR s.IO_SUFFIX = i.postfix)
    )
    SELECT
      DATE_DAY,
      ANY_VALUE(LINE_ITEM) AS LINE_ITEM,
      ANY_VALUE(INSERTION_ORDER) AS INSERTION_ORDER,
      SUM(SPEND) AS SPEND,
      SUM(IMPRESSIONS) AS IMPRESSIONS,
      SUM(CLICKS) AS CLICKS,
      SUM(CONVERSIONS) AS CONVERSIONS,
      MATCHED_POSTFIX
    FROM matched
    GROUP BY DATE_DAY, MATCHED_POSTFIX
    ORDER BY DATE_DAY ASC
    LIMIT 50000
  `

  const rows = await querySnowflake<{
    DATE_DAY: string
    LINE_ITEM: string | null
    INSERTION_ORDER: string | null
    SPEND: number | null
    IMPRESSIONS: number | null
    CLICKS: number | null
    CONVERSIONS: number | null
    MATCHED_POSTFIX: string | null
  }>(sql, [JSON.stringify(lowerPostfixes), startISO, endISO])

  const rawDaily = rows.map((row) => ({
    date: row.DATE_DAY,
    lineItem: row.LINE_ITEM ?? null,
    insertionOrder: row.INSERTION_ORDER ?? null,
    spend: Number(row.SPEND ?? 0),
    impressions: Number(row.IMPRESSIONS ?? 0),
    clicks: Number(row.CLICKS ?? 0),
    conversions: Number(row.CONVERSIONS ?? 0),
    matchedPostfix: row.MATCHED_POSTFIX ?? null,
  }))

  if (!dateSeries.length || !lowerPostfixes.length) {
    const totals = rawDaily.reduce(
      (acc, row) => ({
        spend: acc.spend + row.spend,
        impressions: acc.impressions + row.impressions,
        clicks: acc.clicks + row.clicks,
        conversions: acc.conversions + row.conversions,
      }),
      zeroTotals()
    )

    return { daily: rawDaily, totals, dateSeries }
  }

  const grouped = new Map<string | null, Map<string, Dv360DailyRow>>()
  rawDaily.forEach((row) => {
    const key = row.matchedPostfix ?? null
    if (!grouped.has(key)) grouped.set(key, new Map())
    grouped.get(key)!.set(row.date, row)
  })

  const filledDaily: Dv360DailyRow[] = []

  lowerPostfixes.forEach((postfix) => {
    const lookup = grouped.get(postfix) ?? new Map<string, Dv360DailyRow>()
    dateSeries.forEach((date) => {
      const existing = lookup.get(date)
      filledDaily.push(
        existing ?? {
          date,
          lineItem: null,
          insertionOrder: null,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          matchedPostfix: postfix,
        }
      )
    })
  })

  // Include any unmatched/null postfix rows as-is to avoid data loss.
  const nullGroup = grouped.get(null)
  if (nullGroup) {
    dateSeries.forEach((date) => {
      const existing = nullGroup.get(date)
      if (existing) {
        filledDaily.push(existing)
      }
    })
  }

  const totals = filledDaily.reduce(
    (acc, row) => ({
      spend: acc.spend + row.spend,
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      conversions: acc.conversions + row.conversions,
    }),
    zeroTotals()
  )

  return { daily: filledDaily, totals, dateSeries }
}
