/**
 * Client POST to /api/mediaplans/draft-documents. Does not persist.
 */
export async function postDraftDocuments(
  body: Record<string, unknown>
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch("/api/mediaplans/draft-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: string
      details?: string
    }
    throw new Error(errorData.error || errorData.details || "Failed to download draft")
  }
  const blob = await response.blob()
  const disp = response.headers.get("Content-Disposition") ?? ""
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disp)
  const quoted = /filename="([^"]+)"/i.exec(disp)
  const plain = /filename=([^;]+)/i.exec(disp)
  const filename = decodeURIComponent(
    (star?.[1] || quoted?.[1] || plain?.[1] || "DRAFT-not-for-client").trim()
  )
  return { blob, filename }
}
