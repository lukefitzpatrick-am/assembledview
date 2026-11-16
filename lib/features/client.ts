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
/** Callbacks waiting for the first snapshot (`afterClientFeatureSnapshot`). */
let waiting: Array<() => void> = []

export function setClientFeatureSnapshot(next: Partial<Record<ClientFeatureKey, boolean>> | null): void {
  snapshot = next
  if (!next || waiting.length === 0) return
  const run = waiting
  waiting = []
  for (const fn of run) {
    try {
      fn()
    } catch (err) {
      console.warn("[features] a snapshot callback failed", err)
    }
  }
}

/**
 * B43fix (R3): run `fn` once when the root layout's snapshot first arrives.
 * For module-level defaults (a store's initial state) computed before
 * ClientRoot set the snapshot on a full page load. Nothing is queued when
 * the snapshot is already here: the caller's read saw it.
 */
export function afterClientFeatureSnapshot(fn: () => void): void {
  if (snapshot) return
  waiting.push(fn)
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
