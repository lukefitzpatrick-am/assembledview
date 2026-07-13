import { put } from "@vercel/blob"

const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"

export async function storePerformanceReport(
  mba: string,
  filename: string,
  buffer: Buffer,
): Promise<{ pathname: string; filename: string }> {
  const blob = await put(`exports/reports/${mba}/${filename}`, buffer, {
    access: "private",
    contentType: PPTX_CONTENT_TYPE,
    addRandomSuffix: true,
  })
  // Store pathname only — signed Blob URLs expire; download goes through
  // GET /api/reports/download which auth-checks and streams on each click.
  return { pathname: blob.pathname, filename }
}

export { PPTX_CONTENT_TYPE }
