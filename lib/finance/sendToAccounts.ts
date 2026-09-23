/**
 * Send-to-accounts pack. Pure selection, CSV, preview, and the orchestrator.
 * Blob upload and Microsoft 365 send are injected. Stamps run only after the
 * email succeeds, in the caller's transaction.
 */

import type { BillingRecord } from "@/lib/types/financeBilling"

export const ACCOUNTS_NOTIFY_UNSET_MESSAGE =
  "ACCOUNTS_NOTIFY_EMAIL is not set. Nothing was sent or written."

export class AccountsNotifyUnsetError extends Error {
  readonly status = 409
  constructor() {
    super(ACCOUNTS_NOTIFY_UNSET_MESSAGE)
    this.name = "AccountsNotifyUnsetError"
  }
}

export class AccountsPackEmailError extends Error {
  readonly status = 502
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Could not email the billing pack.")
    this.name = "AccountsPackEmailError"
  }
}

const PACK_TYPES = new Set(["media", "sow", "retainer"])

export type PackBillingType = "media" | "sow" | "retainer"

export type AccountsPackRow = {
  invoiceKey: string
  persistedId: number
  clientsId: number
  clientName: string
  mbaNumber: string
  campaignName: string
  billingType: PackBillingType
  status: string
  billingMonth: string
  total: number
  blockers: string[]
}

export type AccountsPackTotals = Record<PackBillingType, { count: number; total: number }>

export type AccountsPackPreview = {
  month: string
  monthLabel: string
  rows: AccountsPackRow[]
  totalsByType: AccountsPackTotals
  invoiceCount: number
  totalExGst: number
  blockers: AccountsPackRow[]
}

export type ExportBlobPaths = { csv: string; xlsx: string }

export type AccountsPackCommit = {
  rows: AccountsPackRow[]
  blobPath: string
  paths: ExportBlobPaths
  exportedBy: number
}

export type SendToAccountsDeps = {
  accountsEmail: string | null | undefined
  financeEmail?: string | null
  now?: () => Date
  buildWorkbook: (rows: AccountsPackRow[]) => Promise<Buffer>
  store: (input: {
    fy: number
    month: string
    timestamp: string
    csv: string
    xlsx: Buffer
  }) => Promise<ExportBlobPaths>
  sendEmail: (input: {
    to: string
    cc?: string
    subject: string
    text: string
    attachments: { filename: string; contentType: string; bytes: Buffer }[]
  }) => Promise<void>
  commit: (input: AccountsPackCommit) => Promise<void>
}

export function accountsNotifyEmail(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): string {
  const to = env.ACCOUNTS_NOTIFY_EMAIL?.trim() ?? ""
  if (!to) throw new AccountsNotifyUnsetError()
  return to
}

export function accountsPackMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)))
}

export function accountsPackTimestamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

export function accountsPackSubject(monthLabel: string, count: number, totalExGst: number): string {
  const money = totalExGst.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `AssembledView billing pack ${monthLabel} - ${count} invoices - $${money} ex-GST`
}

export function accountsPackBody(blockers: AccountsPackRow[]): string {
  const lines = [
    "Key the drafts from the CSV.",
    "Put the MBA or scope id in brackets in the Reference.",
    "Do not authorise until the clearance email.",
  ]
  if (blockers.length === 0) return lines.join("\n")
  lines.push("", "Blockers are included in the pack:")
  for (const row of blockers) {
    const who = row.clientName || "Client"
    const ref = row.mbaNumber ? ` (${row.mbaNumber})` : ""
    lines.push(`- ${who}${ref}: ${row.blockers.join("; ")}`)
  }
  return lines.join("\n")
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/** Same columns and quoting as `exportBillingRecordsCsv`. */
export function buildBillingPackCsv(rows: AccountsPackRow[]): string {
  const header = [
    "client_name",
    "mba_number",
    "campaign_name",
    "billing_type",
    "status",
    "billing_month",
    "total",
  ].join(",")
  const body = rows.map((r) =>
    [
      csvCell(r.clientName),
      csvCell(r.mbaNumber),
      csvCell(r.campaignName),
      r.billingType,
      r.status,
      r.billingMonth,
      Number(r.total || 0).toFixed(2),
    ].join(",")
  )
  return [header, ...body].join("\n")
}

export function encodeExportBlobPath(paths: ExportBlobPaths): string {
  return JSON.stringify(paths)
}

export function parseExportBlobPath(value: unknown): ExportBlobPaths | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const parsed = JSON.parse(value) as { csv?: unknown; xlsx?: unknown }
    if (typeof parsed.csv !== "string" || typeof parsed.xlsx !== "string") return null
    if (!isFinanceExportPath(parsed.csv) || !isFinanceExportPath(parsed.xlsx)) return null
    return { csv: parsed.csv, xlsx: parsed.xlsx }
  } catch {
    return null
  }
}

export function isFinanceExportPath(pathname: string): boolean {
  if (pathname.includes("..") || pathname.includes("\\") || pathname.includes("://")) return false
  return /^finance-exports\/\d{4}\/\d{4}-\d{2}\/[^/]+-(csv|xlsx)$/.test(pathname)
}

export function financeExportDownloadHref(pathname: string): string {
  return `/api/finance/exports/download?path=${encodeURIComponent(pathname)}`
}

function emptyTotals(): AccountsPackTotals {
  return {
    media: { count: 0, total: 0 },
    sow: { count: 0, total: 0 },
    retainer: { count: 0, total: 0 },
  }
}

export function previewAccountsPack(month: string, rows: AccountsPackRow[]): AccountsPackPreview {
  const totalsByType = emptyTotals()
  let totalExGst = 0
  for (const row of rows) {
    const bucket = totalsByType[row.billingType]
    bucket.count += 1
    bucket.total += row.total
    totalExGst += row.total
  }
  return {
    month,
    monthLabel: accountsPackMonthLabel(month),
    rows,
    totalsByType,
    invoiceCount: rows.length,
    totalExGst,
    blockers: rows.filter((row) => row.blockers.length > 0),
  }
}

export function packRowsFromBillingRecords(
  records: BillingRecord[],
  month: string,
  ctx: {
    linkedClientIds: ReadonlySet<number>
    legalNameByClientId: ReadonlyMap<number, string>
  }
): AccountsPackRow[] {
  const out: AccountsPackRow[] = []
  for (const record of records) {
    if (record.billing_month !== month) continue
    if (!PACK_TYPES.has(record.billing_type)) continue
    if (!record.approved_at) continue
    if (record.exported_at) continue
    const invoiceKey = record.invoice_key?.trim() ?? ""
    const persistedId = Number(record.persisted_record_id)
    if (!invoiceKey || !Number.isFinite(persistedId) || persistedId <= 0) continue
    const clientsId = Number(record.clients_id)
    const blockers: string[] = []
    if (!Number.isFinite(clientsId) || clientsId <= 0 || !ctx.linkedClientIds.has(clientsId)) {
      blockers.push("no Xero contact link")
    }
    const legal = ctx.legalNameByClientId.get(clientsId)?.trim() ?? ""
    if (!legal) blockers.push("legal name missing")
    out.push({
      invoiceKey,
      persistedId,
      clientsId: Number.isFinite(clientsId) ? clientsId : 0,
      clientName: (record.client_name || "").trim(),
      mbaNumber: (record.mba_number || "").trim(),
      campaignName: (record.campaign_name || "").trim(),
      billingType: record.billing_type as PackBillingType,
      status: record.status || "",
      billingMonth: record.billing_month,
      total: Number(record.total || 0),
      blockers,
    })
  }
  return out
}

export async function runSendToAccounts(input: {
  fy: number
  month: string
  rows: AccountsPackRow[]
  exportedBy: number
  deps: SendToAccountsDeps
}): Promise<{ sent: number; totalExGst: number; paths: ExportBlobPaths | null }> {
  const to = accountsNotifyEmail({ ACCOUNTS_NOTIFY_EMAIL: input.deps.accountsEmail ?? "" })
  if (input.rows.length === 0) {
    return { sent: 0, totalExGst: 0, paths: null }
  }
  const preview = previewAccountsPack(input.month, input.rows)
  const csv = buildBillingPackCsv(input.rows)
  const xlsx = await input.deps.buildWorkbook(input.rows)
  const now = input.deps.now?.() ?? new Date()
  const timestamp = accountsPackTimestamp(now)
  const paths = await input.deps.store({
    fy: input.fy,
    month: input.month,
    timestamp,
    csv,
    xlsx,
  })
  const cc = input.deps.financeEmail?.trim() || undefined
  const subject = accountsPackSubject(preview.monthLabel, preview.invoiceCount, preview.totalExGst)
  const text = accountsPackBody(preview.blockers)
  try {
    await input.deps.sendEmail({
      to,
      cc,
      subject,
      text,
      attachments: [
        { filename: `${timestamp}-csv.csv`, contentType: "text/csv", bytes: Buffer.from(csv, "utf8") },
        {
          filename: `${timestamp}-xlsx.xlsx`,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          bytes: xlsx,
        },
      ],
    })
  } catch (error) {
    throw new AccountsPackEmailError(error)
  }
  await input.deps.commit({
    rows: input.rows,
    blobPath: encodeExportBlobPath(paths),
    paths,
    exportedBy: input.exportedBy,
  })
  return { sent: input.rows.length, totalExGst: preview.totalExGst, paths }
}
