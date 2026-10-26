/**
 * BILLING_REVISIONS flag (design 5.2). Default off.
 *
 * - Server: BILLING_REVISIONS=on gates the routes and the Ava tools.
 * - Browser: NEXT_PUBLIC_BILLING_REVISIONS=on shows the panel and hides
 *   Alter billing. It is inlined at build time, so a change needs a deploy.
 * Turn both on together. With both off the finance row is unchanged.
 */

function isOn(raw: string | undefined): boolean {
  const v = String(raw ?? "off").trim().toLowerCase()
  return v === "on" || v === "1" || v === "true"
}

export function isBillingRevisionsEnabled(): boolean {
  return isOn(process.env.BILLING_REVISIONS)
}

export function isBillingRevisionsUiEnabled(): boolean {
  return isOn(process.env.NEXT_PUBLIC_BILLING_REVISIONS)
}

export const BILLING_REVISIONS_MARKER = "0106_billing_revisions"

export const BILLING_REVISIONS_NOT_READY_MESSAGE = "Billing revisions need migration 0106"
