import { NextRequest, NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { hasResolvableAuditUserId } from "@/lib/auth/teamMemberAuditId"
import { lastClearanceHash, loadClearanceMonths, recordClearanceSend } from "@/lib/finance/loadClearance"
import { runClearanceReports } from "@/lib/finance/runClearanceReports"
import { sendAccountsPackEmail } from "@/lib/finance/sendAccountsPackMail"
import { AccountsNotifyUnsetError, AccountsPackEmailError } from "@/lib/finance/sendToAccounts"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function parseMonth(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null
  const month = Number(value.slice(5, 7))
  if (month < 1 || month > 12) return null
  return value
}

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  const currentUser = await getCurrentUser(request)
  if (!currentUser || !hasResolvableAuditUserId(currentUser.id)) {
    return NextResponse.json(
      { error: "no_user", message: "Could not resolve user for audit." },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 })
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null
  const month = parseMonth(record?.month)
  if (!month) {
    return NextResponse.json(
      { error: "bad_request", message: "month (YYYY-MM) is required." },
      { status: 400 },
    )
  }

  try {
    const editedByName = currentUser.name ?? currentUser.email ?? String(currentUser.id)
    const result = await runClearanceReports({
      force: true,
      months: [month],
      deps: {
        accountsEmail: process.env.ACCOUNTS_NOTIFY_EMAIL,
        financeEmail: process.env.FINANCE_NOTIFY_EMAIL,
        loadMonths: loadClearanceMonths,
        lastHash: lastClearanceHash,
        sendEmail: sendAccountsPackEmail,
        recordSend: recordClearanceSend,
        audit: async (report) => {
          await writeStatusChangeEdit(
            {
              finance_billing_records_id: null,
              field_name: "clearance_send",
              old_value: null,
              new_value: `${report.month} ${report.hash}`,
            },
            {
              editedBy: currentUser.id,
              editedByName,
              recordType: "status_change",
            },
          )
        },
      },
    })
    const outcome = result.months[0]
    if (!outcome || outcome.reason === "empty") {
      return NextResponse.json(
        { error: "empty", message: "No sent-to-accounts rows in that month." },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true, sent: true, month, hash: outcome.hash ?? null })
  } catch (error) {
    if (error instanceof AccountsNotifyUnsetError) {
      return NextResponse.json(
        { error: "accounts_notify_unset", message: error.message },
        { status: 409 },
      )
    }
    if (error instanceof AccountsPackEmailError) {
      return NextResponse.json(
        { error: "email_failed", message: "The clearance email was not sent. Nothing was recorded." },
        { status: 502 },
      )
    }
    const message = error instanceof Error ? error.message : "Clearance send failed."
    return NextResponse.json({ error: "clearance_failed", message }, { status: 500 })
  }
}
