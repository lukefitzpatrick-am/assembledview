import { NextResponse } from "next/server"
import { readPlanMasters } from "@/lib/data/readMediaPlans"
import { allocateNextMbaNumber } from "@/lib/mediaplan/allocateNextMbaNumber"

/**
 * GET /api/mediaplans/mbanumber?mbaidentifier=
 * Next MBA number for a client identifier — Postgres masters (X3).
 * Response includes both `mba_number` and `mbanumber` for create/edit callers.
 *
 * Generation scopes with mbaNumberMatchesClientIdentifier (same as auth),
 * parses the full trailing digit run, and lowercases the result.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mbaidentifierRaw = searchParams.get("mbaidentifier")
  const mbaidentifier = mbaidentifierRaw?.trim() ?? ""

  if (!mbaidentifier) {
    return NextResponse.json({ error: "MBA Identifier is required" }, { status: 400 })
  }

  try {
    const existingPlans = await readPlanMasters()
    const existingMbaNumbers = existingPlans.map((plan) =>
      plan && typeof plan.mba_number === "string" ? plan.mba_number : null
    )
    const mba_number = allocateNextMbaNumber(existingMbaNumbers, mbaidentifier)

    return NextResponse.json({ mba_number, mbanumber: mba_number })
  } catch (error) {
    console.error("[api/mediaplans/mbanumber GET]", error)
    return NextResponse.json({ error: "Failed to generate MBA number" }, { status: 500 })
  }
}
