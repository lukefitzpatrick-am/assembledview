import "server-only"

import sendgridMail from "@sendgrid/mail"

export type SendHtmlEmailAttachment = {
  filename: string
  contentType: string
  contentBase64: string
}

export type SendHtmlEmailParams = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  attachments?: SendHtmlEmailAttachment[]
}

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024

function totalAttachmentBytes(attachments: readonly SendHtmlEmailAttachment[]): number {
  let total = 0
  for (const attachment of attachments) {
    total += Buffer.from(attachment.contentBase64, "base64").length
  }
  return total
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
  const from = getFromEmail()
  const attachments = params.attachments ?? []
  if (attachments.length > 0) {
    const bytes = totalAttachmentBytes(attachments)
    if (bytes > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Email attachments total ${bytes} bytes, over the 3 MB limit.`)
    }
  }
  const replyTo = params.replyTo?.trim()
  sendgridMail.setApiKey(process.env.SENDGRID_API_KEY)
  await sendgridMail.send({
    to: params.to,
    from,
    subject: params.subject,
    html: params.html,
    text: params.text ?? stripHtml(params.html),
    ...(replyTo ? { replyTo } : {}),
    ...(attachments.length > 0
      ? {
          attachments: attachments.map((attachment) => ({
            content: attachment.contentBase64,
            filename: attachment.filename,
            type: attachment.contentType,
            disposition: "attachment" as const,
          })),
        }
      : {}),
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
