import { NextRequest, NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { hasResolvableAuditUserId } from "@/lib/auth/teamMemberAuditId"
import { getDb } from "@/db"
import { buildReceivablesWorkbookBuffer } from "@/lib/finance/exportFinanceHub"
import { loadAccountsPack } from "@/lib/finance/loadAccountsPack"
import { sendAccountsPackEmail } from "@/lib/finance/sendAccountsPackMail"
import { storeAccountsPackBlobs } from "@/lib/finance/storeAccountsPack"
import {
  AccountsNotifyUnsetError,
  AccountsPackEmailError,
  previewAccountsPack,
  runSendToAccounts,
} from "@/lib/finance/sendToAccounts"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import { stampFinanceBillingRecordSentToAccounts } from "@/lib/data/writeFinance"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function parseMonth(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  const month = Number(value.slice(5, 7))
  if (month < 1 || month > 12) return null
  return value
}

function parseFy(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isInteger(n) || n < 2000 || n > 2100) return null
  return n
}

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  if (request.nextUrl.searchParams.get("preview") !== "1") {
    return NextResponse.json(
      { error: "bad_request", message: "preview=1 is required." },
      { status: 400 }
    )
  }
  try {
    const { ACCOUNTS_NOTIFY_EMAIL: accountsEmail } = process.env
    if (!accountsEmail?.trim()) {
      return NextResponse.json(
        { error: "accounts_notify_unset", message: new AccountsNotifyUnsetError().message },
        { status: 409 }
      )
    }
    const month = parseMonth(request.nextUrl.searchParams.get("month"))
    const fy = parseFy(request.nextUrl.searchParams.get("fy"))
    if (!month || fy == null) {
      return NextResponse.json(
        { error: "bad_request", message: "fy and month (YYYY-MM) are required." },
        { status: 400 }
      )
    }
    const loaded = await loadAccountsPack(month)
    if ("ok" in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    }
    return NextResponse.json({ fy, ...previewAccountsPack(month, loaded.rows) })
  } catch (error) {
    console.error("GET /api/finance/send-to-accounts:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  const currentUser = await getCurrentUser(request)
  if (!currentUser || !hasResolvableAuditUserId(currentUser.id)) {
    return NextResponse.json(
      { error: "no_user", message: "Could not resolve user for audit." },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 })
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null
  const month = parseMonth(typeof record?.month === "string" ? record.month : null)
  const fy = parseFy(record?.fy)
  if (!month || fy == null) {
    return NextResponse.json(
      { error: "bad_request", message: "fy and month (YYYY-MM) are required." },
      { status: 400 }
    )
  }

  try {
    if (!process.env.ACCOUNTS_NOTIFY_EMAIL?.trim()) {
      throw new AccountsNotifyUnsetError()
    }
    const loaded = await loadAccountsPack(month)
    if ("ok" in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    }
    const editedByName = currentUser.name ?? currentUser.email ?? String(currentUser.id)
    const result = await runSendToAccounts({
      fy,
      month,
      rows: loaded.rows,
      exportedBy: currentUser.id,
      deps: {
        accountsEmail: process.env.ACCOUNTS_NOTIFY_EMAIL,
        financeEmail: process.env.FINANCE_NOTIFY_EMAIL,
        buildWorkbook: async () =>
          buildReceivablesWorkbookBuffer(loaded.records, loaded.metaByClientId),
        store: storeAccountsPackBlobs,
        sendEmail: sendAccountsPackEmail,
        commit: async (commit) => {
          const db = getDb()
          await db.transaction(async (tx) => {
            for (const row of commit.rows) {
              const stamped = await stampFinanceBillingRecordSentToAccounts(
                {
                  invoiceKey: row.invoiceKey,
                  exportedBy: commit.exportedBy,
                  exportBlobPath: commit.blobPath,
                },
                tx
              )
              if (!stamped) continue
              await writeStatusChangeEdit(
                {
                  finance_billing_records_id: stamped.id,
                  field_name: "exported_at",
                  old_value: null,
                  new_value: stamped.exportedAt,
                },
                {
                  editedBy: commit.exportedBy,
                  editedByName,
                  recordType: "status_change",
                },
                tx
              )
            }
          })
        },
      },
    })
    return NextResponse.json({
      ok: true,
      sent: result.sent,
      totalExGst: result.totalExGst,
      paths: result.paths,
    })
  } catch (error) {
    if (error instanceof AccountsNotifyUnsetError) {
      return NextResponse.json(
        { error: "accounts_notify_unset", message: error.message },
        { status: 409 }
      )
    }
    if (error instanceof AccountsPackEmailError) {
      return NextResponse.json(
        { error: "email_failed", message: "The billing pack was not sent. Nothing was stamped." },
        { status: 502 }
      )
    }
    console.error("POST /api/finance/send-to-accounts:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
