/**
 * Client fetch of a stored plan file. No server-only imports.
 * The file name comes from Content-Disposition (the server's stored name).
 */

export type StoredPlanFileKind = "media_plan" | "aa_media_plan" | "mba_pdf"

export class NotApprovedError extends Error {
  readonly status = 422
  readonly code = "NOT_APPROVED" as const
  constructor(message = "Document download requires a published version") {
    super(message)
    this.name = "NotApprovedError"
  }
}

export class NotSavedError extends Error {
  readonly status = 404
  readonly code = "NOT_SAVED" as const
  constructor(message = "No stored document for this version") {
    super(message)
    this.name = "NotSavedError"
  }
}

/** Stored name from Content-Disposition. filename* first, then filename=. */
export function fileNameFromContentDisposition(header: string | null): string | null {
  const disp = header ?? ""
  const star = /filename\*=(?:UTF-8''|)([^;]+)/i.exec(disp)
  if (star?.[1]) {
    const raw = star[1].trim().replace(/^"(.*)"$/, "$1")
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  const quoted = /filename="([^"]*)"/i.exec(disp)
  if (quoted) return quoted[1]
  const plain = /filename=([^;]+)/i.exec(disp)
  if (plain?.[1]) return plain[1].trim().replace(/^"(.*)"$/, "$1")
  return null
}

export async function downloadStoredPlanFile(args: {
  versionId: number
  kind: StoredPlanFileKind
}): Promise<{ blob: Blob; fileName: string }> {
  const versionId = args.versionId
  if (!Number.isFinite(versionId) || versionId <= 0) {
    throw new Error("Invalid version id")
  }
  const url = `/api/mediaplans/${encodeURIComponent(String(versionId))}/download?kind=${encodeURIComponent(args.kind)}`
  const response = await fetch(url)
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string
      code?: string
    }
    const message = typeof body.error === "string" && body.error.trim() ? body.error : undefined
    if (response.status === 422) {
      throw new NotApprovedError(message)
    }
    if (response.status === 404 && body.code === "NOT_SAVED") {
      throw new NotSavedError(message)
    }
    throw new Error(message || `Download failed (${response.status})`)
  }
  const fileName = fileNameFromContentDisposition(response.headers.get("Content-Disposition"))
  if (!fileName) {
    throw new Error("Stored file has no file name")
  }
  const blob = await response.blob()
  return { blob, fileName }
}
