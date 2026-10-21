import "server-only"

import { createFetchGraphTransport } from "@/lib/m365/graphTransport"

import {
  createPartnerGraphToken,
  partnerIngestGraphCredentialsFromEnv,
} from "./graphToken"
import {
  createPartnerMailbox,
  partnerIngestMailboxFromEnv,
} from "./mailbox"
import { runPartnerIngest } from "./runPartnerIngest"
import { createPartnerSnowflakePort } from "./snowflakeStore"

/**
 * No new message starts after this much of the run. The route allows 300 s;
 * this leaves room for the file in progress and the staleness sweep. Messages
 * not started stay in the inbox for the next run.
 */
export const PARTNER_INGEST_BUDGET_MS = 150_000

export async function runPartnerIngestJob() {
  const deadlineAt = Date.now() + PARTNER_INGEST_BUDGET_MS
  const transport = createFetchGraphTransport()
  const getToken = createPartnerGraphToken({
    credentials: partnerIngestGraphCredentialsFromEnv(),
    transport,
  })
  const mailbox = createPartnerMailbox({
    mailbox: partnerIngestMailboxFromEnv(),
    transport,
    getToken,
  })
  const snowflake = createPartnerSnowflakePort()
  return runPartnerIngest({ mailbox, snowflake, deadlineAt })
}
