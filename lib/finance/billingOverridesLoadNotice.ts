/**
 * MB-18 — billing_overrides load notice policy.
 *
 * Unresolved version id is a load race, not a failure. Only a real fetch throw
 * may set the user-visible banner; every good / quiet path must clear it so the
 * notice cannot latch from a transient condition.
 */

export const BILLING_OVERRIDES_LOAD_FAILED_NOTICE =
  "Manual billing overrides could not be loaded — manual timing may display as auto"

export type BillingOverridesLoadEvent =
  | { kind: "version_unresolved" }
  | { kind: "fetch_ok" }
  | { kind: "fetch_failed" }

/**
 * Next notice value after a load / refresh outcome.
 * - `version_unresolved` / `fetch_ok` → clear (null)
 * - `fetch_failed` → set the shared banner string
 */
export function nextBillingOverridesLoadNotice(
  event: BillingOverridesLoadEvent
): string | null {
  if (event.kind === "fetch_failed") return BILLING_OVERRIDES_LOAD_FAILED_NOTICE
  return null
}
