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
  /** 1 on the first wait, 2 on the single retry. */
  attempt?: number
  /** Still inside its deadline when the build logged. */
  pending?: boolean
}

export const PORTFOLIO_TIMING_SOURCES = [
  "search",
  "social",
  "programmatic",
  "adServing",
  "direct",
  "versions",
] as const

/** Every source is present. One still inside its deadline is `pending: true`. */
export function completePortfolioSourceTimings(
  timings: PortfolioSourceTiming[],
): PortfolioSourceTiming[] {
  const seen = new Set(timings.map((row) => row.source))
  const completed = timings.slice()
  for (const source of PORTFOLIO_TIMING_SOURCES) {
    if (seen.has(source)) continue
    completed.push({ source, ms: 0, rowCount: 0, timedOut: false, pending: true })
  }
  return completed
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

function logSourceAttempt(timing: PortfolioSourceTiming): void {
  console.log(
    JSON.stringify({
      event: "pacing_portfolio_source_attempt",
      source: timing.source,
      attempt: timing.attempt ?? 1,
      ms: timing.ms,
      rowCount: timing.rowCount,
      timedOut: timing.timedOut,
    }),
  )
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

  const overall = options?.overallBudgetMs ?? PORTFOLIO_OVERALL_BUDGET_MS
  const remainingAt = () => overall - (Date.now() - budgetStart)
  if (remainingAt() <= 0) {
    timings?.push({ source, ms: 0, rowCount: 0, timedOut: true })
    return []
  }

  const runAttempt = async (
    attempt: number,
    cap: number,
  ): Promise<{ rows: T[] | null; timing: PortfolioSourceTiming; hardError?: unknown }> => {
    const attemptStarted = Date.now()
    try {
      const rows = await withDeadline(run(), cap)
      const timing: PortfolioSourceTiming = {
        source,
        ms: Date.now() - attemptStarted,
        rowCount: rows.length,
        timedOut: false,
        attempt,
      }
      logSourceAttempt(timing)
      return { rows, timing }
    } catch (err) {
      const timedOut = isSourceTimeout(err)
      const timing: PortfolioSourceTiming = {
        source,
        ms: Date.now() - attemptStarted,
        rowCount: 0,
        timedOut,
        attempt,
      }
      logSourceAttempt(timing)
      if (!timedOut) return { rows: null, timing, hardError: err }
      return { rows: null, timing }
    }
  }

  const firstCap = Math.min(perSource, remainingAt())
  const first = await runAttempt(1, firstCap)
  if (first.hardError) {
    timings?.push(first.timing)
    throw first.hardError
  }
  if (first.rows) {
    timings?.push(first.timing)
    return first.rows
  }

  const remaining = remainingAt()
  if (remaining <= 0) {
    timings?.push(first.timing)
    throw new Error(`portfolio source timeout: ${source}`)
  }

  const second = await runAttempt(2, Math.min(perSource, remaining))
  timings?.push(second.timing)
  if (second.hardError) throw second.hardError
  if (second.rows) return second.rows
  throw new Error(`portfolio source timeout: ${source}`)
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
