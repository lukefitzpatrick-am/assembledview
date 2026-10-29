/**
 * Pure pieces of the monthly true-up run: which months, the stored row
 * shape and the email. No I/O.
 */
import { formatAUD } from "@/lib/format/money"
import { getSydneyWallClock } from "@/lib/finance/periods/sydneyClock"
import { fromCents } from "@/lib/money"

import {
  TRUE_UP_COMPONENTS,
  TRUE_UP_COMPONENT_LABELS,
  TRUE_UP_STATUS_LABELS,
  addMonths,
  financialYearStart,
  isTrueUpMonth,
  needsAction,
  type TrueUpReport,
} from "./compute"

/** As of the month just ended in Sydney, from the start of its financial year. A valid override wins. */
export function trueUpRunMonths(now: Date, asOfOverride?: string): { asOfMonth: string; fromMonth: string } {
  const asOfMonth =
    asOfOverride && isTrueUpMonth(asOfOverride) ? asOfOverride : addMonths(getSydneyWallClock(now).periodMonth, -1)
  return { asOfMonth, fromMonth: financialYearStart(asOfMonth) }
}

/** What a run row keeps per MBA: enough to list and compare runs, not the month grid. */
export function compactRunRows(report: TrueUpReport) {
  return report.rows.map((r) => ({
    mbaNumber: r.mbaNumber,
    clientName: r.clientName,
    campaignName: r.campaignName,
    versionNumber: r.versionNumber,
    status: r.status,
    components: Object.fromEntries(
      TRUE_UP_COMPONENTS.map((c) => [c, { status: r.components[c].status, gap: r.components[c].gap, uncoveredGap: r.components[c].uncoveredGap }]),
    ),
  }))
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function monthName(m: string): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })
}

function money(cents: number): string {
  return formatAUD(fromCents(cents))
}

const MAX_LISTED = 40

export function buildTrueUpRunEmail(
  report: TrueUpReport,
  opts: { appBaseUrl: string; source: "cron" | "manual" },
): { subject: string; html: string } {
  const need = report.rows.filter((r) => needsAction(r.status))
  const asOf = monthName(report.asOfMonth)
  const subject =
    need.length === 0
      ? `True-up to ${asOf}: everything matches`
      : `True-up to ${asOf}: ${need.length} ${need.length === 1 ? "plan needs" : "plans need"} action`
  const link = `${opts.appBaseUrl}/finance/reports/true-up`

  const totals = TRUE_UP_COMPONENTS.map((c) => {
    const credit = report.totals.creditByComponent[c]
    const charge = report.totals.chargeByComponent[c]
    if (credit === 0 && charge === 0) return ""
    return `<tr><td>${esc(TRUE_UP_COMPONENT_LABELS[c])}</td><td style="text-align:right">${esc(money(credit))}</td><td style="text-align:right">${esc(money(charge))}</td></tr>`
  }).join("")

  const listed = need.slice(0, MAX_LISTED).map((r) => {
    const gaps = TRUE_UP_COMPONENTS.filter((c) => needsAction(r.components[c].status))
      .map((c) => `${TRUE_UP_COMPONENT_LABELS[c]} ${money(r.components[c].uncoveredGap)} (${TRUE_UP_STATUS_LABELS[r.components[c].status]})`)
      .join(", ")
    return `<tr><td>${esc(r.mbaNumber)}</td><td>${esc(r.clientName)}</td><td>${esc(r.campaignName)}</td><td>${esc(gaps)}</td></tr>`
  }).join("")
  const more = need.length > MAX_LISTED ? `<p>And ${need.length - MAX_LISTED} more on the page.</p>` : ""

  const synced = report.xeroSyncedAt
    ? new Date(report.xeroSyncedAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })
    : "unknown"

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a">
<p>${opts.source === "cron" ? "The monthly true-up ran" : "A true-up was run from AV"} for ${esc(monthName(report.fromMonth))} to ${esc(asOf)}. It compares sent and approved Xero invoices with each plan's billing schedule. Nothing has been changed.</p>
<p><strong>${need.length}</strong> ${need.length === 1 ? "plan needs" : "plans need"} action. Xero last synced ${esc(synced)}.${report.provisionalInvoices > 0 ? ` ${report.provisionalInvoices} draft or unsent ${report.provisionalInvoices === 1 ? "invoice is" : "invoices are"} not counted.` : ""}</p>
${totals ? `<table cellpadding="4" style="border-collapse:collapse"><tr><th align="left">Component</th><th align="right">Credit due</th><th align="right">Charge due</th></tr>${totals}</table>` : ""}
${listed ? `<table cellpadding="4" style="border-collapse:collapse;margin-top:12px"><tr><th align="left">MBA</th><th align="left">Client</th><th align="left">Campaign</th><th align="left">Gap</th></tr>${listed}</table>${more}` : ""}
<p><a href="${esc(link)}">Open the true-up in AV</a></p>
<p style="color:#666">Plus is a credit due to the client, minus is a charge. Gaps under $1 count as matching.</p>
</div>`
  return { subject, html }
}
