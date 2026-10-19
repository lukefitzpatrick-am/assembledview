import "server-only"

import { eq, inArray, or } from "drizzle-orm"

import { getDb } from "@/db"
import { clientPlatformAccounts, clientWebReports, clients } from "@/db/schema"
import { webSearchClientAllowlist } from "@/lib/webReport/featureFlag"
import { migration0098Applied } from "@/lib/webReport/builder/repo"
import { queryAdminWebReportList, type AdminWebReportListRow } from "@/lib/webReport/admin/list"

export type AdminWebReportListResult = {
  ready: boolean
  rows: AdminWebReportListRow[]
}

export async function loadAdminWebReportList(): Promise<AdminWebReportListResult> {
  if (!(await migration0098Applied())) return { ready: false, rows: [] }

  try {
    const db = getDb()
    const [accounts, reports] = await Promise.all([
      db
        .select({
          clientId: clientPlatformAccounts.clientId,
          platform: clientPlatformAccounts.platform,
          accountRef: clientPlatformAccounts.accountRef,
        })
        .from(clientPlatformAccounts)
        .where(or(eq(clientPlatformAccounts.platform, "ga4"), eq(clientPlatformAccounts.platform, "gsc"))),
      db
        .select({
          clientId: clientWebReports.clientId,
          status: clientWebReports.status,
          updatedAt: clientWebReports.updatedAt,
          updatedBy: clientWebReports.updatedBy,
        })
        .from(clientWebReports),
    ])

    const ids = [
      ...new Set([...accounts.map((row) => row.clientId), ...reports.map((row) => row.clientId)]),
    ]
    if (ids.length === 0) return { ready: true, rows: [] }

    const clientRows = await db
      .select({
        id: clients.id,
        name: clients.mpClientName,
        slug: clients.slug,
      })
      .from(clients)
      .where(inArray(clients.id, ids))

    return {
      ready: true,
      rows: queryAdminWebReportList({
        clients: clientRows.map((row) => ({
          id: row.id,
          name: row.name?.trim() || "",
          slug: row.slug,
        })),
        accounts,
        reports,
        allowlist: webSearchClientAllowlist(),
      }),
    }
  } catch (err) {
    console.warn("[admin-web-reports] list unavailable", err)
    return { ready: false, rows: [] }
  }
}
