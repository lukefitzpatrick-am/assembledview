import "server-only"

import { getClient } from "@/db"
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
import { createPostgresAdvisoryRunLock, type AdvisoryLockSql } from "./runLock"
import { createPartnerSnowflakePort } from "./snowflakeStore"

/**
 * No new file load starts after this much of the run. The route allows 300 s;
 * this leaves room for the file in progress, the superseded moves and the
 * staleness sweep. A Vistar file takes about 90 s and a Channel Factory file
 * about 12 s, so the newest of each fits. Messages not started stay in the
 * inbox for the next run.
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
  // DATA-7: one run at a time. postgres.js `begin` matches AdvisoryLockSql at
  // runtime; its generic return type does not line up, hence the cast.
  const runLock = createPostgresAdvisoryRunLock(getClient() as unknown as AdvisoryLockSql)
  return runPartnerIngest({ mailbox, snowflake, deadlineAt, runLock })
}
