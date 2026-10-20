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
  /** The client can see the tab: FEATURE_WEB_SEARCH is on and the report is published. */
  clientTabOn: boolean
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
 * Every client with a dashboard slug, so a report can be started for anyone.
 * Status is `client_web_reports.status` (`draft` or `published`); no row is `none`.
 */
export function queryAdminWebReportList(input: {
  clients: AdminWebReportClientSource[]
  accounts: AdminWebReportAccountSource[]
  reports: AdminWebReportRecordSource[]
  flagOn: boolean
}): AdminWebReportListRow[] {
  const webAccounts = input.accounts.filter(
    (account) => account.platform === "ga4" || account.platform === "gsc",
  )
  const reportByClient = new Map(input.reports.map((report) => [report.clientId, report]))
  const rows = input.clients.flatMap((client) => {
    const slug = client.slug?.trim() || null
    if (!slug) return []
    const report = reportByClient.get(client.id)
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
        clientTabOn: input.flagOn && reportStatus(report?.status) === "published",
      },
    ]
  })

  return rows.toSorted((a, b) => a.clientName.localeCompare(b.clientName, "en-AU"))
}
