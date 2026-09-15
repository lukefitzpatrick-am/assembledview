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

export async function runPartnerIngestJob() {
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
  return runPartnerIngest({ mailbox, snowflake })
}
