/**
 * Weekday overdue invoice digest for ops.
 * FY26 AUTHORISED invoices with amount due above zero and a due date before
 * today's Sydney civil date. Clients resolve with best_effort. Unresolved
 * contacts stay in the email under "No client link".
 * Amounts are the Xero amount due, GST inclusive.
 */

import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import { overdueDigestSends } from "@/db/schema/overdueDigestSends"
import { BRAND, EMAIL_FONT_STACK } from "@/lib/brand"
import { sydneyCivilParts } from "@/lib/codex/quickAddParse"
import { getOpsEmailRecipients, sendHtmlEmail } from "@/lib/email/sendHtmlEmail"
import { formatMoney } from "@/lib/format/money"
import { bucketForDaysOverdue, daysOverdue } from "@/lib/finance/sections/owedLedger"
import { resolveInvoiceClients } from "@/lib/finance/invoices/resolveInvoiceClient"
import { fromCents } from "@/lib/money"
import { FY26_AR_START } from "@/lib/xero/contactLinks"
import { rowsOf } from "@/lib/xero/dbRows"
import { coerceDollars, dollarsToCents } from "@/lib/xero/money"

export const NO_CLIENT_LINK_LABEL = "No client link"

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

export type OverdueAgeingKey = "d1_14" | "d15_30" | "d31_60" | "d60_plus"

export const OVERDUE_AGEING_LABELS: Record<OverdueAgeingKey, string> = {
  d1_14: "1-14",
  d15_30: "15-30",
  d31_60: "31-60",
  d60_plus: "60+",
}

export type OverdueDigestSource = {
  invoiceNumber: string | null
  dueDate: string
  amountDueCents: number
  mbaNumber: string | null
  contactName: string | null
  clientId: number | null
  clientName: string | null
}

export type OverdueDigestInvoice = {
  invoiceNumber: string | null
  dueDate: string
  daysOverdue: number
  amountDueCents: number
  mbaNumber: string | null
  contactName: string | null
}

export type OverdueDigestGroup = {
  key: string
  label: string
  unlinked: boolean
  invoices: OverdueDigestInvoice[]
  totalCents: number
}

export type OverdueDigest = {
  todayYmd: string
  invoiceCount: number
  totalDueCents: number
  ageing: Record<OverdueAgeingKey, number>
  groups: OverdueDigestGroup[]
  xeroUrl: string
}

export type OverdueDigestSendRow = {
  asOfDate: string
  invoiceCount: number
  totalDueCents: number
  recipients: string[]
}

export type OverdueDigestIo = {
  now?: Date
  enabled?: boolean
  recipients?: string[]
  xeroUrl?: string
  alreadySent: (asOfDate: string) => Promise<boolean>
  loadInvoices: (todayYmd: string) => Promise<OverdueDigestSource[]>
  sendHtmlEmail: (params: { to: string[]; subject: string; html: string }) => Promise<void>
  recordSend: (row: OverdueDigestSendRow) => Promise<void>
}

export type OverdueDigestRunResult =
  | { skipped: "disabled" | "weekend" | "already_sent" | "nothing_overdue" }
  | { status: "sent"; invoiceCount: number; totalDueCents: number; logged: boolean }

export function isOverdueDigestEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OVERDUE_DIGEST_ENABLED === "true"
}

export function overdueDigestXeroUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.APP_BASE_URL?.trim().replace(/\/$/, "")
  if (base) return `${base}/finance/xero`
  return "/finance/xero"
}

export function formatDigestCivilDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim())
  if (!match) return ymd
  const month = MONTHS[Number(match[2]) - 1]
  const day = Number(match[3])
  if (!month || !Number.isInteger(day)) return ymd
  return `${day} ${month} ${match[1]}`
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function emptyAgeing(): Record<OverdueAgeingKey, number> {
  return { d1_14: 0, d15_30: 0, d31_60: 0, d60_plus: 0 }
}

export function assembleOverdueDigest(
  sources: OverdueDigestSource[],
  options: { todayYmd: string; xeroUrl: string },
): OverdueDigest | null {
  const ageing = emptyAgeing()
  const byKey = new Map<string, OverdueDigestGroup>()
  let invoiceCount = 0
  let totalDueCents = 0

  for (const source of sources) {
    const days = daysOverdue(source.dueDate, options.todayYmd)
    if (days <= 0 || !Number.isFinite(source.amountDueCents) || source.amountDueCents <= 0) continue
    const bucket = bucketForDaysOverdue(days)
    if (bucket === "not_yet_due") continue
    ageing[bucket] += source.amountDueCents
    invoiceCount += 1
    totalDueCents += source.amountDueCents

    const unlinked = source.clientId == null
    const key = unlinked ? "unlinked" : `client:${source.clientId}`
    const label = unlinked
      ? NO_CLIENT_LINK_LABEL
      : source.clientName?.trim() || `Client ${source.clientId}`
    let group = byKey.get(key)
    if (!group) {
      group = { key, label, unlinked, invoices: [], totalCents: 0 }
      byKey.set(key, group)
    }
    group.invoices.push({
      invoiceNumber: blankToNull(source.invoiceNumber),
      dueDate: source.dueDate.slice(0, 10),
      daysOverdue: days,
      amountDueCents: source.amountDueCents,
      mbaNumber: blankToNull(source.mbaNumber),
      contactName: blankToNull(source.contactName),
    })
    group.totalCents += source.amountDueCents
  }

  if (invoiceCount === 0) return null

  for (const group of byKey.values()) {
    group.invoices.sort(
      (a, b) =>
        b.daysOverdue - a.daysOverdue ||
        (a.invoiceNumber ?? "").localeCompare(b.invoiceNumber ?? "", "en-AU"),
    )
  }

  const groups = [...byKey.values()].sort((a, b) => {
    if (a.unlinked !== b.unlinked) return a.unlinked ? 1 : -1
    return a.label.localeCompare(b.label, "en-AU")
  })

  return {
    todayYmd: options.todayYmd,
    invoiceCount,
    totalDueCents,
    ageing,
    groups,
    xeroUrl: options.xeroUrl,
  }
}

export function buildOverdueDigestSubject(digest: OverdueDigest): string {
  const amount = formatMoney(fromCents(digest.totalDueCents))
  return `Overdue invoices: ${digest.invoiceCount} totalling ${amount}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function moneyCell(cents: number): string {
  return escapeHtml(formatMoney(fromCents(cents)))
}

function invoiceRows(group: OverdueDigestGroup): string {
  return group.invoices
    .map((invoice) => {
      const contact = group.unlinked
        ? `<td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(invoice.contactName ?? "")}</td>`
        : ""
      return `<tr>
        ${contact}
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(invoice.invoiceNumber ?? "No number")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(formatDigestCivilDate(invoice.dueDate))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${invoice.daysOverdue}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${moneyCell(invoice.amountDueCents)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${escapeHtml(invoice.mbaNumber ?? "")}</td>
      </tr>`
    })
    .join("")
}

function groupHeading(group: OverdueDigestGroup, xeroUrl: string): string {
  const link = group.unlinked
    ? `<div style="font-size:13px;margin-top:4px;"><a href="${escapeHtml(xeroUrl)}" style="color:${BRAND.colour.forest};">Review unlinked contacts</a></div>`
    : ""
  return `<h2 style="margin:20px 0 8px;font-size:16px;font-weight:700;color:${BRAND.colour.ink};">${escapeHtml(group.label)}</h2>${link}`
}

function headerCells(unlinked: boolean): string {
  const contact = unlinked
    ? `<th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Contact</th>`
    : ""
  return `${contact}
    <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Invoice</th>
    <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Due</th>
    <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Days overdue</th>
    <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">Amount due</th>
    <th align="left" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};border-bottom:1px solid ${BRAND.colour.line};">MBA</th>`
}

export function buildOverdueDigestEmailHtml(digest: OverdueDigest): string {
  const ageingRows = (Object.keys(OVERDUE_AGEING_LABELS) as OverdueAgeingKey[])
    .map(
      (key) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${OVERDUE_AGEING_LABELS[key]} days</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.colour.line};font-family:${EMAIL_FONT_STACK};font-size:13px;color:${BRAND.colour.ink};">${moneyCell(digest.ageing[key])}</td>
      </tr>`,
    )
    .join("")

  const groups = digest.groups
    .map(
      (group) => `${groupHeading(group, digest.xeroUrl)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BRAND.colour.line};">
          <tr style="background:${BRAND.colour.sand};">${headerCells(group.unlinked)}</tr>
          ${invoiceRows(group)}
          <tr>
            <td colspan="${group.unlinked ? 6 : 5}" style="padding:8px 10px;font-family:${EMAIL_FONT_STACK};font-size:13px;font-weight:700;color:${BRAND.colour.ink};">Client total ${moneyCell(group.totalCents)}</td>
          </tr>
        </table>`,
    )
    .join("")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.colour.sand};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.colour.sand};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:${BRAND.colour.white};border:1px solid ${BRAND.colour.line};border-radius:8px;">
        <tr><td style="background:${BRAND.colour.ink};padding:16px 24px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:16px;font-weight:700;color:${BRAND.colour.white};">Assembled Media</div>
        </td></tr>
        <tr><td style="padding:20px 24px 8px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:20px;font-weight:700;color:${BRAND.colour.ink};">Overdue invoices</div>
          <div style="font-size:13px;color:${BRAND.colour.muted};margin-top:4px;">As of ${escapeHtml(formatDigestCivilDate(digest.todayYmd))} (Sydney)</div>
        </td></tr>
        <tr><td style="padding:8px 24px 8px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:14px;font-weight:700;color:${BRAND.colour.ink};margin-bottom:8px;">Ageing</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BRAND.colour.line};">
            ${ageingRows}
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 8px;font-family:${EMAIL_FONT_STACK};">
          ${groups}
          <div style="margin-top:16px;font-size:16px;font-weight:700;color:${BRAND.colour.ink};">Grand total ${moneyCell(digest.totalDueCents)}</div>
        </td></tr>
        <tr><td style="padding:8px 24px 20px;font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};">
          Internal ops email. Amounts include GST.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

type ArRow = {
  invoice_number: string | null
  due_date: string | null
  amount_due: unknown
  mba_number: string | null
  contact_name: string | null
  xero_contact_id: string | null
}

export async function loadOverdueDigestSources(todayYmd: string): Promise<OverdueDigestSource[]> {
  const db = getDb()
  const [invoiceRows, clientRows] = await Promise.all([
    rowsOf<ArRow>(
      await db.execute(sql`
        SELECT
          i.invoice_number,
          i.due_date::text AS due_date,
          i.amount_due,
          i.mba_number,
          i.xero_contact_id,
          c.name AS contact_name
        FROM xero_ar_invoices i
        LEFT JOIN xero_contacts c ON c.xero_contact_id = i.xero_contact_id
        WHERE i.issue_date >= ${FY26_AR_START}
          AND upper(btrim(coalesce(i.status, ''))) = 'AUTHORISED'
          AND i.amount_due > 0
          AND i.due_date < ${todayYmd}::date
      `),
    ),
    rowsOf<{ id: number; mp_client_name: string | null }>(
      await db.execute(sql`SELECT id, mp_client_name FROM clients`),
    ),
  ])

  const names = new Map(clientRows.map((row) => [Number(row.id), row.mp_client_name]))
  const inputs = invoiceRows.flatMap((row) => {
    const dueDate = row.due_date?.slice(0, 10) ?? ""
    const amountDueCents = dollarsToCents(coerceDollars(row.amount_due))
    if (!dueDate || amountDueCents <= 0) return []
    return [
      {
        contactName: row.contact_name,
        xeroContactId: row.xero_contact_id,
        mbaNumber: row.mba_number,
        invoiceNumber: row.invoice_number,
        dueDate,
        amountDueCents,
        mba: row.mba_number,
      },
    ]
  })

  const resolved = await resolveInvoiceClients(
    inputs.map((row) => ({
      contactName: row.contactName,
      xeroContactId: row.xeroContactId,
      mbaNumber: row.mbaNumber,
    })),
    { mode: "best_effort" },
  )

  return inputs.map((row, index) => {
    const clientId = resolved[index]?.clientId ?? null
    return {
      invoiceNumber: row.invoiceNumber,
      dueDate: row.dueDate,
      amountDueCents: row.amountDueCents,
      mbaNumber: row.mba,
      contactName: row.contactName,
      clientId,
      clientName: clientId == null ? null : names.get(clientId) ?? null,
    }
  })
}

async function productionAlreadySent(asOfDate: string): Promise<boolean> {
  const rows = rowsOf<{ as_of_date: string }>(
    await getDb().execute(
      sql`SELECT as_of_date::text AS as_of_date FROM overdue_digest_sends WHERE as_of_date = ${asOfDate}::date LIMIT 1`,
    ),
  )
  return rows.length > 0
}

async function productionRecordSend(row: OverdueDigestSendRow): Promise<void> {
  await getDb().insert(overdueDigestSends).values({
    asOfDate: row.asOfDate,
    invoiceCount: row.invoiceCount,
    totalDueCents: row.totalDueCents,
    recipients: row.recipients,
  })
}

export async function runOverdueDigest(io: Partial<OverdueDigestIo> = {}): Promise<OverdueDigestRunResult> {
  const enabled = io.enabled ?? isOverdueDigestEnabled()
  if (!enabled) return { skipped: "disabled" }

  const civil = sydneyCivilParts(io.now ?? new Date())
  if (civil.weekday === 0 || civil.weekday === 6) return { skipped: "weekend" }

  const alreadySent = io.alreadySent ?? productionAlreadySent
  if (await alreadySent(civil.ymd)) return { skipped: "already_sent" }

  const loadInvoices = io.loadInvoices ?? loadOverdueDigestSources
  const digest = assembleOverdueDigest(await loadInvoices(civil.ymd), {
    todayYmd: civil.ymd,
    xeroUrl: io.xeroUrl ?? overdueDigestXeroUrl(),
  })
  if (!digest) return { skipped: "nothing_overdue" }

  const recipients = io.recipients ?? getOpsEmailRecipients()
  const send = io.sendHtmlEmail ?? sendHtmlEmail
  await send({
    to: recipients,
    subject: buildOverdueDigestSubject(digest),
    html: buildOverdueDigestEmailHtml(digest),
  })

  const recordSend = io.recordSend ?? productionRecordSend
  try {
    await recordSend({
      asOfDate: civil.ymd,
      invoiceCount: digest.invoiceCount,
      totalDueCents: digest.totalDueCents,
      recipients,
    })
  } catch (err) {
    console.error(
      "[overdue-digest] email sent but overdue_digest_sends insert failed. A repeat tomorrow is acceptable. Do not crash-loop.",
      err,
    )
    return {
      status: "sent",
      invoiceCount: digest.invoiceCount,
      totalDueCents: digest.totalDueCents,
      logged: false,
    }
  }

  return {
    status: "sent",
    invoiceCount: digest.invoiceCount,
    totalDueCents: digest.totalDueCents,
    logged: true,
  }
}
