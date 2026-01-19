import { NextRequest, NextResponse } from "next/server"
import { querySnowflake } from "@/lib/snowflake/query"

export const dynamic = "force-dynamic"
export const revalidate = 0

type Row = {
  DATE: string
  ADSET_NAME: string
  CAMPAIGN_NAME?: string
  SPEND?: number
  AMOUNT_SPENT?: number
  IMPRESSIONS?: number
  INLINE_LINK_CLICKS?: number
  CLICKS?: number
  RESULTS?: number
  VIDEO_3S_VIEWS?: number
}

function clampLimit(raw: string | null) {
  const parsed = Number(raw ?? "1000")
  if (!Number.isFinite(parsed)) return 1000
  return Math.min(Math.max(parsed, 1), 5000)
}

function isSnowflakeConfigured() {
  const required = [
    "SNOWFLAKE_ACCOUNT",
    "SNOWFLAKE_USERNAME",
    "SNOWFLAKE_ROLE",
    "SNOWFLAKE_WAREHOUSE",
    "SNOWFLAKE_DATABASE",
    "SNOWFLAKE_SCHEMA",
  ]
  const hasKey = Boolean(process.env.SNOWFLAKE_PRIVATE_KEY || process.env.SNOWFLAKE_PRIVATE_KEY_PATH)
  const missing = required.filter((key) => !process.env[key])
  return { ok: missing.length === 0 && hasKey, missing, hasKey }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mbaNumber = searchParams.get("mbaNumber")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const limit = clampLimit(searchParams.get("limit"))

    const snowflakeState = isSnowflakeConfigured()
    if (!snowflakeState.ok) {
      console.warn("[api/delivery/meta-adset] Snowflake not configured, returning empty set", snowflakeState)
      return NextResponse.json({
        rows: [],
        limit,
        filters: { mbaNumber, startDate, endDate },
        warning: "Snowflake not configured; returning empty results",
      })
    }

    const filters: string[] = []
    const binds: any[] = []

    if (mbaNumber) {
      filters.push(`LOWER("ADSET_NAME") LIKE ?`)
      binds.push(`%${mbaNumber.toLowerCase()}%`)
    }
    if (startDate) {
      filters.push(`"DATE" >= ?`)
      binds.push(startDate)
    }
    if (endDate) {
      filters.push(`"DATE" <= ?`)
      binds.push(endDate)
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : ""

    const sql = `
      SELECT
        "DATE",
        "ADSET_NAME",
        "CAMPAIGN_NAME",
        "SPEND",
        "IMPRESSIONS",
        "INLINE_LINK_CLICKS",
        "CLICKS",
        "RESULTS",
        "VIDEO_3S_VIEWS"
      FROM ASSEMBLEDVIEW.MART.META_BASIC_AD_SET_TEST
      ${whereClause}
      ORDER BY "DATE" DESC
      LIMIT ?
    `

    const rows = await querySnowflake<Row>(sql, [...binds, limit])

    return NextResponse.json({
      rows,
      limit,
      filters: {
        mbaNumber,
        startDate,
        endDate,
      },
    })
  } catch (err: any) {
    console.error("[api/delivery/meta-adset]", err)
    const message = err?.message ?? String(err)
    return NextResponse.json(
      {
        error: "Failed to fetch Meta delivery rows",
        message,
      },
      { status: 500 }
    )
  }
}
