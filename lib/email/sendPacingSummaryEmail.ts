import "server-only"

import sgMail from "@sendgrid/mail"
import type { PacingSummaryPayload } from "@/lib/email/pacing-summary-payload"

export async function sendPacingSummaryEmail(to: string, dynamicTemplateData: PacingSummaryPayload): Promise<void> {
  const key = process.env.SENDGRID_API_KEY?.trim()
  const templateId = process.env.SENDGRID_PACING_TEMPLATE_ID?.trim()
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim()
  const fromName = process.env.SENDGRID_FROM_NAME?.trim() || "AssembledView Pacing"
  if (!key || !templateId || !fromEmail) {
    throw new Error("missing_sendgrid_env")
  }
  sgMail.setApiKey(key)
  const msg: sgMail.MailDataRequired = {
    to,
    from: { email: fromEmail, name: fromName },
    templateId,
    dynamicTemplateData: dynamicTemplateData as Record<string, unknown>,
  }
  await sgMail.send(msg)
}
