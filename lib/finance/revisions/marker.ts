/**
 * Marker gate for billing_revisions (C-76). No read or write of the table
 * runs until migration_markers holds 0106_billing_revisions.
 */
import "server-only"

import { eq } from "drizzle-orm"

import { getDb } from "@/db"
import { migrationMarkers } from "@/db/schema"

import { BILLING_REVISIONS_MARKER, BILLING_REVISIONS_NOT_READY_MESSAGE } from "./flag"

export class BillingRevisionsNotReadyError extends Error {
  readonly code = "BILLING_REVISIONS_NOT_READY"
  constructor() {
    super(BILLING_REVISIONS_NOT_READY_MESSAGE)
    this.name = "BillingRevisionsNotReadyError"
  }
}

export type MarkerReader = (key: string) => Promise<boolean>

export const readMigrationMarker: MarkerReader = async (key) => {
  const rows = await getDb()
    .select({ key: migrationMarkers.key })
    .from(migrationMarkers)
    .where(eq(migrationMarkers.key, key))
    .limit(1)
  return rows.length > 0
}

export async function isBillingRevisionsMigrationApplied(
  reader: MarkerReader = readMigrationMarker,
): Promise<boolean> {
  try {
    return await reader(BILLING_REVISIONS_MARKER)
  } catch (err) {
    console.warn("[billing-revisions] marker read failed", err)
    return false
  }
}

export async function assertBillingRevisionsReady(reader: MarkerReader = readMigrationMarker): Promise<void> {
  if (!(await isBillingRevisionsMigrationApplied(reader))) throw new BillingRevisionsNotReadyError()
}
