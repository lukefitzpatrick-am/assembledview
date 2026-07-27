import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles, getUserMbaNumbers } from "@/lib/rbac"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
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

function emptyMetaResponse(
  limit: number,
  filters: { mbaNumber: string | null; startDate: string | null; endDate: string | null },
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ rows: [], limit, filters, ...extra })
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    let mbaNumber = searchParams.get("mbaNumber")?.trim() || null
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const limit = clampLimit(searchParams.get("limit"))
    const filters = { mbaNumber, startDate, endDate }

    const roles = getUserRoles(session.user)
    const isAdmin = roles.includes("admin")
    const isManager = roles.includes("manager")

    // AuthZ: no bare "return all" — tenant/MBA scope required except admin; clients must pass access check.
    if (roles.includes("client")) {
      if (!mbaNumber) return emptyMetaResponse(limit, filters)
      const access = await checkClientMbaAccess(request, mbaNumber)
      if (!access.ok) return access.response
    } else if (!isAdmin) {
      if (!isManager) return emptyMetaResponse(limit, filters)
      if (!mbaNumber) {
        const assigned = getUserMbaNumbers(session.user)
        if (assigned.length === 1) {
          mbaNumber = assigned[0]
          filters.mbaNumber = mbaNumber
        } else {
          // Fail closed: managers without a single MBA must not see the whole book.
          return emptyMetaResponse(limit, filters, {
            warning: assigned.length > 1 ? "mbaNumber is required when multiple MBAs are assigned" : undefined,
          })
        }
      } else {
        const assigned = getUserMbaNumbers(session.user)
        if (
          assigned.length > 0 &&
          !assigned.some((mba) => mba.toLowerCase() === mbaNumber!.toLowerCase())
        ) {
          return NextResponse.json({ error: "forbidden" }, { status: 403 })
        }
      }
    }

    const snowflakeState = isSnowflakeConfigured()
    if (!snowflakeState.ok) {
      console.warn("[api/delivery/meta-adset] Snowflake not configured, returning empty set", snowflakeState)
      return emptyMetaResponse(limit, filters, {
        warning: "Snowflake not configured; returning empty results",
      })
    }

    const sqlFilters: string[] = []
    const binds: unknown[] = []

    if (mbaNumber) {
      sqlFilters.push(`LOWER("ADSET_NAME") LIKE ?`)
      binds.push(`%${mbaNumber.toLowerCase()}%`)
    } else if (!isAdmin) {
      return emptyMetaResponse(limit, filters)
    }

    if (startDate) {
      sqlFilters.push(`"DATE" >= ?`)
      binds.push(startDate)
    }
    if (endDate) {
      sqlFilters.push(`"DATE" <= ?`)
      binds.push(endDate)
    }

    const whereClause = sqlFilters.length ? `WHERE ${sqlFilters.join(" AND ")}` : ""

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
      filters: { mbaNumber, startDate, endDate },
    })
  } catch (err: unknown) {
    console.error("[api/delivery/meta-adset]", err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: "Failed to fetch Meta delivery rows", message },
      { status: 500 }
    )
  }
}
