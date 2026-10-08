/**
 * Loads report_runs for the digest and writes report_digest_sends.
 * Migration 0095 must be applied before this runs (C-76).
 */
import "server-only"

import { sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { getOpsEmailRecipients, sendHtmlEmail } from "@/lib/email/sendHtmlEmail"
import { rowsOf } from "@/lib/xero/dbRows"
import {
  MONTHLY_CAMPAIGN_REPORT_KIND,
  maybeSendMonthlyReportDigest,
  reportDigestRecipients,
  type DigestRunRow,
  type MaybeSendReportDigestResult,
  type ReportDigestSend,
} from "@/lib/reports/reportDigest"

function textOrNull(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

export async function loadMonthlyReportDigestRows(periodStart: string): Promise<DigestRunRow[]> {
  const result = await getDb().execute(sql`
    SELECT
      r.mba_number,
      r.status,
      r.blob_pathname,
      r.skip_reason,
      r.error,
      m.mp_client_name,
      m.campaign_name
    FROM report_runs r
    LEFT JOIN media_plan_masters m ON m.mba_number = r.mba_number
    WHERE r.kind = ${MONTHLY_CAMPAIGN_REPORT_KIND}
      AND r.period_start = ${periodStart}::date
    ORDER BY m.mp_client_name NULLS LAST, m.campaign_name NULLS LAST, r.mba_number
  `)
  return rowsOf<Record<string, unknown>>(result).map((row) => ({
    mbaNumber: String(row.mba_number ?? ""),
    status: String(row.status ?? ""),
    clientName: textOrNull(row.mp_client_name),
    campaignName: textOrNull(row.campaign_name),
    blobPathname: textOrNull(row.blob_pathname),
    skipReason: textOrNull(row.skip_reason),
    error: textOrNull(row.error),
  }))
}

export async function reportDigestAlreadySent(
  kind: string,
  periodStart: string,
): Promise<boolean> {
  const result = await getDb().execute(sql`
    SELECT 1 AS found
    FROM report_digest_sends
    WHERE kind = ${kind}
      AND period_start = ${periodStart}::date
    LIMIT 1
  `)
  return rowsOf(result).length > 0
}

export async function recordReportDigestSend(row: ReportDigestSend): Promise<void> {
  await getDb()
    .insert(schema.reportDigestSends)
    .values({
      kind: row.kind,
      periodStart: row.periodStart,
      recipients: row.recipients,
      runCount: row.runCount,
    })
    .onConflictDoNothing()
}

export async function sendMonthlyReportDigestIfReady(
  now: Date = new Date(),
): Promise<MaybeSendReportDigestResult> {
  return maybeSendMonthlyReportDigest({
    now,
    loadRows: loadMonthlyReportDigestRows,
    digestAlreadySent: reportDigestAlreadySent,
    send: async (params) => {
      await sendHtmlEmail({
        to: params.to,
        subject: params.subject,
        html: params.html,
      })
    },
    recordSend: recordReportDigestSend,
    recipients: reportDigestRecipients(
      { REPORTS_EMAIL_TO: process.env.REPORTS_EMAIL_TO },
      getOpsEmailRecipients,
    ),
    appBaseUrl: process.env.APP_BASE_URL,
  })
}
