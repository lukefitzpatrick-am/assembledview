import { NextRequest, NextResponse } from "next/server"
import { requireFinanceAdmin } from "@/lib/requireRole"
import {
  parseCreateManualMatchBody,
  parseManualMatchId,
} from "@/lib/finance/sections/fixedCostMargin/bills/manualMatch"
import {
  createSavedBillLineMatch,
  deleteSavedBillLineMatch,
  isManualMatchReady,
  loadMatchPlanLines,
  ManualMatchError,
} from "@/lib/finance/sections/fixedCostMargin/manualMatches"

export const maxDuration = 30

function errorResponse(error: unknown, label: string) {
  if (error instanceof ManualMatchError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status })
  }
  console.error(`[finance/sections/costs/bill-line-matches] ${label}`, error)
  return NextResponse.json({ error: "Failed to update bill line matches" }, { status: 500 })
}

/** Plan lines of one MBA for the manual match picker (`?mba=`). Admin only. */
export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  const mba = request.nextUrl.searchParams.get("mba")?.trim() ?? ""
  if (!mba) {
    return NextResponse.json({ error: "bad_request", message: "mba is required." }, { status: 400 })
  }
  try {
    const [ready, lines] = await Promise.all([isManualMatchReady(), loadMatchPlanLines(mba)])
    return NextResponse.json({ ready, mbaNumber: mba.toLowerCase(), lines })
  } catch (error) {
    return errorResponse(error, "GET")
  }
}

/** Save a manual match for one bill line. Admin only. */
export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 })
  }
  const parsed = parseCreateManualMatchBody(body)
  if (!parsed.ok) return NextResponse.json({ error: "bad_request", message: parsed.message }, { status: 400 })
  const user = gate.session?.user
  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : ""
  if (!email) return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  try {
    const match = await createSavedBillLineMatch(parsed.value, {
      email,
      name: typeof user?.name === "string" && user.name.trim() ? user.name.trim() : null,
    })
    return NextResponse.json({ ok: true, match })
  } catch (error) {
    return errorResponse(error, "POST")
  }
}

/** Remove a saved match (`?id=`). Admin only. */
export async function DELETE(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  const id = parseManualMatchId(request.nextUrl.searchParams.get("id"))
  if (id == null) return NextResponse.json({ error: "bad_request", message: "id must be a positive integer." }, { status: 400 })
  try {
    await deleteSavedBillLineMatch(id)
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    return errorResponse(error, "DELETE")
  }
}
