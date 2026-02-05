import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const roles = getUserRoles(session.user)
  return NextResponse.json(
    {
      isAuthenticated: true,
      isAdmin: roles.includes("admin"),
      roles,
      user: {
        sub: (session.user as any)?.sub,
        email: (session.user as any)?.email,
        name: (session.user as any)?.name,
      },
    },
    { status: 200 }
  )
}

