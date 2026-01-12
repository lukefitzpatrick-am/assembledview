import { NextRequest, NextResponse } from "next/server"
import { getSocialMediaLineItemsByMBA } from "@/lib/api"
import { querySnowflake } from "@/lib/snowflake/client"

export const revalidate = 86400

type Burst = {
  start_date: string
  end_date: string
  media_investment: number
  deliverables: number
}

type SocialLineItem = {
  line_item_id: string
  line_item?: number
  platform?: string
  buy_type: string
  bursts_json?: Burst[] | string
  fixed_cost_media?: boolean
  creative_targeting?: string
  creative?: string
}

type SnowflakeRow = {
  DATE: string
  AD_SET_NAME: string
  LINE_ITEM_ID: string
  AMOUNT_SPENT: number
  IMPRESSIONS: number
  CLICKS: number
  RESULTS: number
  VIDEO_3S_VIEWS: number
}

function parseBursts(raw: Burst[] | string | undefined): Burst[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function getDateRange(bursts: Burst[]) {
  let start: string | null = null
  let end: string | null = null

  bursts.forEach((burst) => {
    if (!start || burst.start_date < start) start = burst.start_date
    if (!end || burst.end_date > end) end = burst.end_date
  })

  return { start, end }
}

function aggregateActuals(rows: SnowflakeRow[]) {
  const dailyMap = new Map<
    string,
    {
      date: string
      spend: number
      impressions: number
      clicks: number
      results: number
      video_3s_views: number
    }
  >()

  rows.forEach((row) => {
    const key = row.DATE
    const existing = dailyMap.get(key) ?? {
      date: row.DATE,
      spend: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      video_3s_views: 0,
    }

    dailyMap.set(key, {
      date: row.DATE,
      spend: existing.spend + (row.AMOUNT_SPENT || 0),
      impressions: existing.impressions + (row.IMPRESSIONS || 0),
      clicks: existing.clicks + (row.CLICKS || 0),
      results: existing.results + (row.RESULTS || 0),
      video_3s_views: existing.video_3s_views + (row.VIDEO_3S_VIEWS || 0),
    })
  })

  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function buildAdSetRows(rows: SnowflakeRow[]) {
  return rows.map((row) => ({
    date: row.DATE,
    ad_set_name: row.AD_SET_NAME,
    spend: row.AMOUNT_SPENT || 0,
    impressions: row.IMPRESSIONS || 0,
    clicks: row.CLICKS || 0,
    results: row.RESULTS || 0,
    video_3s_views: row.VIDEO_3S_VIEWS || 0,
  }))
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const mbaSlug = searchParams.get("mbaSlug")
    const clientSlug = searchParams.get("clientSlug")

    if (!mbaSlug || !clientSlug) {
      return NextResponse.json({ error: "Missing mbaSlug or clientSlug" }, { status: 400 })
    }

    const socialItems = await getSocialMediaLineItemsByMBA(mbaSlug)
    const metaItems = (socialItems || []).filter((item: SocialLineItem) =>
      (item.platform || "").toLowerCase().includes("meta")
    )

    if (!metaItems.length) {
      return respond({ lineItems: [] })
    }

    const parsedItems = metaItems.map((item) => {
      const bursts = parseBursts(item.bursts_json)
      const { start, end } = getDateRange(bursts)
      return {
        ...item,
        bursts,
        dateRange: { start, end },
      }
    })

    const lineItemIds = parsedItems
      .map((item) => item.line_item_id)
      .filter(Boolean)
    const startDates = parsedItems.map((item) => item.dateRange.start).filter(Boolean) as string[]
    const endDates = parsedItems.map((item) => item.dateRange.end).filter(Boolean) as string[]

    const minStart = startDates.length ? startDates.sort()[0] : null
    const maxEnd = endDates.length ? endDates.sort().slice(-1)[0] : null

    let snowflakeRows: SnowflakeRow[] = []

    if (lineItemIds.length && minStart && maxEnd) {
      const placeholders = lineItemIds.map(() => "?").join(", ")
      const sql = `
        SELECT
          date AS DATE,
          ad_set_name AS AD_SET_NAME,
          line_item_id AS LINE_ITEM_ID,
          amount_spent AS AMOUNT_SPENT,
          impressions AS IMPRESSIONS,
          clicks AS CLICKS,
          results AS RESULTS,
          video_3s_views AS VIDEO_3S_VIEWS
        FROM ASSEMBLEDVIEW.MART.META_ADSET_DAILY
        WHERE line_item_id IN (${placeholders})
          AND date BETWEEN ? AND ?
        ORDER BY date ASC;
      `

      const binds = [...lineItemIds, minStart, maxEnd]
      snowflakeRows = await querySnowflake<SnowflakeRow>(sql, binds)
    }

    const byLineItem = new Map<string, SnowflakeRow[]>()
    snowflakeRows.forEach((row) => {
      const key = row.LINE_ITEM_ID
      byLineItem.set(key, [...(byLineItem.get(key) ?? []), row])
    })

    const response = {
      lineItems: parsedItems.map((item) => {
        const rows = byLineItem.get(item.line_item_id) ?? []
        return {
          line_item_id: item.line_item_id,
          line_item_name:
            item.creative_targeting ||
            item.creative ||
            item.platform ||
            item.line_item_id,
          buy_type: item.buy_type,
          bursts: item.bursts,
          fixed_cost_media: item.fixed_cost_media ?? false,
          actualsDaily: aggregateActuals(rows),
          adSetRows: buildAdSetRows(rows),
        }
      }),
    }

    return respond(response)
  } catch (error) {
    console.error("[meta pacing]", error)
    return NextResponse.json({ error: "Failed to load Meta pacing data" }, { status: 500 })
  }
}

function respond(data: unknown) {
  return NextResponse.json(data, {
    status: 200,
    headers: {
      "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600",
    },
  })
}
