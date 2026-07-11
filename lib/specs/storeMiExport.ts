import { getDownloadUrl, put } from "@vercel/blob"

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export async function storeMiWorkbookBuffer(
  mba: string,
  filename: string,
  buffer: ArrayBuffer,
): Promise<{ downloadUrl: string; filename: string }> {
  const blob = await put(
    `exports/mi/${mba}/${filename}`,
    Buffer.from(buffer),
    {
      access: "private",
      contentType: XLSX_CONTENT_TYPE,
      addRandomSuffix: true,
    },
  )
  return { downloadUrl: getDownloadUrl(blob.url), filename }
}
