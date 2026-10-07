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

export const PORTFOLIO_SOURCE_TIMEOUT_MS = 90_000
export const PORTFOLIO_OVERALL_BUDGET_MS = 240_000

export type PortfolioSourceName = keyof PortfolioChannelSources

export type PortfolioSourceTiming = {
  source: PortfolioSourceName | "versions"
  ms: number
  rowCount: number
  timedOut: boolean
}

export type LoadPortfolioChannelSourcesOptions = {
  parallel?: boolean
  /** Wall clock from the request start. Defaults to now. */
  startedAt?: number
  /** Stop waiting once this many ms have elapsed since startedAt. */
  overallBudgetMs?: number
  /** Cap on one source. Ignored when unset, so fixture loads stay unbounded. */
  perSourceTimeoutMs?: number
  timings?: PortfolioSourceTiming[]
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("portfolio source timeout"))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function isSourceTimeout(err: unknown): boolean {
  return err instanceof Error && err.message === "portfolio source timeout"
}

export async function loadBoundedSource<T>(
  source: PortfolioSourceTiming["source"],
  run: () => Promise<T[]>,
  options: LoadPortfolioChannelSourcesOptions | undefined,
): Promise<T[]> {
  return loadBounded(source, run, options)
}

async function loadBounded<T>(
  source: PortfolioSourceTiming["source"],
  run: () => Promise<T[]>,
  options: LoadPortfolioChannelSourcesOptions | undefined,
): Promise<T[]> {
  const timings = options?.timings
  const started = Date.now()
  const budgetStart = options?.startedAt ?? started
  const perSource = options?.perSourceTimeoutMs
  if (perSource == null) {
    const rows = await run()
    timings?.push({
      source,
      ms: Date.now() - started,
      rowCount: rows.length,
      timedOut: false,
    })
    return rows
  }

  const remaining =
    (options?.overallBudgetMs ?? PORTFOLIO_OVERALL_BUDGET_MS) - (started - budgetStart)
  if (remaining <= 0) {
    timings?.push({ source, ms: 0, rowCount: 0, timedOut: true })
    return []
  }

  try {
    const rows = await withDeadline(run(), Math.min(perSource, remaining))
    timings?.push({
      source,
      ms: Date.now() - started,
      rowCount: rows.length,
      timedOut: false,
    })
    return rows
  } catch (err) {
    timings?.push({
      source,
      ms: Date.now() - started,
      rowCount: 0,
      timedOut: isSourceTimeout(err),
    })
    if (!isSourceTimeout(err)) throw err
    return []
  }
}

/**
 * Load the five channel composers. Parallel is the serving path;
 * sequential exists so the fixture test can prove the assemble is order-stable.
 */
export async function loadPortfolioChannelSources(
  args: LoadPortfolioChannelSourcesArgs,
  loaders: PortfolioChannelLoaders,
  options?: LoadPortfolioChannelSourcesOptions
): Promise<PortfolioChannelSources> {
  const slugs = args.allowedClientSlugs
  const load = <T>(source: PortfolioSourceName, run: () => Promise<T[]>) =>
    loadBounded(source, run, options)

  if (options?.parallel === false) {
    return {
      search: await load("search", () => loaders.search(args.asOfDate, slugs)),
      social: await load("social", () => loaders.social(args.asOfDate, slugs)),
      programmatic: await load("programmatic", () => loaders.programmatic(args.asOfDate, slugs)),
      adServing: await load("adServing", () => loaders.adServing(args.asOfDate, slugs)),
      direct: await load("direct", () => loaders.direct(args.asOfDate, slugs)),
    }
  }

  const [search, social, programmatic, adServing, direct] = await Promise.all([
    load("search", () => loaders.search(args.asOfDate, slugs)),
    load("social", () => loaders.social(args.asOfDate, slugs)),
    load("programmatic", () => loaders.programmatic(args.asOfDate, slugs)),
    load("adServing", () => loaders.adServing(args.asOfDate, slugs)),
    load("direct", () => loaders.direct(args.asOfDate, slugs)),
  ])
  return { search, social, programmatic, adServing, direct }
}
