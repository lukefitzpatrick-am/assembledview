import { NextResponse } from "next/server"

import { querySnowflake } from "@/lib/snowflake/query"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limitRaw = Number(searchParams.get("limit") ?? "500")
    const limit = Math.min(Math.max(limitRaw, 1), 2000)

    const sql = `
      SELECT
        "DATE",
        "IMPRESSIONS",
        "INLINE_LINK_CLICKS",
        "REACH",
        "COST_PER_INLINE_LINK_CLICK",
        "CPC",
        "CPM",
        "CTR",
        "FREQUENCY",
        "SPEND",
        "ADSET_NAME",
        "CAMPAIGN_NAME",
        "INLINE_LINK_CLICK_CTR",
        "_FIVETRAN_SYNCED"
      FROM ASSEMBLEDVIEW.MART.META_BASIC_AD_SET_TEST
      ORDER BY "DATE" DESC
      LIMIT ?
    `

    const rows = await querySnowflake<any>(sql, [limit])
    return NextResponse.json({ rows, limit, orderBy: "DATE" })
  } catch (err: any) {
    console.error("meta-basic-ad-set API error:", err)
    return NextResponse.json(
      {
        error: "meta-basic-ad-set failed",
        message: err?.message ?? String(err),
        stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
      },
      { status: 500 }
    )
  }
}
