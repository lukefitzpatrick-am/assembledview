import { NextResponse } from "next/server"

import { isPreviewPlatform, type PreviewPlatform } from "./core"
import type { PreviewCacheGate } from "./gate"

export const PREVIEW_CACHE_CONTROL = "private, max-age=86400"

export type ServedPreviewRow = {
  clientId: number | null
  blobPathname: string | null
  mimeType: string | null
}

export type ServePreviewDeps = {
  gate: () => Promise<PreviewCacheGate>
  readRow: (platform: PreviewPlatform, creativeKey: string) => Promise<ServedPreviewRow | null>
  /** Admin, or a client user whose client group contains `clientId`. 0 (no client) is admin only. */
  checkAccess: (clientId: number) => Promise<{ ok: true } | { ok: false; response: Response }>
  getBlob: (pathname: string) => Promise<{ stream: ReadableStream<Uint8Array>; contentType: string | null } | null>
}

function notFound(): NextResponse {
  return NextResponse.json({ error: "not found" }, { status: 404 })
}

export async function servePreviewImage(
  params: { platform: string; creativeKey: string },
  deps: ServePreviewDeps,
): Promise<Response> {
  const platform = params.platform.trim().toLowerCase()
  const creativeKey = params.creativeKey.trim()
  if (!isPreviewPlatform(platform) || !creativeKey) return notFound()

  const gate = await deps.gate()
  if (!gate.ready) {
    console.warn(`[creative-previews] ${gate.message}`)
    return notFound()
  }

  const row = await deps.readRow(platform, creativeKey)
  if (!row || !row.blobPathname) return notFound()

  const access = await deps.checkAccess(row.clientId ?? 0)
  if (!access.ok) return access.response

  const blob = await deps.getBlob(row.blobPathname)
  if (!blob) return notFound()

  return new NextResponse(blob.stream, {
    status: 200,
    headers: {
      "Content-Type": blob.contentType || row.mimeType || "application/octet-stream",
      "Cache-Control": PREVIEW_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  })
}
