import type { MediaContainerBestPractice, Publisher } from "@/lib/types/publisher"

import { slugifyPlanGlobals, type PlanGlobals } from "./fromPlan"

export type NamingGenerateOptions = {
  useAva?: boolean
  /** Plan version for the download filename; defaults to "1". */
  version?: string | number
}

export type NamingGenerateBody = {
  globals: PlanGlobals
  lineItems: Record<string, unknown[]>
  /** Optional override — prefer server fetch of ?full=1 publishers. */
  publishers?: Publisher[]
  /** Optional override — prefer server fetch of media_container_best_practice. */
  containerBestPractice?: MediaContainerBestPractice[]
  options?: NamingGenerateOptions
  /** Alternate to options.version (client may send either). */
  version?: string | number
}

export type NamingReferenceOverride = {
  publishers?: Publisher[]
  containerBestPractice?: MediaContainerBestPractice[]
}

export type NamingReferenceSource = "server" | "body"

export type NamingReferenceData = {
  publishers: Publisher[]
  containerBestPractice: MediaContainerBestPractice[]
  source: {
    publishers: NamingReferenceSource
    containerBestPractice: NamingReferenceSource
  }
}

export type ResolveNamingReferenceDeps = {
  fetchPublishers?: () => Promise<Publisher[]>
  fetchBestPractice?: () => Promise<MediaContainerBestPractice[]>
}

function nonEmptyArray<T>(value: T[] | undefined | null): value is T[] {
  return Array.isArray(value) && value.length > 0
}

async function defaultFetchPublishers(): Promise<Publisher[]> {
  const { getCachedPublishersList } = await import("@/lib/api/publishersCache")
  const { data } = await getCachedPublishersList({ light: false })
  return (Array.isArray(data) ? data : []) as Publisher[]
}

async function defaultFetchBestPractice(): Promise<MediaContainerBestPractice[]> {
  const { getCachedMediaContainerBestPractice } = await import(
    "@/lib/api/mediaContainerBestPracticeCache"
  )
  const { data } = await getCachedMediaContainerBestPractice()
  return (Array.isArray(data) ? data : []) as MediaContainerBestPractice[]
}

/**
 * Resolve publishers + container best-practice for naming rails.
 * Server fetch is the default; non-empty body arrays remain an optional override.
 */
export async function resolveNamingReferenceData(
  override: NamingReferenceOverride = {},
  deps?: ResolveNamingReferenceDeps,
): Promise<NamingReferenceData> {
  const fetchPublishers = deps?.fetchPublishers ?? defaultFetchPublishers
  const fetchBestPractice = deps?.fetchBestPractice ?? defaultFetchBestPractice

  const needPubs = !nonEmptyArray(override.publishers)
  const needBp = !nonEmptyArray(override.containerBestPractice)

  const [serverPubs, serverBp] = await Promise.all([
    needPubs ? fetchPublishers() : Promise.resolve([] as Publisher[]),
    needBp
      ? fetchBestPractice()
      : Promise.resolve([] as MediaContainerBestPractice[]),
  ])

  const publishers = needPubs ? serverPubs : (override.publishers as Publisher[])
  const containerBestPractice = needBp
    ? serverBp
    : (override.containerBestPractice as MediaContainerBestPractice[])

  return {
    publishers,
    containerBestPractice,
    source: {
      publishers: needPubs ? "server" : "body",
      containerBestPractice: needBp ? "server" : "body",
    },
  }
}

export type NamingTokenPath = "ai" | "slug"

export type NamingGenerateResult = {
  /** Raw xlsx bytes for Content-Type spreadsheetml.sheet */
  buffer: Buffer
  fileName: string
  tokenPath: NamingTokenPath
  appliedCount: number
}

const STR_CAP = 200

function asTrimmedString(value: unknown, max = STR_CAP): string {
  if (value == null) return ""
  const s = String(value).trim()
  if (!s) return ""
  return s.length <= max ? s : s.slice(0, max)
}

function asLineItemBag(raw: unknown): Record<string, unknown[] | undefined> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, unknown[] | undefined> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) out[key] = value as unknown[]
  }
  return out
}

function asPublisherList(raw: unknown): Publisher[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.filter((row) => row && typeof row === "object") as Publisher[]
}

function asBestPracticeList(raw: unknown): MediaContainerBestPractice[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.filter(
    (row) => row && typeof row === "object",
  ) as MediaContainerBestPractice[]
}

/**
 * Normalize create/edit item bags (`digiDisplay` etc.) onto MBA `digital*` keys.
 * Kept local so parse/slugify does not depend on the workbook summariser module.
 */
export function normalizeNamingLineItems(
  items: Record<string, unknown[] | undefined>,
): Record<string, unknown[]> {
  const pick = (...keys: string[]): unknown[] => {
    for (const key of keys) {
      const v = items[key]
      if (Array.isArray(v) && v.length > 0) return v
    }
    for (const key of keys) {
      const v = items[key]
      if (Array.isArray(v)) return v
    }
    return []
  }

  return {
    search: pick("search"),
    socialMedia: pick("socialMedia"),
    digitalAudio: pick("digitalAudio", "digiAudio"),
    digitalDisplay: pick("digitalDisplay", "digiDisplay"),
    digitalVideo: pick("digitalVideo", "digiVideo"),
    bvod: pick("bvod"),
    integration: pick("integration"),
    progDisplay: pick("progDisplay"),
    progVideo: pick("progVideo"),
    progBvod: pick("progBvod"),
    progAudio: pick("progAudio"),
    progOoh: pick("progOoh"),
  }
}

/**
 * Parse the client-assembled POST body for /api/naming/generate.
 * Accepts create-page digi* aliases; normalizes onto digital* channelKeys.
 * Slugifies globals defensively — clients may post raw form strings.
 */
export function parseNamingGenerateBody(raw: unknown): NamingGenerateBody {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Body must be a JSON object")
  }
  const body = raw as Record<string, unknown>
  const g =
    body.globals && typeof body.globals === "object" && !Array.isArray(body.globals)
      ? (body.globals as Record<string, unknown>)
      : null
  if (!g) throw new Error("globals is required")

  const mbaRaw = asTrimmedString(g.mba, 80)
  if (!mbaRaw) throw new Error("globals.mba is required")

  const globals = slugifyPlanGlobals({
    brand: asTrimmedString(g.brand) || mbaRaw,
    campaign: asTrimmedString(g.campaign) || mbaRaw,
    mba: mbaRaw,
    month_start: asTrimmedString(g.month_start, 40),
    client: asTrimmedString(g.client) || asTrimmedString(g.brand) || mbaRaw,
    campaign_start_date: asTrimmedString(g.campaign_start_date, 40),
  })

  const optionsRaw =
    body.options && typeof body.options === "object" && !Array.isArray(body.options)
      ? (body.options as Record<string, unknown>)
      : undefined

  const options: NamingGenerateOptions = {}
  if (optionsRaw) {
    if (typeof optionsRaw.useAva === "boolean") options.useAva = optionsRaw.useAva
    if (optionsRaw.version != null && String(optionsRaw.version).trim()) {
      options.version = optionsRaw.version as string | number
    }
  }

  const version =
    body.version != null && String(body.version).trim()
      ? (body.version as string | number)
      : options.version

  return {
    globals,
    lineItems: normalizeNamingLineItems(asLineItemBag(body.lineItems)),
    publishers: asPublisherList(body.publishers),
    containerBestPractice: asBestPracticeList(body.containerBestPractice),
    options,
    version,
  }
}

export type GenerateFromPostedPlanDeps = {
  /** Override AVA provider (tests). */
  suggest?: (sources: unknown[]) => Promise<unknown>
  /** Override reference-data resolution (tests). */
  resolveReferences?: typeof resolveNamingReferenceData
}

/**
 * Build naming workbook bytes from posted (unsaved) plan state.
 * Never persists. AVA failures/timeouts → empty overrides (slug path).
 * Publishers + container best-practice are fetched server-side by default.
 *
 * Workbook / summariser modules load lazily so globals slugify + parse stay
 * testable when those companions are not yet on the branch.
 */
export async function generateNamingWorkbookFromPostedPlan(
  body: NamingGenerateBody,
  deps?: GenerateFromPostedPlanDeps,
): Promise<NamingGenerateResult> {
  const resolveReferences = deps?.resolveReferences ?? resolveNamingReferenceData
  const references = await resolveReferences({
    publishers: body.publishers,
    containerBestPractice: body.containerBestPractice,
  })

  const [{ buildNamingWorkbook, namingWorkbookFilename }, summariser, suggestMod] =
    await Promise.all([
      import("./exportNamingWorkbook"),
      import("./summariseTargetingTokens"),
      import("./suggestAvaNamingTokens"),
    ])

  const useAva = body.options?.useAva !== false
  const sources = summariser.collectTokenSources(body.lineItems, {
    globals: {
      brand: body.globals.brand,
      campaign: body.globals.campaign,
    },
    containerBestPractice: references.containerBestPractice,
  })

  let tokenPath: NamingTokenPath = "slug"
  let appliedCount = 0
  let tokenOverrides = {} as Awaited<
    ReturnType<typeof summariser.summariseTargetingTokens>
  >["overrides"]

  if (useAva && sources.length > 0) {
    const suggest =
      deps?.suggest ??
      ((items: unknown[]) =>
        suggestMod.suggestAvaNamingTokensWithTimeout(
          items as Parameters<
            typeof suggestMod.suggestAvaNamingTokensWithTimeout
          >[0],
        ))
    const summarised = await summariser.summariseTargetingTokens(sources, {
      suggest: suggest as never,
    })
    tokenOverrides = summarised.overrides
    appliedCount = summarised.appliedCount
    tokenPath = summarised.usedAva ? "ai" : "slug"
  }

  const version = body.version ?? body.options?.version ?? "1"
  const workbook = await buildNamingWorkbook({
    globals: body.globals,
    lineItems: body.lineItems,
    version,
    publishers: references.publishers,
    containerBestPractice: references.containerBestPractice,
    tokenOverrides,
  })

  const written = await workbook.xlsx.writeBuffer()
  const buffer = Buffer.isBuffer(written)
    ? written
    : Buffer.from(written as ArrayBuffer)

  return {
    buffer,
    fileName: namingWorkbookFilename(body.globals.mba, version),
    tokenPath,
    appliedCount,
  }
}
