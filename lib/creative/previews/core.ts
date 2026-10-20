/**
 * Creative preview cache job, without I/O. `lib/creative/previews/job.ts`
 * wires Snowflake, Postgres and Blob into `runPreviewJob`.
 */
import { isAllowedPreviewHost, previewFetchUrl, type PreviewFetchResult } from "./fetchPreviewImage"
import { canonicalPreviewUrl, previewSourceHash } from "./sourceHash"

export const PREVIEW_PLATFORMS = ["meta", "tiktok", "cm360"] as const
export type PreviewPlatform = (typeof PREVIEW_PLATFORMS)[number]

export const PREVIEW_RUN_LIMIT = 300
export const PREVIEW_CONCURRENCY = 6
export const PREVIEW_NIGHTLY_DAYS = 30
export const PREVIEW_BACKFILL_DAYS = 90

export function isPreviewPlatform(value: string): value is PreviewPlatform {
  return (PREVIEW_PLATFORMS as readonly string[]).includes(value)
}

/** One creative with delivery in the window, from V_CREATIVE_ASSETS joined to V_CREATIVE_PERFORMANCE_DAILY. */
export type PreviewAsset = {
  platform: PreviewPlatform
  creativeKey: string
  /** Null for a video with no still image (CM360 video): the row stores only the video link. */
  previewImageUrl: string | null
  previewKind: string | null
  viewUrl: string | null
  /** Latest delivery date in the window (YYYY-MM-DD). */
  lastDeliveryDate: string
  /** Lower-case MBA numbers the creative delivered against in the window. */
  mbaNumbers: string[]
}

export type CachedPreviewRow = {
  platform: string
  creativeKey: string
  sourceHash: string | null
  blobPathname: string | null
}

export type PreviewCacheUpsert = {
  platform: PreviewPlatform
  creativeKey: string
  clientId: number | null
  /** Null for a link-only row (a video with no still image). */
  blobPathname: string | null
  mimeType: string | null
  source: "platform"
  sourceRef: string | null
  previewKind: string | null
  viewUrl: string | null
  sourceHash: string
  fetchedAt: string
}

export type PreviewWorkItem = {
  asset: PreviewAsset
  sourceHash: string
  previous: CachedPreviewRow | null
}

export type PreviewPlan = {
  /** Up to `limit` items to fetch: new creatives first, then the most recently delivered. */
  todo: PreviewWorkItem[]
  /** Needed a fetch but over the run limit; picked up next run. */
  deferred: PreviewWorkItem[]
  /** Cache row already matches the source hash and has a blob. */
  upToDate: PreviewAsset[]
  /** preview_image_url does not parse as an http(s) URL. */
  invalid: PreviewAsset[]
  /** No still image but a video link: written as a cache row without a blob. */
  linkOnly: PreviewWorkItem[]
}

export function cacheKey(platform: string, creativeKey: string): string {
  return `${platform}::${creativeKey}`
}

export function planPreviewWork(
  assets: PreviewAsset[],
  cached: CachedPreviewRow[],
  limit: number = PREVIEW_RUN_LIMIT,
): PreviewPlan {
  const byKey = new Map(cached.map((row) => [cacheKey(row.platform, row.creativeKey), row]))
  const needed: PreviewWorkItem[] = []
  const upToDate: PreviewAsset[] = []
  const invalid: PreviewAsset[] = []
  const linkOnly: PreviewWorkItem[] = []

  for (const asset of assets) {
    const previous = byKey.get(cacheKey(asset.platform, asset.creativeKey)) ?? null
    if (!asset.previewImageUrl) {
      const linkHash = asset.viewUrl ? previewSourceHash(asset.viewUrl) : null
      if (!linkHash) {
        invalid.push(asset)
      } else if (previous && previous.sourceHash === linkHash && !previous.blobPathname) {
        upToDate.push(asset)
      } else {
        linkOnly.push({ asset, sourceHash: linkHash, previous })
      }
      continue
    }
    const hash = previewSourceHash(asset.previewImageUrl)
    if (!hash) {
      invalid.push(asset)
      continue
    }
    if (previous && previous.sourceHash === hash && previous.blobPathname) {
      upToDate.push(asset)
      continue
    }
    needed.push({ asset, sourceHash: hash, previous })
  }

  needed.sort((a, b) => {
    const aNew = a.previous ? 1 : 0
    const bNew = b.previous ? 1 : 0
    if (aNew !== bNew) return aNew - bNew
    if (a.asset.lastDeliveryDate !== b.asset.lastDeliveryDate) {
      return a.asset.lastDeliveryDate < b.asset.lastDeliveryDate ? 1 : -1
    }
    return cacheKey(a.asset.platform, a.asset.creativeKey).localeCompare(
      cacheKey(b.asset.platform, b.asset.creativeKey),
    )
  })

  const cap = Math.max(0, Math.floor(limit))
  return { todo: needed.slice(0, cap), deferred: needed.slice(cap), upToDate, invalid, linkOnly }
}

/**
 * Client for a cache row: the single client every MBA the creative delivered
 * against maps to (media_plan_masters.client_id). No MBA, an unmapped MBA
 * only, or MBAs on two clients gives null, which only an admin can view.
 */
export function resolvePreviewClientId(
  mbaNumbers: string[],
  clientByMba: ReadonlyMap<string, number>,
): number | null {
  const ids = new Set<number>()
  for (const mba of mbaNumbers) {
    const id = clientByMba.get(mba.trim().toLowerCase())
    if (id != null && id > 0) ids.add(id)
  }
  return ids.size === 1 ? [...ids][0] : null
}

/** Fixed Blob key: creative-previews/<platform>/<creative_key>.<ext>. */
export function previewBlobPathname(platform: PreviewPlatform, creativeKey: string, ext: string): string {
  const safeKey = creativeKey.trim().replace(/[^A-Za-z0-9._-]/g, "_")
  return `creative-previews/${platform}/${safeKey}.${ext}`
}

export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await worker(item)
    }
  })
  await Promise.all(lanes)
}

export type PlatformCounts = {
  candidates: number
  wouldFetch: number
  fetched: number
  skipped: number
  failed: number
  deferred: number
  invalid: number
  hostNotAllowed: number
  /** Link-only rows written (video with no still image). */
  linked: number
}

export type PreviewJobResult = {
  status: "ok" | "not_ready"
  dryRun: boolean
  days: number
  totals: PlatformCounts
  byPlatform: Record<PreviewPlatform, PlatformCounts>
  failures: { platform: PreviewPlatform; creativeKey: string; reason: string }[]
}

export type PreviewJobDeps = {
  loadAssets: (days: number) => Promise<PreviewAsset[]>
  loadCached: (assets: PreviewAsset[]) => Promise<CachedPreviewRow[]>
  loadClientByMba: (mbaNumbers: string[]) => Promise<Map<string, number>>
  fetchImage: (url: string) => Promise<PreviewFetchResult>
  putBlob: (pathname: string, bytes: Uint8Array, contentType: string) => Promise<{ pathname: string }>
  deleteBlob: (pathname: string) => Promise<void>
  upsertRow: (row: PreviewCacheUpsert) => Promise<void>
  now?: () => Date
  log?: (message: string, detail?: Record<string, unknown>) => void
}

export type PreviewJobOptions = {
  days: number
  confirm: boolean
  limit?: number
  concurrency?: number
}

function emptyCounts(): PlatformCounts {
  return {
    candidates: 0,
    wouldFetch: 0,
    fetched: 0,
    skipped: 0,
    failed: 0,
    deferred: 0,
    invalid: 0,
    hostNotAllowed: 0,
    linked: 0,
  }
}

function sumCounts(byPlatform: Record<PreviewPlatform, PlatformCounts>): PlatformCounts {
  const totals = emptyCounts()
  for (const counts of Object.values(byPlatform)) {
    for (const key of Object.keys(totals) as (keyof PlatformCounts)[]) totals[key] += counts[key]
  }
  return totals
}

function emptyByPlatform(): Record<PreviewPlatform, PlatformCounts> {
  return { meta: emptyCounts(), tiktok: emptyCounts(), cm360: emptyCounts() }
}

export function notReadyResult(days: number, dryRun: boolean): PreviewJobResult {
  const byPlatform = emptyByPlatform()
  return { status: "not_ready", dryRun, days, totals: sumCounts(byPlatform), byPlatform, failures: [] }
}

/**
 * Plan, then (with `confirm`) fetch, store and upsert. A failed fetch, Blob
 * write or upsert leaves the existing cache row untouched.
 */
export async function runPreviewJob(
  deps: PreviewJobDeps,
  options: PreviewJobOptions,
): Promise<PreviewJobResult> {
  const log = deps.log ?? (() => undefined)
  const now = deps.now ?? (() => new Date())
  const limit = options.limit ?? PREVIEW_RUN_LIMIT
  const concurrency = options.concurrency ?? PREVIEW_CONCURRENCY

  const assets = await deps.loadAssets(options.days)
  const cached = assets.length > 0 ? await deps.loadCached(assets) : []
  const plan = planPreviewWork(assets, cached, limit)

  const byPlatform = emptyByPlatform()
  for (const asset of assets) byPlatform[asset.platform].candidates++
  for (const asset of plan.upToDate) byPlatform[asset.platform].skipped++
  for (const asset of plan.invalid) byPlatform[asset.platform].invalid++
  for (const item of plan.deferred) byPlatform[item.asset.platform].deferred++
  for (const item of plan.todo) {
    byPlatform[item.asset.platform].wouldFetch++
    if (!isAllowedPreviewHost(previewFetchUrl(item.asset.previewImageUrl ?? ""))) {
      byPlatform[item.asset.platform].hostNotAllowed++
    }
  }

  const failures: PreviewJobResult["failures"] = []
  if (!options.confirm) {
    for (const item of plan.linkOnly) byPlatform[item.asset.platform].linked++
    return { status: "ok", dryRun: true, days: options.days, totals: sumCounts(byPlatform), byPlatform, failures }
  }

  const mbas = [...new Set([...plan.todo, ...plan.linkOnly].flatMap((item) => item.asset.mbaNumbers))]
  const clientByMba = mbas.length > 0 ? await deps.loadClientByMba(mbas) : new Map<string, number>()

  await runPool(plan.todo, concurrency, async (item) => {
    const { asset } = item
    const fail = (reason: string) => {
      byPlatform[asset.platform].failed++
      failures.push({ platform: asset.platform, creativeKey: asset.creativeKey, reason })
    }
    try {
      if (!asset.previewImageUrl) {
        fail("no image url")
        return
      }
      const fetched = await deps.fetchImage(asset.previewImageUrl)
      if (!fetched.ok) {
        fail(fetched.detail ? `${fetched.reason}: ${fetched.detail}` : fetched.reason)
        return
      }
      const pathname = previewBlobPathname(asset.platform, asset.creativeKey, fetched.image.ext)
      const stored = await deps.putBlob(pathname, fetched.image.bytes, fetched.image.contentType)
      const storedPath = stored.pathname.replace(/^\//, "")
      await deps.upsertRow({
        platform: asset.platform,
        creativeKey: asset.creativeKey,
        clientId: resolvePreviewClientId(asset.mbaNumbers, clientByMba),
        blobPathname: storedPath,
        mimeType: fetched.image.contentType,
        source: "platform",
        sourceRef: canonicalPreviewUrl(asset.previewImageUrl),
        previewKind: asset.previewKind,
        viewUrl: asset.viewUrl,
        sourceHash: item.sourceHash,
        fetchedAt: now().toISOString(),
      })
      byPlatform[asset.platform].fetched++
      const old = item.previous?.blobPathname?.replace(/^\//, "")
      if (old && old !== storedPath) {
        await deps.deleteBlob(old).catch((err) => log("old blob delete failed", { old, err: String(err) }))
      }
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
  })

  for (const item of plan.linkOnly) {
    const { asset } = item
    try {
      await deps.upsertRow({
        platform: asset.platform,
        creativeKey: asset.creativeKey,
        clientId: resolvePreviewClientId(asset.mbaNumbers, clientByMba),
        blobPathname: null,
        mimeType: null,
        source: "platform",
        sourceRef: asset.viewUrl ? canonicalPreviewUrl(asset.viewUrl) : null,
        previewKind: asset.previewKind,
        viewUrl: asset.viewUrl,
        sourceHash: item.sourceHash,
        fetchedAt: now().toISOString(),
      })
      byPlatform[asset.platform].linked++
      const old = item.previous?.blobPathname?.replace(/^\//, "")
      if (old) await deps.deleteBlob(old).catch((err) => log("old blob delete failed", { old, err: String(err) }))
    } catch (err) {
      byPlatform[asset.platform].failed++
      failures.push({ platform: asset.platform, creativeKey: asset.creativeKey, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  const totals = sumCounts(byPlatform)
  log("run complete", {
    fetched: totals.fetched,
    skipped: totals.skipped,
    failed: totals.failed,
    deferred: totals.deferred,
  })
  return { status: "ok", dryRun: false, days: options.days, totals, byPlatform, failures }
}
