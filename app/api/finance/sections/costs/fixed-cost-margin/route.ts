import { NextRequest, NextResponse } from "next/server"
import { requireFinanceAdmin } from "@/lib/requireRole"
import {
  fetchFinanceFixedCostMargin,
  normalizeFixedCostMarginQuery,
} from "@/lib/finance/sections/fixedCostMargin/query"

export const maxDuration = 60

function parseClientIds(raw: string | null): number[] {
  if (!raw?.trim()) return []
  const out: number[] = []
  for (const part of raw.split(",")) {
    const n = Number.parseInt(part.trim(), 10)
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return [...new Set(out)]
}

/** Read-only: fixed-cost lines billed at plan vs actual platform spend. Admin only. */
export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const sp = request.nextUrl.searchParams
    const fyRaw = sp.get("fy")
    let fy: number | undefined
    if (fyRaw != null && fyRaw.trim() !== "") {
      const parsed = Number.parseInt(fyRaw, 10)
      if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 2100) {
        return NextResponse.json(
          { error: "Invalid fy", message: "fy must be a financial year start year (e.g. 2026)." },
          { status: 400 }
        )
      }
      fy = parsed
    }

    const query = normalizeFixedCostMarginQuery({
      fy,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      clients: parseClientIds(sp.get("clients")),
    })

    const payload = await fetchFinanceFixedCostMargin(query)
    return NextResponse.json(payload)
  } catch (error) {
    console.error("[finance/sections/costs/fixed-cost-margin]", error)
    return NextResponse.json({ error: "Failed to load fixed cost margin" }, { status: 500 })
  }
}
