import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types"
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types"
import type { ProgrammaticPacingCampaignRow } from "@/lib/pacing/programmatic/types"
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types"
import type { DirectCampaignGroup } from "@/lib/pacing/direct/types"

export type PortfolioChannelLoaders = {
  search: (
    asOfDate: string,
    allowedClientSlugs: Set<string> | null
  ) => Promise<SearchPacingCampaignRow[]>
  social: (
    asOfDate: string,
    allowedClientSlugs: Set<string> | null
  ) => Promise<SocialPacingCampaignRow[]>
  programmatic: (
    asOfDate: string,
    allowedClientSlugs: Set<string> | null
  ) => Promise<ProgrammaticPacingCampaignRow[]>
  adServing: (
    asOfDate: string,
    allowedClientSlugs: Set<string> | null
  ) => Promise<AdServingPacingCampaignRow[]>
  direct: (
    asOfDate: string,
    allowedClientSlugs: Set<string> | null
  ) => Promise<DirectCampaignGroup[]>
}

export type PortfolioChannelSources = {
  search: SearchPacingCampaignRow[]
  social: SocialPacingCampaignRow[]
  programmatic: ProgrammaticPacingCampaignRow[]
  adServing: AdServingPacingCampaignRow[]
  direct: DirectCampaignGroup[]
}

export type LoadPortfolioChannelSourcesArgs = {
  asOfDate: string
  allowedClientSlugs: Set<string> | null
}

/**
 * Load the five channel composers. Parallel is the serving path;
 * sequential exists so the fixture test can prove the assemble is order-stable.
 */
export async function loadPortfolioChannelSources(
  args: LoadPortfolioChannelSourcesArgs,
  loaders: PortfolioChannelLoaders,
  options?: { parallel?: boolean }
): Promise<PortfolioChannelSources> {
  const slugs = args.allowedClientSlugs
  if (options?.parallel === false) {
    return {
      search: await loaders.search(args.asOfDate, slugs),
      social: await loaders.social(args.asOfDate, slugs),
      programmatic: await loaders.programmatic(args.asOfDate, slugs),
      adServing: await loaders.adServing(args.asOfDate, slugs),
      direct: await loaders.direct(args.asOfDate, slugs),
    }
  }

  const [search, social, programmatic, adServing, direct] = await Promise.all([
    loaders.search(args.asOfDate, slugs),
    loaders.social(args.asOfDate, slugs),
    loaders.programmatic(args.asOfDate, slugs),
    loaders.adServing(args.asOfDate, slugs),
    loaders.direct(args.asOfDate, slugs),
  ])
  return { search, social, programmatic, adServing, direct }
}
