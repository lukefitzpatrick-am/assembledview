import "server-only"

import { and, eq, inArray } from "drizzle-orm"

import { getDb } from "@/db"
import { clientPlatformAccounts, clientWebReports, clients } from "@/db/schema"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import { migration0098Applied } from "@/lib/webReport/builder/repo"
import { isWebSearchFlagOn } from "@/lib/webReport/featureFlag"
import {
  resolveWebReportAdminStatus,
  webReportStatusesBySlug,
  type WebReportAdminStatus,
} from "@/lib/webReport/admin/status"

/**
 * Admin Web & search status loaders. Staff surfaces only (client hub, client
 * list, `/dashboard/[slug]/web` setup state). A failed read is `{ ok: false }`,
 * never a made-up "Not set up", so callers can hide the chip instead of
 * showing a wrong one.
 */
export type WebReportStatusResult =
  | { ok: true; status: WebReportAdminStatus }
  | { ok: false; reason: "not_ready" | "no_client" | "error" }

export type WebReportStatusesResult =
  | { ok: true; bySlug: Record<string, WebReportAdminStatus> }
  | { ok: false; reason: "not_ready" | "error" }

function clientIdFromRow(row: Record<string, unknown> | null): number | null {
  const raw = row?.id ?? row?.clients_id
  const id = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

export async function loadWebReportStatusForClientId(clientId: number): Promise<WebReportStatusResult> {
  if (!(await migration0098Applied())) return { ok: false, reason: "not_ready" }
  try {
    const db = getDb()
    const [reports, accounts] = await Promise.all([
      db
        .select({ status: clientWebReports.status, currentVersion: clientWebReports.currentVersion })
        .from(clientWebReports)
        .where(eq(clientWebReports.clientId, clientId))
        .limit(1),
      db
        .select({ platform: clientPlatformAccounts.platform })
        .from(clientPlatformAccounts)
        .where(
          and(
            eq(clientPlatformAccounts.clientId, clientId),
            eq(clientPlatformAccounts.active, true),
            inArray(clientPlatformAccounts.platform, ["ga4", "gsc"]),
          ),
        ),
    ])
    return {
      ok: true,
      status: resolveWebReportAdminStatus({
        report: reports[0] ?? null,
        ga4Count: accounts.filter((row) => row.platform === "ga4").length,
        gscCount: accounts.filter((row) => row.platform === "gsc").length,
        flagOn: isWebSearchFlagOn(),
      }),
    }
  } catch (err) {
    console.warn("[web-report-status] status unavailable", err)
    return { ok: false, reason: "error" }
  }
}

/** One client by dashboard slug (same slug lookup as the web report page). */
export async function loadWebReportStatusForSlug(slug: string): Promise<WebReportStatusResult> {
  let clientId: number | null = null
  try {
    clientId = clientIdFromRow(await fetchXanoClientRowByUrlSlug(slug))
  } catch (err) {
    console.warn("[web-report-status] client lookup failed", err)
    return { ok: false, reason: "error" }
  }
  if (clientId == null) return { ok: false, reason: "no_client" }
  return loadWebReportStatusForClientId(clientId)
}

/** Every client with a slug, in three queries (client list badge). */
export async function loadWebReportStatusesBySlug(): Promise<WebReportStatusesResult> {
  if (!(await migration0098Applied())) return { ok: false, reason: "not_ready" }
  try {
    const db = getDb()
    const [clientRows, reports, accounts] = await Promise.all([
      db.select({ id: clients.id, slug: clients.slug }).from(clients),
      db
        .select({
          clientId: clientWebReports.clientId,
          status: clientWebReports.status,
          currentVersion: clientWebReports.currentVersion,
        })
        .from(clientWebReports),
      db
        .select({
          clientId: clientPlatformAccounts.clientId,
          platform: clientPlatformAccounts.platform,
          active: clientPlatformAccounts.active,
        })
        .from(clientPlatformAccounts)
        .where(inArray(clientPlatformAccounts.platform, ["ga4", "gsc"])),
    ])
    return {
      ok: true,
      bySlug: webReportStatusesBySlug({ clients: clientRows, reports, accounts }, isWebSearchFlagOn()),
    }
  } catch (err) {
    console.warn("[web-report-status] statuses unavailable", err)
    return { ok: false, reason: "error" }
  }
}
