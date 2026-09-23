import { put } from "@vercel/blob"

import type { ExportBlobPaths } from "@/lib/finance/sendToAccounts"

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export async function storeAccountsPackBlobs(input: {
  fy: number
  month: string
  timestamp: string
  csv: string
  xlsx: Buffer
}): Promise<ExportBlobPaths> {
  const base = `finance-exports/${input.fy}/${input.month}/${input.timestamp}`
  const csvKey = `${base}-csv`
  const xlsxKey = `${base}-xlsx`
  const csvBlob = await put(csvKey, input.csv, {
    access: "private",
    contentType: "text/csv",
    addRandomSuffix: false,
  })
  const xlsxBlob = await put(xlsxKey, input.xlsx, {
    access: "private",
    contentType: XLSX,
    addRandomSuffix: false,
  })
  const pathname = (value: string) => value.replace(/^\//, "")
  return { csv: pathname(csvBlob.pathname), xlsx: pathname(xlsxBlob.pathname) }
}
