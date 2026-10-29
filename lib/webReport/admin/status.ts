/**
 * Admin-facing Web & search status for one client (pure, client-safe).
 *
 * One answer for the client hub chip, the client list badge and the setup
 * state on `/dashboard/[slug]/web`. Read from `client_web_reports` plus the
 * client's active `ga4` / `gsc` rows on `client_platform_accounts`.
 *
 * Order (first match wins):
 * 1. no report row                         -> not_set_up
 * 2. a report row, no GA4 and no GSC       -> accounts_missing
 * 3. status published, current_version > 0 -> published
 * 4. any other report row                  -> draft
 *
 * "Published" uses the same test as `isWebReportPublished`
 * (`lib/webReport/visibility.ts`). A client sees the tab only when it is
 * published and FEATURE_WEB_SEARCH is on (`clientCanSee`).
 */

import type { Tone } from "@/lib/design/status"

export type WebReportAdminState = "published" | "draft" | "not_set_up" | "accounts_missing"

export type WebReportRecordInput = {
  status: string | null | undefined
  currentVersion: number | null | undefined
}

export type WebReportAdminStatus = {
  state: WebReportAdminState
  label: string
  /** A report row exists (draft or published). */
  hasReport: boolean
  /** The saved report is published (status published, version above 0). */
  published: boolean
  ga4Connected: boolean
  gscConnected: boolean
  /** The client can see the tab: published and FEATURE_WEB_SEARCH on. */
  clientCanSee: boolean
}

export const WEB_REPORT_STATE_LABEL: Record<WebReportAdminState, string> = {
  published: "Published",
  draft: "Draft",
  not_set_up: "Not set up",
  accounts_missing: "Accounts missing",
}

export function isPublishedRecord(report: WebReportRecordInput | null | undefined): boolean {
  if (!report) return false
  return report.status === "published" && (report.currentVersion ?? 0) > 0
}

export function resolveWebReportAdminStatus(input: {
  report: WebReportRecordInput | null | undefined
  ga4Count: number
  gscCount: number
  flagOn: boolean
}): WebReportAdminStatus {
  const ga4Connected = input.ga4Count > 0
  const gscConnected = input.gscCount > 0
  const hasReport = input.report != null
  const published = isPublishedRecord(input.report)
  let state: WebReportAdminState
  if (!hasReport) state = "not_set_up"
  else if (!ga4Connected && !gscConnected) state = "accounts_missing"
  else if (published) state = "published"
  else state = "draft"
  return {
    state,
    label: WEB_REPORT_STATE_LABEL[state],
    hasReport,
    published,
    ga4Connected,
    gscConnected,
    clientCanSee: published && input.flagOn,
  }
}

export function webReportStateTone(state: WebReportAdminState): Tone {
  if (state === "published") return "outcome"
  if (state === "draft") return "attention"
  if (state === "accounts_missing") return "attention"
  return "neutral"
}

export type WebReportStatusRows = {
  clients: Array<{ id: number; slug: string | null }>
  reports: Array<{ clientId: number; status: string | null; currentVersion: number | null }>
  accounts: Array<{ clientId: number; platform: string; active: boolean | null }>
}

/** Batch: one status per client slug (lower-case key). Clients with no slug are skipped. */
export function webReportStatusesBySlug(
  rows: WebReportStatusRows,
  flagOn: boolean,
): Record<string, WebReportAdminStatus> {
  const reportByClient = new Map(rows.reports.map((report) => [report.clientId, report]))
  const ga4 = new Map<number, number>()
  const gsc = new Map<number, number>()
  for (const account of rows.accounts) {
    if (account.active === false) continue
    if (account.platform === "ga4") ga4.set(account.clientId, (ga4.get(account.clientId) ?? 0) + 1)
    if (account.platform === "gsc") gsc.set(account.clientId, (gsc.get(account.clientId) ?? 0) + 1)
  }
  const out: Record<string, WebReportAdminStatus> = {}
  for (const client of rows.clients) {
    const slug = client.slug?.trim().toLowerCase()
    if (!slug) continue
    out[slug] = resolveWebReportAdminStatus({
      report: reportByClient.get(client.id) ?? null,
      ga4Count: ga4.get(client.id) ?? 0,
      gscCount: gsc.get(client.id) ?? 0,
      flagOn,
    })
  }
  return out
}

/** Viewer URL for a client's Web & search report. */
export function webReportViewerHref(slug: string): string {
  return `/dashboard/${encodeURIComponent(slug)}/web`
}

/** Admin builder URL for a client's Web & search report. */
export function webReportBuilderHref(slug: string): string {
  return `/admin/web-reports/${encodeURIComponent(slug)}`
}

/** Client hub URL that opens the platform accounts section. */
export function platformAccountsHref(slug: string): string {
  return `/client/${encodeURIComponent(slug)}#platform-accounts`
}
