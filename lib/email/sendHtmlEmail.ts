import "server-only"

import sendgridMail from "@sendgrid/mail"

export type SendHtmlEmailParams = {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

function getFromEmail(): string {
  const from = process.env.EMAIL_FROM
  if (!from) {
    throw new Error("Missing env: EMAIL_FROM")
  }
  return from
}

/**
 * Send an HTML email via SendGrid (`SENDGRID_API_KEY` + `EMAIL_FROM`).
 * Same provider convention as `inviteSender.ts` — no dynamic template required.
 */
export async function sendHtmlEmail(params: SendHtmlEmailParams): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY not configured")
  }
  sendgridMail.setApiKey(process.env.SENDGRID_API_KEY)
  await sendgridMail.send({
    to: params.to,
    from: getFromEmail(),
    subject: params.subject,
    html: params.html,
    text: params.text ?? stripHtml(params.html),
  })
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Default internal ops recipient (v1). Override with OPS_EMAIL_TO. */
export function getOpsEmailRecipients(): string[] {
  const raw = process.env.OPS_EMAIL_TO?.trim()
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return ["luke.fitzpatrick@assembledmedia.com.au"]
}
