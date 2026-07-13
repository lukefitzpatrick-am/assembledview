import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import JSZip from "jszip"
import { auth0 } from "@/lib/auth0"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getUserRoles } from "@/lib/rbac"
import { getById, XanoCreativeAssetError } from "@/lib/creative/xanoCreativeAssets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_UNPACKED_ZIP_BYTES = 50 * 1024 * 1024
const MAX_ENTRY_BYTES = 10 * 1024 * 1024

const PREVIEW_SECURITY_HEADERS = {
  "Content-Security-Policy": "sandbox allow-scripts",
  "X-Content-Type-Options": "nosniff",
} as const

const EXT_CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  xml: "application/xml",
  txt: "text/plain; charset=utf-8",
}

function parseId(raw: string): number | null {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function previewJson(body: Record<string, string>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: PREVIEW_SECURITY_HEADERS })
}

function contentTypeForPath(entryPath: string): string {
  const base = entryPath.split("/").pop() || entryPath
  const dot = base.lastIndexOf(".")
  if (dot < 0) return "application/octet-stream"
  const ext = base.slice(dot + 1).toLowerCase()
  return EXT_CONTENT_TYPES[ext] || "application/octet-stream"
}

/**
 * Resolve a requested path against zip entry names only.
 * Rejects `..`, absolute paths, empty segments, and backslashes.
 */
function resolveRequestedPath(pathSegments: string[] | undefined): string | null {
  const segments =
    pathSegments && pathSegments.length > 0 ? pathSegments : ["index.html"]

  for (const segment of segments) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("\\") ||
      segment.includes("\0") ||
      segment.includes(":")
    ) {
      return null
    }
  }

  const joined = segments.join("/")
  if (joined.startsWith("/") || joined.includes("//")) return null
  return joined
}

function findZipEntry(zip: JSZip, requestedPath: string): JSZip.JSZipObject | null {
  const direct = zip.file(requestedPath)
  if (direct && !direct.dir) return direct

  // Some bundles store entries with a leading "./"
  const dotted = zip.file(`./${requestedPath}`)
  if (dotted && !dotted.dir) return dotted

  return null
}

function totalUnpackedBytes(zip: JSZip): number {
  let total = 0
  for (const file of Object.values(zip.files)) {
    if (file.dir) continue
    const data = (file as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } })._data
    const size = data?.uncompressedSize
    if (typeof size === "number" && Number.isFinite(size) && size > 0) {
      total += size
    }
  }
  return total
}

function xanoErrorResponse(error: unknown): NextResponse {
  if (error instanceof XanoCreativeAssetError) {
    if (error.status === 401) {
      return previewJson({ error: "Xano unauthorized" }, 401)
    }
    return previewJson({ error: error.message }, 502)
  }
  console.error("GET /api/creative-assets/[id]/preview:", error)
  return previewJson({ error: "Internal server error" }, 500)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; path?: string[] }> },
) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return previewJson({ error: "unauthorised" }, 401)
    }

    const { id: idRaw, path: pathSegments } = await params
    const id = parseId(idRaw)
    if (!id) {
      return previewJson({ error: "Invalid id" }, 400)
    }

    const requestedPath = resolveRequestedPath(pathSegments)
    if (!requestedPath) {
      return previewJson({ error: "Invalid path" }, 400)
    }

    const row = await getById(id)
    if (!row) {
      return previewJson({ error: "Not found" }, 404)
    }

    const roles = getUserRoles(session.user)
    if (roles.includes("client")) {
      const access = await checkClientMbaAccess(request, row.mba_number)
      if (!access.ok) {
        const denied = access.response
        // Preserve status/body; attach preview security headers.
        const body = await denied.text()
        return new NextResponse(body, {
          status: denied.status,
          headers: {
            ...PREVIEW_SECURITY_HEADERS,
            "Content-Type": denied.headers.get("Content-Type") || "application/json",
          },
        })
      }
    }

    if (row.mime_type !== "application/zip") {
      return previewJson({ error: "Preview is only available for HTML5 zip bundles" }, 400)
    }

    const blobResult = await get(row.blob_url, { access: "private" })
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
      return previewJson({ error: "Blob not found" }, 404)
    }

    if (typeof blobResult.blob.size === "number" && blobResult.blob.size > MAX_UNPACKED_ZIP_BYTES) {
      return previewJson({ error: "Zip exceeds maximum size" }, 413)
    }

    const zipBuffer = await new Response(blobResult.stream).arrayBuffer()
    if (zipBuffer.byteLength > MAX_UNPACKED_ZIP_BYTES) {
      return previewJson({ error: "Zip exceeds maximum size" }, 413)
    }

    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(zipBuffer)
    } catch (error) {
      console.error("GET /api/creative-assets/[id]/preview: zip load failed", error)
      return previewJson({ error: "Invalid zip archive" }, 400)
    }

    const unpacked = totalUnpackedBytes(zip)
    if (unpacked > MAX_UNPACKED_ZIP_BYTES) {
      return previewJson({ error: "Zip exceeds maximum unpacked size" }, 413)
    }

    const entry = findZipEntry(zip, requestedPath)
    if (!entry) {
      return previewJson({ error: "Entry not found" }, 404)
    }

    const entryData = await entry.async("uint8array")
    if (entryData.byteLength > MAX_ENTRY_BYTES) {
      return previewJson({ error: "Entry exceeds maximum size" }, 413)
    }

    return new NextResponse(Buffer.from(entryData), {
      status: 200,
      headers: {
        ...PREVIEW_SECURITY_HEADERS,
        "Content-Type": contentTypeForPath(requestedPath),
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    return xanoErrorResponse(error)
  }
}
