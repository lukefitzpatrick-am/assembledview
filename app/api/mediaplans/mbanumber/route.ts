import { NextResponse } from "next/server"
import { readPlanMasters } from "@/lib/data/readMediaPlans"

/**
 * GET /api/mediaplans/mbanumber?mbaidentifier=
 * Next MBA number for a client identifier — Postgres masters (X3).
 * Response includes both `mba_number` and `mbanumber` for create/edit callers.
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
    const prefix = mbaidentifier.toLowerCase()

    let maxNumber = 0
    for (const plan of existingPlans) {
      const num = plan?.mba_number
      if (plan && typeof num === "string" && num.toLowerCase().startsWith(prefix)) {
        const numberPart = Number.parseInt(num.slice(-3), 10)
        if (!Number.isNaN(numberPart) && numberPart > maxNumber) {
          maxNumber = numberPart
        }
      }
    }

    const newNumber = maxNumber + 1
    const mba_number = `${mbaidentifier}${newNumber.toString().padStart(3, "0")}`

    return NextResponse.json({ mba_number, mbanumber: mba_number })
  } catch (error) {
    console.error("[api/mediaplans/mbanumber GET]", error)
    return NextResponse.json({ error: "Failed to generate MBA number" }, { status: 500 })
  }
}
