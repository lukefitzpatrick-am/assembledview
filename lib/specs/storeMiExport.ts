import { put } from "@vercel/blob"

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export async function storeMiWorkbookBuffer(
  mba: string,
  filename: string,
  buffer: ArrayBuffer,
): Promise<{ pathname: string; filename: string }> {
  const blob = await put(
    `exports/mi/${mba}/${filename}`,
    Buffer.from(buffer),
    {
      access: "private",
      contentType: XLSX_CONTENT_TYPE,
      addRandomSuffix: true,
    },
  )
  // Store pathname only — signed Blob URLs expire; download goes through
  // GET /api/mi/exports/download which auth-checks and streams on each click.
  return { pathname: blob.pathname, filename }
}
