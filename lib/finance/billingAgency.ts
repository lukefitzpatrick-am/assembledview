/**
 * Shared Advertising Associates vs Assembled Media billing-agency literals + classifier.
 * Used by finance report and forecast so there is one definition of the AA/AM strings.
 */

/** `publishers.billingagency` when the publisher bills via Advertising Associates. */
export const BILLING_AGENCY_AA = "advertising associates"

/** `publishers.billingagency` when the publisher bills via Assembled Media (default agency). */
export const BILLING_AGENCY_AM = "assembled media"

/**
 * Classify a raw `publishers.billingagency` value into AA or AM.
 * Unmatched / empty / unknown values default to AM (same product default as forecast mapping).
 */
export function classifyBillingAgency(raw?: string | null): "AA" | "AM" {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (normalized === BILLING_AGENCY_AA) return "AA"
  return "AM"
}
