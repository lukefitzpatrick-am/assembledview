import { toPeriodMonthKey } from "@/lib/finance/periods/monthKey"

/** AV-{mba}-{YYYYMM} */
export function mediaInvoiceReference(mbaNumber: string, periodMonth: string): string {
  const ym = toPeriodMonthKey(periodMonth).replace("-", "")
  const mba = String(mbaNumber ?? "").trim().toUpperCase()
  return `AV-${mba}-${ym}`
}

/** AV-RET-{client}-{YYYYMM} — client slug = mbaidentifier or id */
export function retainerInvoiceReference(
  clientKey: string | number,
  periodMonth: string
): string {
  const ym = toPeriodMonthKey(periodMonth).replace("-", "")
  const key = String(clientKey ?? "").trim().toUpperCase().replace(/\s+/g, "")
  return `AV-RET-${key}-${ym}`
}

/** AV-SOW-{id}-{YYYYMM} */
export function sowInvoiceReference(sowId: string | number, periodMonth: string): string {
  const ym = toPeriodMonthKey(periodMonth).replace("-", "")
  return `AV-SOW-${String(sowId).trim()}-${ym}`
}

export function mediaNaturalKey(mbaNumber: string, versionId: number | string): string {
  return `media:${String(mbaNumber).trim().toUpperCase()}:v${versionId}`
}

export function retainerNaturalKey(clientId: number | string): string {
  return `retainer:client:${clientId}`
}

export function sowNaturalKey(sowId: number | string): string {
  return `sow:${sowId}`
}

/** Archived finance sheet pathnames (immutable; v2 never overwrites v1). */
export function financeSheetBlobPathname(
  periodMonth: string,
  sheetVersion: number
): string {
  const key = toPeriodMonthKey(periodMonth)
  const label = sheetVersion <= 1 ? "v1" : `v${sheetVersion}-amended`
  return `finance-periods/${key}/finance-sheet-${label}.xlsx`
}

export function financeSheetFilename(periodMonth: string, sheetVersion: number): string {
  const key = toPeriodMonthKey(periodMonth)
  if (sheetVersion <= 1) return `finance_sheet_${key}.xlsx`
  return `finance_sheet_${key}_v${sheetVersion}_amended.xlsx`
}
