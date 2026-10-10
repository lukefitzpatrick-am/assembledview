import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { getOpsEmailRecipients, sendHtmlEmail } from "@/lib/email/sendHtmlEmail"
import { buildPacingDigest } from "@/lib/ops/digest/buildPacingDigest"
import { runCloseUntouchedRelabelTasks } from "@/lib/pacing/relabel/autoClose"
import {
  buildPacingDigestEmailHtml,
  buildPacingDigestSubject,
} from "@/lib/ops/digest/email"
import { logJob } from "@/lib/log"

export const dynamic = "force-dynamic"
export const maxDuration = 300
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
  const handlerStarted = Date.now()
  try {
    const digestStarted = Date.now()
    const payload = await buildPacingDigest(startedAt)
    logJob(
      JSON.stringify({
        event: "pacing_digest_stage",
        stage: "build",
        ms: Date.now() - digestStarted,
        campaigns: payload.counts.total,
      }),
    )
    const closeStarted = Date.now()
    const closedRelabelTasks = await runCloseUntouchedRelabelTasks(startedAt)
    logJob(
      JSON.stringify({
        event: "pacing_digest_stage",
        stage: "relabel_close",
        ms: Date.now() - closeStarted,
        closedRelabelTasks,
      }),
    )
    const subject = buildPacingDigestSubject(payload)
    const html = buildPacingDigestEmailHtml(payload)
    const to = getOpsEmailRecipients()

    const emailStarted = Date.now()
    await sendHtmlEmail({ to, subject, html })
    logJob(
      JSON.stringify({
        event: "pacing_digest_stage",
        stage: "email",
        ms: Date.now() - emailStarted,
        handlerMs: Date.now() - handlerStarted,
      }),
    )

    logJob(
      JSON.stringify({
        event: "pacing_digest",
        asOfDate: payload.asOfDate,
        counts: payload.counts,
        subject,
        cacheNote: payload.cacheNote,
        closedRelabelTasks,
        relabelEvents: payload.relabels?.events.length ?? 0,
      }),
    )

    return NextResponse.json({
      status: "ok",
      subject,
      recipients: to,
      counts: payload.counts,
      closedRelabelTasks,
      relabelEvents: payload.relabels?.events.length ?? 0,
      atRiskSample: payload.atRisk.slice(0, 10),
    })
  } catch (err) {
    console.error("[pacing-digest] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
