import { NextRequest, NextResponse } from "next/server"
import { fetchScopeOfWorkFromPostgres } from "@/lib/data/readFinance"
import { requireRole } from "@/lib/requireRole"

export async function POST(req: NextRequest) {
  try {
    const gate = await requireRole(req, ["admin"])
    if ("response" in gate) return gate.response

    const body = await req.json()
    const mbaIdentifier = body.mbaIdentifier

    if (!mbaIdentifier) {
      return NextResponse.json({ error: "MBA Identifier is required" }, { status: 400 })
    }

    const allScopes = await fetchScopeOfWorkFromPostgres()

    const existingScopes = allScopes.filter(
      (scope) => String(scope.client_name ?? "") === String(body.clientName ?? "")
    )

    let maxNumber = 0
    const scopeIdPrefix = `${mbaIdentifier}_sow`

    for (const scope of existingScopes) {
      if (scope.project_name) {
        const match = String(scope.project_name).match(
          new RegExp(
            `${scopeIdPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)`
          )
        )
        if (match) {
          const numberPart = parseInt(match[1], 10)
          if (!isNaN(numberPart) && numberPart > maxNumber) {
            maxNumber = numberPart
          }
        }
      }
      const scopeId = String(scope.scope_id ?? "")
      if (scopeId.startsWith(scopeIdPrefix)) {
        const n = parseInt(scopeId.slice(scopeIdPrefix.length), 10)
        if (!isNaN(n) && n > maxNumber) maxNumber = n
      }
    }

    const newNumber = maxNumber + 1
    const scopeId = `${scopeIdPrefix}${newNumber.toString().padStart(3, "0")}`

    return NextResponse.json({ scopeId })
  } catch (error) {
    console.error("Failed to generate scope ID:", error)
    return NextResponse.json({ error: "Failed to generate scope ID" }, { status: 500 })
  }
}
