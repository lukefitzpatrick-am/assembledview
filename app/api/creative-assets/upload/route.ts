import { NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { auth0 } from "@/lib/auth0"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getUserRoles } from "@/lib/rbac"
import { createIdempotent, XanoCreativeAssetError } from "@/lib/creative/xanoCreativeAssets"
import { parseUploadTokenPayload } from "@/lib/creative/types"
import type { CreativeAsset } from "@/lib/creative/types"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

const ALLOWED_CONTENT_TYPES = [
  "image/*",
  "video/*",
  "audio/*",
  "application/pdf",
  "application/zip",
]

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

function parseUploadClientPayload(
  clientPayload: string | null,
):
  | { ok: true; value: { mba_number: string; line_item_id: string; source_table: string } }
  | { ok: false; error: string } {
  if (!clientPayload?.trim()) {
    return { ok: false, error: "clientPayload is required" }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(clientPayload)
  } catch {
    return { ok: false, error: "clientPayload must be valid JSON" }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "clientPayload must be a JSON object" }
  }

  const raw = parsed as Record<string, unknown>
  const mbaNumber = typeof raw.mba_number === "string" ? raw.mba_number.trim() : ""
  if (!mbaNumber) {
    return { ok: false, error: "clientPayload.mba_number is required" }
  }

  return {
    ok: true,
    value: {
      mba_number: mbaNumber,
      line_item_id: typeof raw.line_item_id === "string" ? raw.line_item_id.trim() : "",
      source_table: typeof raw.source_table === "string" ? raw.source_table.trim() : "",
    },
  }
}

function creativePathPrefix(mbaNumber: string): string {
  return `creative/${mbaNumber}/`
}

function basenameFromPathname(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean)
  return parts[parts.length - 1] ?? pathname
}

function xanoErrorResponse(error: unknown): NextResponse {
  if (error instanceof XanoCreativeAssetError) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Xano unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
  console.error("POST /api/creative-assets/upload:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function POST(request: NextRequest) {
  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth0.getSession(request)
        if (!session?.user) {
          throw new Error("unauthorised")
        }

        const parsedPayload = parseUploadClientPayload(clientPayload)
        if (!parsedPayload.ok) {
          throw new Error(parsedPayload.error)
        }

        const { mba_number, line_item_id, source_table } = parsedPayload.value
        const roles = getUserRoles(session.user)
        if (roles.includes("client")) {
          const access = await checkClientMbaAccess(request, mba_number)
          if (!access.ok) {
            throw new Error("forbidden")
          }
        }

        const prefix = creativePathPrefix(mba_number)
        if (!pathname.startsWith(prefix)) {
          throw new Error(`Pathname must start with ${prefix}`)
        }

        const email = resolveUploadedByEmail(session.user as { [key: string]: unknown })
        const role = resolveUploadedByRole(session.user as { [key: string]: unknown })

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            mba_number,
            line_item_id,
            source_table,
            email,
            role,
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsedToken = parseUploadTokenPayload(tokenPayload)
        if (!parsedToken.ok) {
          console.error("[creative-assets/upload] invalid tokenPayload", parsedToken.error)
          return
        }

        const token = parsedToken.value
        const originalFilename = basenameFromPathname(blob.pathname)

        await createIdempotent({
          mba_number: token.mba_number,
          media_plan_master_id: 0,
          line_item_id: token.line_item_id,
          source_table: token.source_table,
          asset_name: originalFilename,
          original_filename: originalFilename,
          mime_type: blob.contentType || "application/octet-stream",
          file_size_bytes: 0,
          width_px: 0,
          height_px: 0,
          duration_seconds: 0,
          blob_url: blob.url,
          blob_pathname: blob.pathname,
          status: "active",
          uploaded_by_email: token.email,
          uploaded_by_role: token.role,
        })
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed"
    if (message === "unauthorised") {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }
    if (message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    if (message.startsWith("clientPayload") || message.startsWith("Pathname")) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return xanoErrorResponse(error)
  }
}
