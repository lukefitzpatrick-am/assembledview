/**
 * Advertising Associates pack reminders.
 *
 * Melbourne civil dates 10, 15 and 17 only. The cycle month is that calendar
 * month: on the 17th the page's default month has already rolled forward, and
 * this mail is still about the month whose deadline is today.
 *
 * Idempotency is one `report_digest_sends` row, kind
 * `billing_partner_reminder`, period_start = the Melbourne date. `report_runs`
 * is not suitable: `mba_number` is required, status is a deck-job check, and
 * the unique key is one row per MBA and period. The digest log is already
 * applied (0095) and its primary key is one send per kind and date.
 */
import "server-only"

import { and, eq } from "drizzle-orm"

import { getDb } from "@/db"
import { reportDigestSends } from "@/db/schema"
import { listAuth0RoleUserEmails } from "@/lib/api/auth0Management"
import { listDueAaPlans } from "@/lib/finance/billingPartner/duePlans"
import { listPacksForMonth } from "@/lib/finance/billingPartner/packStore"
import { sydneyCalendar, sydneyYmd } from "@/lib/finance/billingPartner/cycle"
import { sendAccountsPackEmail } from "@/lib/finance/sendAccountsPackMail"

export const BILLING_PARTNER_REMINDER_KIND = "billing_partner_reminder"

export type ReminderPlan = {
  clientName: string
  campaignName: string
  mbaNumber: string
  changeKind: "new" | "amended"
  backDated: boolean
}

export type ReminderEmail = {
  to: string[]
  subject: string
  text: string
}

export type ReminderRunResult =
  | {
      skipped: "not a reminder day" | "already sent" | "nothing outstanding" | "no admin recipients"
    }
  | { status: "sent"; logged: boolean; planCount: number; recipients: string[] }

type ReminderIo = {
  now?: Date
  listDue?: (billingMonth: string) => Promise<ReminderPlan[]>
  listPacks?: (billingMonth: string) => Promise<{ status: "draft" | "sent" }[]>
  loadRecipients?: () => Promise<string[]>
  alreadySent?: (reminderDate: string) => Promise<boolean>
  recordSend?: (row: { reminderDate: string; recipients: string[]; planCount: number }) => Promise<void>
  send?: (message: ReminderEmail) => Promise<void>
  pageUrl?: string
}

export function reminderDay(now: Date): 10 | 15 | 17 | null {
  const { day } = sydneyCalendar(now)
  if (day === 10 || day === 15 || day === 17) return day
  return null
}

/** First of the Melbourne month that contains `now`. */
export function reminderBillingMonth(now: Date): string {
  const { year, month } = sydneyCalendar(now)
  return `${year}-${String(month).padStart(2, "0")}-01`
}

export function adminRecipientEmails(users: { email?: string | null }[]): string[] {
  const seen = new Set<string>()
  const emails: string[] = []
  for (const user of users) {
    const email = user.email?.trim().toLowerCase() ?? ""
    if (!email || seen.has(email)) continue
    seen.add(email)
    emails.push(email)
  }
  return emails
}

export function buildReminderEmail(input: {
  day: 10 | 15 | 17
  plans: ReminderPlan[]
  packs: { status: "draft" | "sent" }[]
  pageUrl: string
}): { subject: string; text: string } | null {
  const count = input.plans.length
  if ((input.day === 10 || input.day === 15) && count === 0) return null

  const subject =
    input.day === 17
      ? count === 0
        ? "AA pack: nothing outstanding"
        : `AA pack due today: ${count} plans`
      : `AA plans due by the 17th: ${count} outstanding`

  const lines = input.plans.map((plan) => {
    const kind = plan.changeKind === "new" ? "New" : "Amended"
    const backDated = plan.backDated ? " — back-dated" : ""
    const client = plan.clientName || "—"
    const campaign = plan.campaignName || "—"
    return `${client} — ${campaign} — ${plan.mbaNumber} — ${kind}${backDated}`
  })

  const parts = [subject, ""]
  if (lines.length > 0) parts.push(lines.join("\n"), "")
  if (input.day === 17) parts.push(packStatusLine(input.packs), "")
  parts.push(input.pageUrl)
  return { subject, text: parts.join("\n") }
}

function packStatusLine(packs: { status: "draft" | "sent" }[]): string {
  if (packs.some((pack) => pack.status === "sent")) return "A pack has been sent for this month."
  if (packs.some((pack) => pack.status === "draft")) {
    return "A pack has been built and is still a draft."
  }
  return "No pack has been built for this month."
}

export async function runBillingPartnerReminders(io: ReminderIo = {}): Promise<ReminderRunResult> {
  const now = io.now ?? new Date()
  const day = reminderDay(now)
  if (day == null) return { skipped: "not a reminder day" }

  const reminderDate = sydneyYmd(now)
  const alreadySent = io.alreadySent ?? productionAlreadySent
  if (await alreadySent(reminderDate)) return { skipped: "already sent" }

  const billingMonth = reminderBillingMonth(now)
  const listDue = io.listDue ?? ((month: string) => listDueAaPlans(month))
  const plans = await listDue(billingMonth)
  const listPacks = io.listPacks ?? listPacksForMonth
  const packs = day === 17 ? await listPacks(billingMonth) : []
  const email = buildReminderEmail({
    day,
    plans,
    packs,
    pageUrl: io.pageUrl ?? reminderPageUrl(),
  })
  if (!email) return { skipped: "nothing outstanding" }

  const loadRecipients = io.loadRecipients ?? (() => listAuth0RoleUserEmails("admin"))
  const recipients = adminRecipientEmails((await loadRecipients()).map((email) => ({ email })))
  if (recipients.length === 0) return { skipped: "no admin recipients" }

  const send = io.send ?? productionSend
  await send({ to: recipients, subject: email.subject, text: email.text })

  const recordSend = io.recordSend ?? productionRecordSend
  try {
    await recordSend({ reminderDate, recipients, planCount: plans.length })
  } catch (err) {
    console.error(
      "[billing-partner-reminders] email sent but the reminder log insert failed",
      err,
    )
    return { status: "sent", logged: false, planCount: plans.length, recipients }
  }
  return { status: "sent", logged: true, planCount: plans.length, recipients }
}

function reminderPageUrl(): string {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, "") ?? ""
  return base ? `${base}/finance/billing-partner` : "/finance/billing-partner"
}

async function productionAlreadySent(reminderDate: string): Promise<boolean> {
  const rows = await getDb()
    .select({ kind: reportDigestSends.kind })
    .from(reportDigestSends)
    .where(
      and(
        eq(reportDigestSends.kind, BILLING_PARTNER_REMINDER_KIND),
        eq(reportDigestSends.periodStart, reminderDate),
      ),
    )
    .limit(1)
  return rows.length > 0
}

async function productionRecordSend(row: {
  reminderDate: string
  recipients: string[]
  planCount: number
}): Promise<void> {
  await getDb()
    .insert(reportDigestSends)
    .values({
      kind: BILLING_PARTNER_REMINDER_KIND,
      periodStart: row.reminderDate,
      recipients: row.recipients,
      runCount: row.planCount,
    })
    .onConflictDoNothing()
}

async function productionSend(message: ReminderEmail): Promise<void> {
  await sendAccountsPackEmail({
    to: message.to,
    subject: message.subject,
    text: message.text,
    attachments: [],
  })
}
