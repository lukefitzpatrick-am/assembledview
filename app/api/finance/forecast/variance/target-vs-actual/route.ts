import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import {
  FINANCE_BILLING_RECORDS_PATH,
  parseList,
  xanoFinanceGet,
} from "@/lib/finance/xanoFinanceApi"
import {
  loadFinanceForecastDataset,
  normalizeScenario,
} from "@/lib/finance/forecast/server/loadFinanceForecastDataset"
import { fetchRevenueForecastTargetLinesFromXano } from "@/lib/finance/forecast/targets/xanoTargetLines"
import {
  aggregateBilledActualsToClientMonth,
  bookedMonthlyFromDataset,
  buildTargetVsActualVariance,
  rollTargetsToClientMonth,
} from "@/lib/finance/forecast/variance/targetVsActual"
import { billingMonthsInAustralianFinancialYear, referenceDateForFyStartYear } from "@/lib/finance/months"
import type { PersistedFinanceStatusRow } from "@/lib/finance/overlayFinanceStatus"

export const maxDuration = 60

export const dynamic = "force-dynamic"
export const revalidate = 0

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init)
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}

function canRunVariance(roles: string[]): boolean {
  return roles.includes("admin")
}

function parseFy(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * POST — Phase-1 TARGET vs ACTUAL variance (admin only).
 *
 * Body: `{ financial_year | fy, scenario?, client_id? }`
 *
 * Actual = aggregated `finance_billing_records.billed_amount` (MBA-month grain → client×month).
 * Target = rolled A1 `revenue_forecast_lines`.
 * Booked = schedule dataset via `loadFinanceForecastDataset` (shared cache).
 *
 * Phase-2: swap/augment actual series with Xero AR at the same client×month key
 * inside the assembly below (before `buildTargetVsActualVariance`).
 */
export async function POST(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return noStore({ error: "unauthorised" }, { status: 401 })
  }

  const roles = getUserRoles(session.user)
  if (!canRunVariance(roles)) {
    return noStore(
      { error: "forbidden", message: "Only administrators can run target vs actual variance." },
      { status: 403 }
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return noStore({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 })
  }
  if (!json || typeof json !== "object") {
    return noStore({ error: "bad_request", message: "Expected an object body." }, { status: 400 })
  }

  const body = json as Record<string, unknown>
  const fy = parseFy(body.financial_year ?? body.fy)
  if (fy == null) {
    return noStore(
      { error: "bad_request", message: "financial_year (or fy) is required." },
      { status: 400 }
    )
  }

  const scenario =
    normalizeScenario(typeof body.scenario === "string" ? body.scenario : "confirmed") ?? "confirmed"
  const clientFilter =
    typeof body.client_id === "string" && body.client_id.trim()
      ? body.client_id.trim()
      : typeof body.client === "string" && body.client.trim()
        ? body.client.trim()
        : undefined

  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const fyMonthSet = new Set(fyMonths)

  try {
    const [targetLines, billingRaw, bookedResult] = await Promise.all([
      fetchRevenueForecastTargetLinesFromXano({
        financial_year_start_year: fy,
        client_id: clientFilter ?? null,
      }),
      xanoFinanceGet(FINANCE_BILLING_RECORDS_PATH),
      loadFinanceForecastDataset({
        financialYearStartYear: fy,
        scenario,
        clientFilter,
        searchText: undefined,
        allowedClientSlugs: null,
        includeRowDebug: false,
      }),
    ])

    const billingRows = parseList(billingRaw) as PersistedFinanceStatusRow[]
    let actuals = aggregateBilledActualsToClientMonth(billingRows, fyMonthSet)
    let targets = rollTargetsToClientMonth(targetLines)
    let booked = bookedMonthlyFromDataset(bookedResult.dataset)

    if (clientFilter) {
      const needle = clientFilter.toLowerCase()
      const matchClient = (id: string, name: string) =>
        id === clientFilter ||
        id.toLowerCase() === needle ||
        name.toLowerCase().includes(needle)
      actuals = actuals.filter((r) => matchClient(r.client_id, r.client_name))
      targets = targets.filter((r) => matchClient(r.client_id, r.client_name))
      booked = booked.filter((r) => matchClient(r.client_id, r.client_name))
    }

    // Phase-2 Xero AR: merge/replace `actuals` here with client×month amounts from Xero.

    const report = buildTargetVsActualVariance({
      financial_year_start_year: fy,
      targets,
      actuals,
      booked,
    })

    return noStore({
      ok: true as const,
      report,
      booked_meta: bookedResult.meta,
      notes: {
        actual:
          "Phase 1: finance_billing_records.billed_amount (invoiced-at-mark-billed), rolled to client×month. Not per revenue-line.",
        phase2:
          "Plug Xero AR into actuals (same client_id + month_key) before buildTargetVsActualVariance.",
      },
    })
  } catch (err) {
    console.error("[api/finance/forecast/variance/target-vs-actual] failed", err)
    return noStore(
      {
        error: "variance_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    )
  }
}
