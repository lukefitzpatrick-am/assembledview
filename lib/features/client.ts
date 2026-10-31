/**
 * Browser reads of feature switches. The root layout sends the snapshot
 * (ServerAuthScope -> ClientRoot -> setClientFeatureSnapshot) before any
 * child renders, so plain function calls in client code see the live value.
 *
 * Before the snapshot arrives (tests, or code outside the app shell) the
 * build-time NEXT_PUBLIC_ value is the fallback, read with literal names so
 * Next can inline them. New switches don't need one.
 */
import type { ClientFeatureKey } from "./registry"
import { featureDefinition, parseFeatureEnv } from "./registry"

let snapshot: Partial<Record<ClientFeatureKey, boolean>> | null = null

export function setClientFeatureSnapshot(next: Partial<Record<ClientFeatureKey, boolean>> | null): void {
  snapshot = next
}

function buildTimeFallback(key: ClientFeatureKey): boolean {
  switch (key) {
    case "true_up":
      return parseFeatureEnv(process.env.NEXT_PUBLIC_TRUE_UP, "on_1_true")
    case "billing_revisions":
      return parseFeatureEnv(process.env.NEXT_PUBLIC_BILLING_REVISIONS, "on_1_true")
    case "billing_balancer":
      return parseFeatureEnv(process.env.NEXT_PUBLIC_BILLING_BALANCER, "on_1_true")
    case "plan_drafts":
      return parseFeatureEnv(process.env.NEXT_PUBLIC_PLAN_DRAFTS, "on_1_true")
    case "platform_accounts_web":
      return parseFeatureEnv(process.env.NEXT_PUBLIC_PLATFORM_ACCOUNTS_WEB, "exact_1")
    default:
      // Switches added after 30 Oct have no build-time env: their default.
      return featureDefinition(key)?.defaultOn ?? false
  }
}

export function clientFeatureOn(key: ClientFeatureKey): boolean {
  const v = snapshot?.[key]
  return typeof v === "boolean" ? v : buildTimeFallback(key)
}
