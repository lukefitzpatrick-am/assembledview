import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"

/**
 * GET /api/finance/accrual — retired (X3 / X-AUDIT-1 RETIRE(dead)).
 * UI uses billing + payables / Costs sections; zero product fetch callers.
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  return NextResponse.json(
    {
      error:
        "GET /api/finance/accrual is retired (X3). Use finance billing / Costs sections.",
      code: "FINANCE_ACCRUAL_GONE",
    },
    { status: 410 }
  )
}
