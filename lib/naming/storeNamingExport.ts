import { put } from "@vercel/blob"

import { NAMING_EXPORT_PREFIX } from "./parseNamingExportPath"

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export async function storeNamingWorkbookBuffer(
  mba: string,
  filename: string,
  buffer: ArrayBuffer | Buffer,
): Promise<{ pathname: string; filename: string }> {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const blob = await put(`${NAMING_EXPORT_PREFIX}${mba}/${filename}`, bytes, {
    access: "private",
    contentType: XLSX_CONTENT_TYPE,
    addRandomSuffix: true,
  })
  // Store pathname only — download goes through GET /api/naming/exports/download.
  return { pathname: blob.pathname, filename }
}

export { XLSX_CONTENT_TYPE as NAMING_XLSX_CONTENT_TYPE }
