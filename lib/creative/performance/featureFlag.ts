/**
 * Creative performance is on for every client dashboard when the
 * creative_performance switch is on (Admin > Features; with no switch row,
 * FEATURE_CREATIVE_PERFORMANCE on/1/true). Off is 404 for every role,
 * including admin. FEATURE_CREATIVE_PERFORMANCE_CLIENTS is no longer read (it
 * was a per-client allowlist until 2026-10-20).
 */
import "server-only"

import { isFeatureOn } from "@/lib/features/server"

export async function isCreativePerformanceEnabled(
  _slug: string,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  return isFeatureOn("creative_performance", env)
}
