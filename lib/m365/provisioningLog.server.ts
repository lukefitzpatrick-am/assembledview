import "server-only"

import { getDb, schema } from "@/db"
import type {
  M365ProvisioningLogRow,
  ProvisioningLogWriter,
} from "@/lib/m365/provisioningLog"

/** Postgres writer for `m365_provisioning_log` (migration 0021). */
export function createDbProvisioningLogWriter(): ProvisioningLogWriter {
  return async (row: M365ProvisioningLogRow) => {
    if (!process.env.DATABASE_URL?.trim()) return
    const db = getDb()
    await db.insert(schema.m365ProvisioningLog).values({
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      requestId: row.requestId,
      actor: row.actor,
      outcome: row.outcome,
      error: row.error,
    })
  }
}
