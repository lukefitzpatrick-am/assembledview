/**
 * Billing revisions switch (design 5.2; lib/features/registry.ts). Default off.
 * Set on /admin/features; before 0111 or with no row it reads BILLING_REVISIONS.
 *
 * One switch for the server (routes, Ava tools) and the browser (the panel,
 * and Alter billing hidden). The browser reads it from the root layout
 * snapshot (clientFeatureOn("billing_revisions")), so no redeploy is needed.
 */
import "server-only"

import { isFeatureOn } from "@/lib/features/server"

export async function isBillingRevisionsEnabled(
  read: (key: "billing_revisions") => Promise<boolean> = (key) => isFeatureOn(key),
): Promise<boolean> {
  return read("billing_revisions")
}

export const BILLING_REVISIONS_MARKER = "0106_billing_revisions"

export const BILLING_REVISIONS_NOT_READY_MESSAGE = "Billing revisions need migration 0106"
