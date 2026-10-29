/**
 * What `/dashboard/[slug]/web` renders (pure).
 *
 * Clients: unchanged. FEATURE_WEB_SEARCH off, a slug they do not hold, or an
 * unpublished report is 404 (the page checks slug and published itself).
 *
 * Admins never get a 404 because of FEATURE_WEB_SEARCH. They see a notice
 * that the tab is off for everyone, then the same page as when it is on:
 * - no report row: the setup state (checklist, Connect accounts, Build report)
 * - a report that is not published: the report with a draft strip
 * - a report with no GA4 and no Search Console: the report with an accounts strip
 * - a failed status read: the report, no strip (never a made-up state)
 */

import type { WebReportAdminStatus } from "@/lib/webReport/admin/status"

export type WebPageMode =
  | { kind: "not_found" }
  | { kind: "client_report" }
  | { kind: "admin_setup"; flagOff: boolean; status: WebReportAdminStatus }
  | {
      kind: "admin_report"
      flagOff: boolean
      strip: "draft" | "accounts_missing" | null
      status: WebReportAdminStatus | null
    }

export function resolveWebPageMode(input: {
  isAdmin: boolean
  flagOn: boolean
  /** Admin only. Null when the status read failed or was not attempted. */
  status: WebReportAdminStatus | null
}): WebPageMode {
  if (!input.isAdmin) {
    return input.flagOn ? { kind: "client_report" } : { kind: "not_found" }
  }
  const flagOff = !input.flagOn
  const status = input.status
  if (!status) return { kind: "admin_report", flagOff, strip: null, status: null }
  if (status.state === "not_set_up") return { kind: "admin_setup", flagOff, status }
  if (status.state === "accounts_missing") return { kind: "admin_report", flagOff, strip: "accounts_missing", status }
  if (status.state === "draft") return { kind: "admin_report", flagOff, strip: "draft", status }
  return { kind: "admin_report", flagOff, strip: null, status }
}
