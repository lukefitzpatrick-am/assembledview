import { NextRequest, NextResponse } from "next/server"
import { requireFinanceAdmin } from "@/lib/requireRole"
import {
  fetchInvestmentCut,
  normalizeInvestmentCutRequest,
} from "@/lib/finance/sections/investment/cutQuery"
import type { InvestmentCutRequest } from "@/lib/finance/sections/investment/cutTypes"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON", message: "Request body must be JSON." },
        { status: 400 }
      )
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid body", message: "Expected an object request body." },
        { status: 400 }
      )
    }

    const raw = body as Partial<InvestmentCutRequest>
    if (typeof raw.fy !== "number" || !Number.isFinite(raw.fy)) {
      return NextResponse.json(
        { error: "Invalid fy", message: "fy must be a financial year start year (e.g. 2025)." },
        { status: 400 }
      )
    }
    if (raw.basis !== "billing" && raw.basis !== "delivery") {
      return NextResponse.json(
        {
          error: "Invalid basis",
          message: 'basis must be "billing" or "delivery" (never mixed in one response).',
        },
        { status: 400 }
      )
    }

    const normalized = normalizeInvestmentCutRequest({
      fy: raw.fy,
      monthRange: raw.monthRange,
      basis: raw.basis,
      dimensions: Array.isArray(raw.dimensions) ? raw.dimensions : [],
      measures: Array.isArray(raw.measures) ? raw.measures : [],
      filters: raw.filters,
      presetId: typeof raw.presetId === "string" ? raw.presetId : null,
    })

    if ("error" in normalized) {
      const status =
        normalized.error === "ACTUALS_GRAIN_UNSUPPORTED" ||
        normalized.error === "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED" ||
        normalized.error === "AGENCY_REVENUE_GRAIN_UNSUPPORTED"
          ? 422
          : 400
      return NextResponse.json(normalized, { status })
    }

    const payload = await fetchInvestmentCut(normalized)
    return NextResponse.json(payload)
  } catch (error) {
    console.error("[finance/sections/investment/cut]", error)
    return NextResponse.json(
      { error: "Failed to run investment cut" },
      { status: 500 }
    )
  }
}
