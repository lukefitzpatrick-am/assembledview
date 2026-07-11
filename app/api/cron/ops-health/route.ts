import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { getOpsEmailRecipients, sendHtmlEmail } from "@/lib/email/sendHtmlEmail"
import { runOpsHealthChecks } from "@/lib/ops/health/checks"
import {
  buildOpsHealthEmailHtml,
  buildOpsHealthReport,
  buildOpsHealthSubject,
} from "@/lib/ops/health/email"

export const dynamic = "force-dynamic"
export const maxDuration = 120
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  const startedAt = new Date()
  try {
    const raw = await runOpsHealthChecks(startedAt)
    const report = buildOpsHealthReport(raw.asOfDate, raw.checkedAt, raw.results)
    const subject = buildOpsHealthSubject(report.results)
    const html = buildOpsHealthEmailHtml(report)
    const to = getOpsEmailRecipients()

    await sendHtmlEmail({ to, subject, html })

    const logLine = {
      event: "ops_health",
      asOfDate: report.asOfDate,
      red: report.redCount,
      amber: report.amberCount,
      green: report.greenCount,
      subject,
      results: report.results.map((r) => ({
        name: r.name,
        status: r.status,
        detail: r.detail.slice(0, 200),
      })),
    }
    console.log(JSON.stringify(logLine))

    return NextResponse.json({
      status: "ok",
      subject,
      recipients: to,
      report,
    })
  } catch (err) {
    console.error("[ops-health] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
