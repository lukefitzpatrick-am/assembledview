import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"

export const maxDuration = 60

/**
 * Mark-billed is retired. Lifecycle is derived from approval / export / Xero
 * evidence and cannot be declared. Route stays so leftover callers get 410, not 404.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    const roles = getUserRoles(session.user)
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    return NextResponse.json(
      {
        error: "gone",
        message:
          "Mark billed is retired. Billing state is derived from approval, export, and Xero evidence and cannot be declared.",
      },
      { status: 410 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "mark_billed_failed", details: message }, { status: 500 })
  }
}
