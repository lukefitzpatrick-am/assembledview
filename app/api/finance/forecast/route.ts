import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserClientSlugs, getUserRoles } from "@/lib/rbac"
import {
  loadFinanceForecastDataset,
  normalizeScenario,
} from "@/lib/finance/forecast/server/loadFinanceForecastDataset"

export const dynamic = "force-dynamic"
export const revalidate = 0

function responseNoStore(payload: unknown, init?: ResponseInit) {
  const res = NextResponse.json(payload, init)
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}

/**
 * Finance Forecast reporting API — single round-trip for versions + clients + publishers,
 * then server-side `buildFinanceForecastDataset`.
 *
 * Query params:
 * - `fy` (required): financial year start calendar year (July = fy), e.g. 2025 → FY 2025–26
 * - `scenario` (required): `confirmed` | `confirmed_plus_probable`
 * - `client` (optional): filter by client id, slug, or display name (same normalisation as finance utils)
 * - `q` or `search` (optional): case-insensitive substring on MBA, campaign name, client name on versions
 * - `debug=1` (optional): include `FinanceForecastLine.debug` on each row; omitted when off (source kept)
 */
export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return responseNoStore({ error: "unauthorised" }, { status: 401 })
  }

  const roles = getUserRoles(session.user)
  if (roles.includes("client")) {
    return responseNoStore(
      { error: "forbidden", reason: "client-role", message: "Finance Forecast is not available for client-role users." },
      { status: 403 }
    )
  }

  const sp = request.nextUrl.searchParams
  const fyRaw = sp.get("fy") ?? sp.get("financial_year")
  const fy = fyRaw ? Number.parseInt(fyRaw, 10) : Number.NaN
  if (!Number.isFinite(fy) || fy < 1990 || fy > 2100) {
    return responseNoStore(
      {
        error: "bad_request",
        message: "Query parameter fy (financial year start year, e.g. fy=2025 for FY starting 1 July 2025) is required and must be a valid year.",
      },
      { status: 400 }
    )
  }

  const scenario = normalizeScenario(sp.get("scenario"))
  if (!scenario) {
    return responseNoStore(
      {
        error: "bad_request",
        message: "Query parameter scenario is required: confirmed | confirmed_plus_probable",
      },
      { status: 400 }
    )
  }

  const isAdmin = roles.includes("admin")
  const tenantSlugs = getUserClientSlugs(session.user)
  const allowedClientSlugs = !isAdmin && tenantSlugs.length > 0 ? new Set(tenantSlugs) : null

  const debugParam = sp.get("debug")
  const includeRowDebug = debugParam === "1" || debugParam === "true" || debugParam === "yes"

  try {
    const result = await loadFinanceForecastDataset({
      financialYearStartYear: fy,
      scenario,
      clientFilter: sp.get("client") ?? undefined,
      searchText: sp.get("q") ?? sp.get("search") ?? undefined,
      allowedClientSlugs,
      includeRowDebug,
    })

    return responseNoStore({
      dataset: result.dataset,
      meta: result.meta,
    })
  } catch (err) {
    console.error("[api/finance/forecast] GET failed", err)
    return responseNoStore(
      {
        error: "internal_error",
        message: err instanceof Error ? err.message : "Failed to load finance forecast",
      },
      { status: 500 }
    )
  }
}
