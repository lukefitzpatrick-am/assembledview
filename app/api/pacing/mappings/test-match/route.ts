import { NextRequest } from "next/server"
import { requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { fetchTestMatchRows } from "@/lib/pacing/pacingMart"
import type { PacingMatchType } from "@/lib/xano/pacing-types"

export const dynamic = "force-dynamic"
export const revalidate = 0

const MATCH: PacingMatchType[] = ["exact", "prefix", "regex", "suffix_id"]

export async function POST(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const platform = String(body.platform ?? "").trim()
    const matchType = String(body.match_type ?? "").trim() as PacingMatchType
    const startDate = String(body.start_date ?? "").trim()
    const endDate = String(body.end_date ?? "").trim()

    if (!platform || !startDate || !endDate) {
      return pacingJsonError("platform, start_date, end_date are required", 400)
    }
    if (!MATCH.includes(matchType)) {
      return pacingJsonError("invalid match_type", 400)
    }

    const matches = await fetchTestMatchRows({
      platform,
      matchType,
      campaignNamePattern:
        body.campaign_name_pattern === null || body.campaign_name_pattern === undefined
          ? null
          : String(body.campaign_name_pattern),
      groupNamePattern:
        body.group_name_pattern === null || body.group_name_pattern === undefined
          ? null
          : String(body.group_name_pattern),
      avLineItemCode:
        body.av_line_item_code === null || body.av_line_item_code === undefined
          ? null
          : String(body.av_line_item_code),
      startDate,
      endDate,
    })
    return pacingJsonOk({
      data: { match_count: matches.length, matches },
    })
  } catch (e) {
    console.error("[api/pacing/mappings/test-match]", e)
    return pacingJsonError(e instanceof Error ? e.message : "snowflake_error", 500)
  }
}
