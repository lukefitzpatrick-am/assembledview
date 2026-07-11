import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { getOpsEmailRecipients, sendHtmlEmail } from "@/lib/email/sendHtmlEmail"
import { buildPacingDigest } from "@/lib/ops/digest/buildPacingDigest"
import {
  buildPacingDigestEmailHtml,
  buildPacingDigestSubject,
} from "@/lib/ops/digest/email"

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
    const payload = await buildPacingDigest(startedAt)
    const subject = buildPacingDigestSubject(payload)
    const html = buildPacingDigestEmailHtml(payload)
    const to = getOpsEmailRecipients()

    await sendHtmlEmail({ to, subject, html })

    console.log(
      JSON.stringify({
        event: "pacing_digest",
        asOfDate: payload.asOfDate,
        counts: payload.counts,
        subject,
        cacheNote: payload.cacheNote,
      }),
    )

    return NextResponse.json({
      status: "ok",
      subject,
      recipients: to,
      counts: payload.counts,
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
