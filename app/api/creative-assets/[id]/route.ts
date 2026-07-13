import { NextRequest, NextResponse } from "next/server"
import { del } from "@vercel/blob"
import { auth0 } from "@/lib/auth0"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getUserRoles } from "@/lib/rbac"
import {
  getById,
  remove,
  update,
  XanoCreativeAssetError,
} from "@/lib/creative/xanoCreativeAssets"
import { validateCreativeAssetPatch } from "@/lib/creative/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function xanoErrorResponse(error: unknown): NextResponse {
  if (error instanceof XanoCreativeAssetError) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Xano unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
  console.error("creative-assets [id] route:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

function parseId(raw: string): number | null {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    const { id: idRaw } = await params
    const id = parseId(idRaw)
    if (!id) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const row = await getById(id)
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const roles = getUserRoles(session.user)
    if (roles.includes("client")) {
      const access = await checkClientMbaAccess(request, row.mba_number)
      if (!access.ok) return access.response
    }

    return NextResponse.json(row)
  } catch (error) {
    return xanoErrorResponse(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    const { id: idRaw } = await params
    const id = parseId(idRaw)
    if (!id) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const existing = await getById(id)
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const roles = getUserRoles(session.user)
    if (roles.includes("client")) {
      const access = await checkClientMbaAccess(request, existing.mba_number)
      if (!access.ok) return access.response
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = validateCreativeAssetPatch(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const row = await update(id, parsed.value)
    return NextResponse.json(row)
  } catch (error) {
    return xanoErrorResponse(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    const roles = getUserRoles(session.user)
    if (roles.includes("client")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const { id: idRaw } = await params
    const id = parseId(idRaw)
    if (!id) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const existing = await getById(id)
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    try {
      await del(existing.blob_url)
    } catch (blobError) {
      console.error("[creative-assets] blob delete failed", {
        id,
        blob_url: existing.blob_url,
        blobError,
      })
      return NextResponse.json({ error: "Failed to delete blob" }, { status: 502 })
    }

    await remove(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return xanoErrorResponse(error)
  }
}
