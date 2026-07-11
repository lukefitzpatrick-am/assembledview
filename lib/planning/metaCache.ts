import "server-only"

import { unstable_cache } from "next/cache"
import { getPlanningMeta } from "./queries"
import type { PlanningMeta } from "./types"

export const PLANNING_META_TAG = "planning-meta"
const REVALIDATE_SECONDS = 86_400 // 24h

/**
 * Cached planning meta. Auth must stay outside this cache (same pattern as pacingRowsCache).
 */
export async function getCachedPlanningMeta(): Promise<PlanningMeta> {
  const cached = unstable_cache(
    async () => getPlanningMeta(),
    ["planning-meta"],
    { revalidate: REVALIDATE_SECONDS, tags: [PLANNING_META_TAG] }
  )
  return cached()
}
