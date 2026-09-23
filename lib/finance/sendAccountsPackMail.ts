/**
 * Outbound billing pack via the partner-ingest Microsoft Graph mailbox.
 * That app is the only Graph mail identity (Mail.ReadWrite on the ingest
 * mailbox). Do not use the M365_* provisioning app (C-116).
 */

import { MS_GRAPH_BASE_URL } from "@/lib/config/endpoints"
import { createFetchGraphTransport, type GraphTransport } from "@/lib/m365/graphTransport"
import {
  createPartnerGraphToken,
  partnerIngestGraphCredentialsFromEnv,
} from "@/lib/partner-ingest/graphToken"
import { DEFAULT_PARTNER_INGEST_MAILBOX } from "@/lib/partner-ingest/mailbox"

export type AccountsPackAttachment = {
  filename: string
  contentType: string
  bytes: Buffer
}

export async function sendAccountsPackEmail(
  input: {
    to: string
    cc?: string
    subject: string
    text: string
    attachments: AccountsPackAttachment[]
  },
  deps?: {
    transport?: GraphTransport
    getToken?: () => Promise<string>
    mailbox?: string
    env?: NodeJS.ProcessEnv
  }
): Promise<void> {
  const env = deps?.env ?? process.env
  const transport = deps?.transport ?? createFetchGraphTransport()
  const getToken =
    deps?.getToken ??
    createPartnerGraphToken({
      credentials: partnerIngestGraphCredentialsFromEnv(env),
      transport,
    })
  const mailbox = (deps?.mailbox ?? env.PARTNER_INGEST_MAILBOX ?? DEFAULT_PARTNER_INGEST_MAILBOX).trim()
  const token = await getToken()
  const url = `${MS_GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/sendMail`
  const res = await transport({
    method: "POST",
    url,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "Text", content: input.text },
        toRecipients: [{ emailAddress: { address: input.to } }],
        ...(input.cc
          ? { ccRecipients: [{ emailAddress: { address: input.cc } }] }
          : {}),
        attachments: input.attachments.map((file) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: file.filename,
          contentType: file.contentType,
          contentBytes: file.bytes.toString("base64"),
        })),
      },
      saveToSentItems: true,
    }),
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Graph sendMail failed (${res.status})`)
  }
}
