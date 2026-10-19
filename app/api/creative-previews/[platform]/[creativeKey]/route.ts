import { NextRequest, NextResponse } from "next/server"
import { BlobNotFoundError } from "@vercel/blob"
import { and, eq } from "drizzle-orm"

import { getDb } from "@/db"
import { creativePreviewCache } from "@/db/schema"
import { assertStaffOrClientAccess } from "@/lib/auth/assertClientAccess"
import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"
import { readPreviewCacheGate } from "@/lib/creative/previews/markers"
import { servePreviewImage } from "@/lib/creative/previews/serve"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Cached creative preview image (private Blob). Internal staff (any recognised
 * role that is not client), or a client user whose client matches
 * creative_preview_cache.client_id. A row with no client_id is staff only.
 * 404 when there is no row or 0098/0102 are not applied.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string; creativeKey: string }> },
) {
  try {
    const params = await context.params
    return await servePreviewImage(
      { platform: decodeURIComponent(params.platform), creativeKey: decodeURIComponent(params.creativeKey) },
      {
        gate: readPreviewCacheGate,
        readRow: async (platform, creativeKey) => {
          const [row] = await getDb()
            .select({
              clientId: creativePreviewCache.clientId,
              blobPathname: creativePreviewCache.blobPathname,
              mimeType: creativePreviewCache.mimeType,
            })
            .from(creativePreviewCache)
            .where(
              and(eq(creativePreviewCache.platform, platform), eq(creativePreviewCache.creativeKey, creativeKey)),
            )
            .limit(1)
          return row ?? null
        },
        checkAccess: (clientId) => assertStaffOrClientAccess(request, clientId),
        getBlob: async (pathname) => {
          const result = await getPrivateBlob(pathname)
          if (!result || result.statusCode !== 200 || !result.stream) return null
          return { stream: result.stream, contentType: result.blob.contentType ?? null }
        },
      },
    )
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    console.error("GET /api/creative-previews:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
