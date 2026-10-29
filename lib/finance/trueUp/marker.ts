/**
 * Marker gate for the 0109 true-up tables (C-76). No read or write of
 * true_up_runs, true_up_actions, true_up_invoice_links or
 * client_finance_owners.billing_timing runs until migration_markers holds
 * 0109_true_up. The Stage 1 report never needs it.
 */
import "server-only"

import { readMigrationMarker, type MarkerReader } from "@/lib/finance/revisions/marker"

import { TRUE_UP_MARKER } from "./flag"

export async function isTrueUpMigrationApplied(reader: MarkerReader = readMigrationMarker): Promise<boolean> {
  try {
    return await reader(TRUE_UP_MARKER)
  } catch (err) {
    console.warn("[true-up] marker read failed", err)
    return false
  }
}
