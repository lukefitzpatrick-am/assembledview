import { formatAccountRef } from "@/lib/clients/platformAccounts"

export type AdminWebReportStatus = "none" | "draft" | "published"

export type AdminWebReportClientSource = {
  id: number
  name: string
  slug: string | null
}

export type AdminWebReportAccountSource = {
  clientId: number
  platform: string
  accountRef: string
}

export type AdminWebReportRecordSource = {
  clientId: number
  status: string
  updatedAt: string | null
  updatedBy: string | null
}

export type AdminWebReportListRow = {
  clientId: number
  clientName: string
  slug: string | null
  ga4Label: string
  gscLabel: string
  /** `none` when the client has no `client_web_reports` row. Otherwise that row's `status`. */
  status: AdminWebReportStatus
  statusField: "client_web_reports.status"
  updatedAt: string | null
  updatedBy: string | null
  inClientAllowlist: boolean
}

const NOT_LINKED = "Not linked"

function accountLabel(platform: "ga4" | "gsc", refs: string[]): string {
  const labels = refs
    .map((ref) => ref.trim())
    .filter(Boolean)
    .map((ref) => formatAccountRef(platform, ref))
  return labels.length > 0 ? labels.join(", ") : NOT_LINKED
}

function reportStatus(status: string | undefined): AdminWebReportStatus {
  if (status === "draft" || status === "published") return status
  return "none"
}

/**
 * Clients with a ga4 or gsc platform-account row, or a client_web_reports row.
 * Status is `client_web_reports.status` (`draft` or `published`); no row is `none`.
 */
export function queryAdminWebReportList(input: {
  clients: AdminWebReportClientSource[]
  accounts: AdminWebReportAccountSource[]
  reports: AdminWebReportRecordSource[]
  allowlist: ReadonlySet<string>
}): AdminWebReportListRow[] {
  const webAccounts = input.accounts.filter(
    (account) => account.platform === "ga4" || account.platform === "gsc",
  )
  const reportByClient = new Map(input.reports.map((report) => [report.clientId, report]))
  const included = new Set<number>()
  for (const account of webAccounts) included.add(account.clientId)
  for (const report of input.reports) included.add(report.clientId)

  const rows = input.clients.flatMap((client) => {
    if (!included.has(client.id)) return []
    const report = reportByClient.get(client.id)
    const slug = client.slug?.trim() || null
    const ga4 = webAccounts
      .filter((account) => account.clientId === client.id && account.platform === "ga4")
      .map((account) => account.accountRef)
    const gsc = webAccounts
      .filter((account) => account.clientId === client.id && account.platform === "gsc")
      .map((account) => account.accountRef)
    return [
      {
        clientId: client.id,
        clientName: client.name.trim() || slug || `Client ${client.id}`,
        slug,
        ga4Label: accountLabel("ga4", ga4),
        gscLabel: accountLabel("gsc", gsc),
        status: reportStatus(report?.status),
        statusField: "client_web_reports.status" as const,
        updatedAt: report?.updatedAt ?? null,
        updatedBy: report?.updatedBy ?? null,
        inClientAllowlist: slug != null && input.allowlist.has(slug.toLowerCase()),
      },
    ]
  })

  return rows.toSorted((a, b) => a.clientName.localeCompare(b.clientName, "en-AU"))
}
