export type ReportAccountRow = {
  id: number
  platform: string
  accountRef: string
  active: boolean
  createdAt: string
}

export type ReportAccounts = {
  ga4PropertyId: string | null
  gscSite: string | null
  /** Platforms with more than one usable active row. The oldest row wins. */
  duplicates: Array<"ga4" | "gsc">
}

export function ga4Digits(ref: string | null | undefined): string | null {
  if (!ref) return null
  const digits = ref.replace(/^properties\//i, "").trim()
  return /^\d+$/.test(digits) ? digits : null
}

function gscSiteRef(ref: string | null | undefined): string | null {
  const site = ref?.trim()
  return site ? site : null
}

function oldestFirst(a: ReportAccountRow, b: ReportAccountRow): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id - b.id
}

function pick(
  rows: ReportAccountRow[],
  platform: "ga4" | "gsc",
  read: (ref: string) => string | null,
): { value: string | null; duplicate: boolean } {
  const usable = rows
    .filter((row) => row.active && row.platform === platform && read(row.accountRef) != null)
    .sort(oldestFirst)
  const first = usable[0]
  return { value: first ? read(first.accountRef) : null, duplicate: usable.length > 1 }
}

/** GA4 and Search Console for a Web & search report come from client_platform_accounts only. */
export function pickReportAccounts(rows: ReportAccountRow[]): ReportAccounts {
  const ga4 = pick(rows, "ga4", ga4Digits)
  const gsc = pick(rows, "gsc", gscSiteRef)
  const duplicates: Array<"ga4" | "gsc"> = []
  if (ga4.duplicate) duplicates.push("ga4")
  if (gsc.duplicate) duplicates.push("gsc")
  return { ga4PropertyId: ga4.value, gscSite: gsc.value, duplicates }
}
