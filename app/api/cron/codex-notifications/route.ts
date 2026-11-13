import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { sendHtmlEmail } from "@/lib/email/sendHtmlEmail"
import { isCodexNotificationsEnabled } from "@/lib/codex/flag"
import { isDailyJobHour, melbourneTodayYmd } from "@/lib/codex/notifications"
import { buildCodexDigestHtml } from "@/lib/codex/notificationsEmail"
import { runDailyNotifications } from "@/lib/codex/notificationsRepo"
import { isProjectsMigrationApplied } from "@/lib/codex/projectsMarker"
import { logJob } from "@/lib/log"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Codex daily notifications (B41). vercel.json runs it at 21:30 and 22:30
 * UTC; only the run in the Melbourne 08:00 hour (08:30 in AEDT and AEST)
 * acts. First the due tomorrow and overdue reminders, then one email digest
 * per person that already carries them (quiet hours and the per-person switch
 * respected; `runDailyNotifications`).
 * Auth: CRON_SECRET. Off (codex_notifications) or before 0118: skipped, 200.
 * `?now=` (ISO) sets the clock for a local run.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised", hint: "cron_secret_required" }, { status: 401 })
  }
  let now = new Date()
  const q = new URL(request.url).searchParams.get("now")
  if (q) {
    const parsed = new Date(q)
    if (!Number.isNaN(parsed.getTime())) now = parsed
  }
  try {
    if (!(await isCodexNotificationsEnabled())) return NextResponse.json({ status: "skipped", reason: "switch_off" })
    if (!isDailyJobHour(now)) return NextResponse.json({ status: "skipped", reason: "not_melbourne_0800_hour" })
    if (!(await isProjectsMigrationApplied())) return NextResponse.json({ status: "skipped", reason: "migration_not_applied" })
    const appBaseUrl = process.env.APP_BASE_URL ?? ""
    const asOf = melbourneTodayYmd(now)
    // Reminders then the digest, in one store call, so today's reminders are in today's email.
    const { reminders, digest } = await runDailyNotifications(
      now,
      ({ to, subject, html }) => sendHtmlEmail({ to, subject, html }),
      (d) => buildCodexDigestHtml(d, { appBaseUrl, asOf })
    )
    const body = { status: "ok", reminders, digest }
    logJob(JSON.stringify({ event: "codex_notifications", ...body }))
    return NextResponse.json(body)
  } catch (err) {
    console.error("[codex-notifications] fatal", err)
    return NextResponse.json({ status: "error", message: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}
