import { put } from "@vercel/blob"

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const XLSM_CONTENT_TYPE =
  "application/vnd.ms-excel.sheet.macroEnabled.12"

function contentTypeFor(fileName: string): string {
  return fileName.toLowerCase().endsWith(".xlsm")
    ? XLSM_CONTENT_TYPE
    : XLSX_CONTENT_TYPE
}

/**
 * Private blob write — same access mode as naming exports / performance reports.
 * Store the returned pathname in planning_audience_uploads.blob_url (column name
 * is historical). Never put the pathname or a public URL in a client payload.
 */
export async function storePlanningUploadBlob(
  fileName: string,
  bytes: Buffer
): Promise<string> {
  const blob = await put(`planning/audience-uploads/${fileName}`, bytes, {
    access: "private",
    contentType: contentTypeFor(fileName),
    addRandomSuffix: true,
  })
  return blob.pathname
}
