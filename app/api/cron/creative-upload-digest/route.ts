import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { getOpsEmailRecipients, sendHtmlEmail } from "@/lib/email/sendHtmlEmail"
import { buildUploadDigest } from "@/lib/creative/uploadDigest"
import {
  buildUploadDigestEmailHtml,
  buildUploadDigestSubject,
} from "@/lib/creative/uploadDigestEmail"

export const dynamic = "force-dynamic"
export const maxDuration = 60
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  try {
    const payload = await buildUploadDigest(new Date())
    if (payload.totalFiles === 0) {
      return NextResponse.json({
        status: "ok",
        sent: false,
        reason: "no_client_uploads",
      })
    }

    const subject = buildUploadDigestSubject(payload)
    const html = buildUploadDigestEmailHtml(payload)
    const to = getOpsEmailRecipients()
    await sendHtmlEmail({ to, subject, html })

    console.log(
      JSON.stringify({
        event: "creative_upload_digest",
        totalFiles: payload.totalFiles,
        groups: payload.groups.length,
        subject,
      }),
    )

    return NextResponse.json({
      status: "ok",
      sent: true,
      subject,
      recipients: to,
      totalFiles: payload.totalFiles,
    })
  } catch (err) {
    console.error("[creative-upload-digest] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
