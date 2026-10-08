/**
 * One internal email when a month's campaign reports are finished.
 * The worker calls this at the end of each run. Tests inject the loaders
 * and the send function. Nothing here talks to SendGrid or Postgres.
 */

import { BRAND, EMAIL_FONT_STACK } from "@/lib/brand"
import {
  MONTHLY_CAMPAIGN_REPORT_KIND,
  previousSydneyMonth,
} from "@/lib/reports/selectMonthlyReportMbas"

export { MONTHLY_CAMPAIGN_REPORT_KIND }

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export type DigestRunRow = {
  mbaNumber: string
  status: string
  clientName: string | null
  campaignName: string | null
  blobPathname: string | null
  skipReason: string | null
  error: string | null
}

export type SydneyDigestClock = {
  ymd: string
  day: number
  hour: number
  minute: number
}

export type ReportDigestSend = {
  kind: string
  periodStart: string
  recipients: string[]
  runCount: number
}

export type MaybeSendReportDigestResult =
  | { sent: false; reason: "no_rows" | "still_running" | "already_sent" }
  | { sent: true; runCount: number; logged: boolean }

type MaybeSendDeps = {
  now?: Date
  loadRows: (periodStart: string) => Promise<DigestRunRow[]>
  digestAlreadySent: (kind: string, periodStart: string) => Promise<boolean>
  send: (params: { to: string[]; subject: string; html: string }) => Promise<void>
  recordSend: (row: ReportDigestSend) => Promise<void>
  recipients: string[]
  appBaseUrl?: string
}

function splitAddresses(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

/** `REPORTS_EMAIL_TO` when set, otherwise the ops list. */
export function reportDigestRecipients(
  env: { REPORTS_EMAIL_TO?: string },
  fallback: () => string[],
): string[] {
  const raw = env.REPORTS_EMAIL_TO?.trim()
  if (raw) return splitAddresses(raw)
  return fallback()
}

export function sydneyDigestClock(instant: Date): SydneyDigestClock {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const map: Record<string, string> = {}
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== "literal") map[part.type] = part.value
  }
  const year = Number(map.year)
  const month = Number(map.month)
  const day = Number(map.day)
  const hour = Number(map.hour)
  const minute = Number(map.minute)
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    ymd: `${year}-${pad(month)}-${pad(day)}`,
    day,
    hour,
    minute,
  }
}

/** Sydney 5th, 16:00 onwards. The queue does not have to be empty. */
export function isReportDigestDeadline(clock: SydneyDigestClock): boolean {
  return clock.day === 5 && clock.hour >= 16
}

export function reportDigestMonthLabel(periodStart: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodStart)
  if (!match) return periodStart
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return periodStart
  return `${month} ${match[1]}`
}

export function reportDigestSubject(periodStart: string): string {
  return `Monthly campaign reports: ${reportDigestMonthLabel(periodStart)}`
}

export function reportDownloadUrl(appBaseUrl: string | undefined, blobPathname: string): string {
  const path = `/api/reports/download?path=${encodeURIComponent(blobPathname)}`
  const base = appBaseUrl?.trim().replace(/\/$/, "")
  if (!base) return path
  return `${base}${path}`
}

function rowsInFlight(rows: readonly DigestRunRow[]): boolean {
  return rows.some((row) => row.status === "queued" || row.status === "generating")
}

/**
 * Send only when enqueue has written at least one row, the queue is idle
 * or the Sydney 5th deadline has passed, and this period has not been emailed.
 */
export function reportDigestDecision(args: {
  rowCount: number
  inFlight: boolean
  alreadySent: boolean
  deadline: boolean
}): "send" | "no_rows" | "still_running" | "already_sent" {
  if (args.rowCount === 0) return "no_rows"
  if (args.alreadySent) return "already_sent"
  if (args.inFlight && !args.deadline) return "still_running"
  return "send"
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function clientLabel(name: string | null): string {
  const trimmed = name?.trim()
  return trimmed || "No client"
}

function campaignLabel(name: string | null, mbaNumber: string): string {
  const trimmed = name?.trim()
  return trimmed || mbaNumber
}

function statusLabel(status: string): string {
  if (status === "generated") return "Generated"
  if (status === "skipped") return "Skipped"
  if (status === "failed") return "Failed"
  if (status === "queued") return "Queued"
  if (status === "generating") return "Generating"
  return status
}

function reasonFor(row: DigestRunRow): string {
  if (row.status === "skipped") return row.skipReason?.trim() || "No reason recorded"
  if (row.status === "failed") return row.error?.trim() || "No reason recorded"
  return ""
}

export function reportDigestCountLine(rows: readonly DigestRunRow[]): string {
  const counts = { generated: 0, skipped: 0, failed: 0, queued: 0, generating: 0 }
  for (const row of rows) {
    if (row.status === "generated") counts.generated += 1
    else if (row.status === "skipped") counts.skipped += 1
    else if (row.status === "failed") counts.failed += 1
    else if (row.status === "queued") counts.queued += 1
    else if (row.status === "generating") counts.generating += 1
  }
  const parts = [
    `${counts.generated} generated`,
    `${counts.skipped} skipped`,
    `${counts.failed} failed`,
  ]
  if (counts.queued > 0) parts.push(`${counts.queued} queued`)
  if (counts.generating > 0) parts.push(`${counts.generating} generating`)
  return `${parts.join(", ")}.`
}

function groupByClient(rows: readonly DigestRunRow[]): { label: string; rows: DigestRunRow[] }[] {
  const groups = new Map<string, DigestRunRow[]>()
  for (const row of rows) {
    const label = clientLabel(row.clientName)
    const list = groups.get(label)
    if (list) list.push(row)
    else groups.set(label, [row])
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, list]) => ({
      label,
      rows: list.toSorted((a, b) =>
        campaignLabel(a.campaignName, a.mbaNumber).localeCompare(
          campaignLabel(b.campaignName, b.mbaNumber),
        ) || a.mbaNumber.localeCompare(b.mbaNumber),
      ),
    }))
}

function downloadCell(row: DigestRunRow, appBaseUrl: string | undefined): string {
  if (row.status === "generated" && row.blobPathname?.trim()) {
    const href = reportDownloadUrl(appBaseUrl, row.blobPathname.trim())
    return `<a href="${escapeHtml(href)}" style="color:${BRAND.colour.forest};font-weight:700;">Download</a>`
  }
  const reason = reasonFor(row)
  if (reason) return escapeHtml(reason)
  return ""
}

export function buildReportDigestEmailHtml(args: {
  periodStart: string
  rows: readonly DigestRunRow[]
  appBaseUrl?: string
}): string {
  const groups = groupByClient(args.rows)
    .map((group) => {
      const body = group.rows
        .map(
          (row) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(campaignLabel(row.campaignName, row.mbaNumber))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(row.mbaNumber)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(statusLabel(row.status))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${downloadCell(row, args.appBaseUrl)}</td>
      </tr>`,
        )
        .join("")
      return `<tr><td style="padding:16px 24px 4px;font-family:${EMAIL_FONT_STACK};">
        <div style="font-size:15px;font-weight:700;color:${BRAND.colour.ink};">${escapeHtml(group.label)}</div>
      </td></tr>
      <tr><td style="padding:4px 24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BRAND.colour.line};">
          <tr style="background:${BRAND.colour.sand};">
            <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Campaign</th>
            <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">MBA</th>
            <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Status</th>
            <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Download</th>
          </tr>
          ${body}
        </table>
      </td></tr>`
    })
    .join("")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.colour.sand};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.colour.sand};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:${BRAND.colour.white};border:1px solid ${BRAND.colour.line};border-radius:8px;overflow:hidden;">
        <tr><td style="background:${BRAND.colour.ink};padding:16px 24px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:16px;font-weight:700;color:${BRAND.colour.white};">Assembled Media</div>
        </td></tr>
        <tr><td style="padding:20px 24px 8px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:20px;font-weight:700;color:${BRAND.colour.ink};">Monthly campaign reports</div>
          <div style="font-size:13px;color:${BRAND.colour.muted};margin-top:4px;">${escapeHtml(reportDigestMonthLabel(args.periodStart))}</div>
          <div style="font-size:13px;color:${BRAND.colour.ink};margin-top:8px;">${escapeHtml(reportDigestCountLine(args.rows))}</div>
        </td></tr>
        ${groups}
        <tr><td style="padding:0 24px 20px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};">
          Internal email. Download links need an AssembledView login.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function maybeSendMonthlyReportDigest(
  deps: MaybeSendDeps,
): Promise<MaybeSendReportDigestResult> {
  const clock = sydneyDigestClock(deps.now ?? new Date())
  const period = previousSydneyMonth(clock.ymd)
  const rows = await deps.loadRows(period.periodStart)
  const alreadySent =
    rows.length === 0
      ? false
      : await deps.digestAlreadySent(MONTHLY_CAMPAIGN_REPORT_KIND, period.periodStart)
  const decision = reportDigestDecision({
    rowCount: rows.length,
    inFlight: rowsInFlight(rows),
    alreadySent,
    deadline: isReportDigestDeadline(clock),
  })
  if (decision !== "send") return { sent: false, reason: decision }

  const subject = reportDigestSubject(period.periodStart)
  const html = buildReportDigestEmailHtml({
    periodStart: period.periodStart,
    rows,
    appBaseUrl: deps.appBaseUrl,
  })
  await deps.send({ to: deps.recipients, subject, html })

  try {
    await deps.recordSend({
      kind: MONTHLY_CAMPAIGN_REPORT_KIND,
      periodStart: period.periodStart,
      recipients: deps.recipients,
      runCount: rows.length,
    })
  } catch (err) {
    console.error(
      "[reports-worker] digest email sent but report_digest_sends insert failed",
      err,
    )
    return { sent: true, runCount: rows.length, logged: false }
  }

  return { sent: true, runCount: rows.length, logged: true }
}
