import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getUserRoles } from "@/lib/rbac"
import {
  createIdempotent,
  listByMba,
  XanoCreativeAssetError,
} from "@/lib/creative/xanoCreativeAssets"
import { validateCreativeAssetCreateBody } from "@/lib/creative/types"
import type { CreativeAsset } from "@/lib/creative/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function resolveUploadedByRole(user: { [key: string]: unknown }): CreativeAsset["uploaded_by_role"] {
  const roles = getUserRoles(user as Parameters<typeof getUserRoles>[0])
  if (roles.includes("admin")) return "admin"
  if (roles.includes("client")) return "client"
  return "manager"
}

function resolveUploadedByEmail(user: { [key: string]: unknown }): string {
  const email = user.email
  return typeof email === "string" && email.trim() ? email.trim() : ""
}

function resolveUploadedByName(user: { [key: string]: unknown }): string {
  const name = user.name
  if (typeof name === "string" && name.trim()) return name.trim()
  const given = typeof user.given_name === "string" ? user.given_name.trim() : ""
  const family = typeof user.family_name === "string" ? user.family_name.trim() : ""
  return `${given} ${family}`.trim()
}

function xanoErrorResponse(error: unknown): NextResponse {
  if (error instanceof XanoCreativeAssetError) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Xano unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
  console.error("creative-assets route:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    const mbaNumber = request.nextUrl.searchParams.get("mba_number")?.trim() ?? ""
    const roles = getUserRoles(session.user)

    if (roles.includes("client")) {
      if (!mbaNumber) {
        return NextResponse.json({ error: "mba_number is required" }, { status: 400 })
      }
      const access = await checkClientMbaAccess(request, mbaNumber)
      if (!access.ok) return access.response
    }

    const rows = await listByMba(mbaNumber || undefined)
    return NextResponse.json(rows)
  } catch (error) {
    return xanoErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = validateCreativeAssetCreateBody(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const roles = getUserRoles(session.user)
    if (roles.includes("client")) {
      const access = await checkClientMbaAccess(request, parsed.value.mba_number)
      if (!access.ok) return access.response
    }

    const row = await createIdempotent({
      ...parsed.value,
      uploaded_by_email: resolveUploadedByEmail(session.user as { [key: string]: unknown }),
      uploaded_by_role: resolveUploadedByRole(session.user as { [key: string]: unknown }),
      uploaded_by_name: resolveUploadedByName(session.user as { [key: string]: unknown }),
    })

    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    return xanoErrorResponse(error)
  }
}
