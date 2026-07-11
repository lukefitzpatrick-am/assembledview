import "server-only"
import { unstable_cache } from "next/cache"
import { fetchSearchPacingCampaignRows } from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows"
import { fetchProgrammaticPacingCampaignRows } from "@/lib/pacing/programmatic/fetchProgrammaticPacingCampaignRows"
import { fetchSocialPacingCampaignRows } from "@/lib/pacing/social/fetchSocialPacingCampaignRows"

export const PACING_CAMPAIGNS_TAG = "pacing-campaigns"
const REVALIDATE_SECONDS = 14_400 // 4h

/** Stable scope key: "all" for unscoped (admin), else sorted slugs joined. */
export function pacingScopeKey(allowedClientSlugs: Set<string> | null): string {
  if (allowedClientSlugs === null) return "all"
  return Array.from(allowedClientSlugs).sort().join(",") || "none"
}

export async function getCachedSearchPacingRows(
  asOfDate: string,
  allowedClientSlugs: Set<string> | null
) {
  const scopeKey = pacingScopeKey(allowedClientSlugs)
  const cached = unstable_cache(
    async () => fetchSearchPacingCampaignRows({ asOfDate, allowedClientSlugs }),
    ["pacing-rows", "search", asOfDate, scopeKey],
    { revalidate: REVALIDATE_SECONDS, tags: [PACING_CAMPAIGNS_TAG] }
  )
  return cached()
}

export async function getCachedSocialPacingRows(
  asOfDate: string,
  allowedClientSlugs: Set<string> | null
) {
  const scopeKey = pacingScopeKey(allowedClientSlugs)
  const cached = unstable_cache(
    async () => fetchSocialPacingCampaignRows({ asOfDate, allowedClientSlugs }),
    ["pacing-rows", "social", asOfDate, scopeKey],
    { revalidate: REVALIDATE_SECONDS, tags: [PACING_CAMPAIGNS_TAG] }
  )
  return cached()
}

export async function getCachedProgrammaticPacingRows(
  asOfDate: string,
  allowedClientSlugs: Set<string> | null
) {
  const scopeKey = pacingScopeKey(allowedClientSlugs)
  const cached = unstable_cache(
    async () => fetchProgrammaticPacingCampaignRows({ asOfDate, allowedClientSlugs }),
    ["pacing-rows", "programmatic", asOfDate, scopeKey],
    { revalidate: REVALIDATE_SECONDS, tags: [PACING_CAMPAIGNS_TAG] }
  )
  return cached()
}
