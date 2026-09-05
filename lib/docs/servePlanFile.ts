import { NextResponse } from "next/server"

import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"
import { parsePlanFileJson } from "@/lib/docs/planVersionFiles"

function escapeDispositionFilename(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function asRecord(file: unknown): Record<string, unknown> | null {
  if (!file || typeof file !== "object" || Array.isArray(file)) return null
  return file as Record<string, unknown>
}

function isVercelBlobUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.endsWith("vercel-storage.com") || host.endsWith("blob.vercel-storage.com")
  } catch {
    return false
  }
}

function mimeFromFile(file: unknown, filename: string): string {
  const obj = asRecord(file)
  if (typeof obj?.mime === "string" && obj.mime.trim()) return obj.mime.trim()
  const lower = filename.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }
  return "application/octet-stream"
}

/**
 * Stream a stored plan document as an attachment. Never generates. Never
 * redirects the browser at the blob URL.
 */
export async function servePlanFileAttachment(file: unknown): Promise<NextResponse> {
  const parsed = parsePlanFileJson(file, "attachment")
  if (!parsed) {
    return NextResponse.json(
      { error: "No stored document for this version", code: "NOT_SAVED" },
      { status: 404 },
    )
  }

  const obj = asRecord(file)
  const pathname =
    typeof obj?.pathname === "string" && obj.pathname.trim() && !obj.pathname.trim().startsWith("http")
      ? obj.pathname.trim()
      : null
  const blobTarget =
    pathname ?? (isVercelBlobUrl(parsed.url) ? parsed.url : null)

  const filename = escapeDispositionFilename(parsed.filename)
  const contentType = mimeFromFile(file, parsed.filename)
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
  }

  if (blobTarget) {
    const blobResult = await getPrivateBlob(blobTarget)
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
      return NextResponse.json(
        { error: "No stored document for this version", code: "NOT_SAVED" },
        { status: 404 },
      )
    }
    const size = blobResult.blob.size
    if (typeof size === "number" && Number.isFinite(size) && size >= 0) {
      headers["Content-Length"] = String(size)
    }
    return new NextResponse(blobResult.stream, { status: 200, headers })
  }

  const upstream = await fetch(parsed.url)
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "No stored document for this version", code: "NOT_SAVED" },
      { status: 404 },
    )
  }
  const buffer = await upstream.arrayBuffer()
  headers["Content-Length"] = String(buffer.byteLength)
  return new NextResponse(buffer, { status: 200, headers })
}
