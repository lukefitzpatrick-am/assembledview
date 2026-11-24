/**
 * One Site Watch run, resumable (brief 5.2). The worker calls `advanceRun`
 * with a deadline; it plans the run once (robots.txt, sitemap, page list),
 * then checks pages four at a time, saving after each group, and returns
 * true when the run is finished. Storage is passed in (`ScanStore`), so this
 * file has no database.
 */
import { comparePages, type DetectedChange } from "./compare"
import { extractPage, shortHash, stripQuery, type PageSnapshot } from "./extract"
import { isHtml, looksBlocked, type Fetched, type FetchUrl } from "./fetchPage"
import { lineDiff } from "./lineDiff"
import { severityFor, type Severity } from "./severity"
import { readSitemap, robotsSitemaps } from "./sitemap"

export type SiteRow = {
  id: number
  baseUrl: string
  urlPrefix: string | null
  sitemapUrl: string | null
  robotsUrl: string | null
  keyUrls: string[]
  pageLimit: number
  ignoreSelectors: string[]
  watchText: boolean
  watchVisual: boolean
  robotsTxt: string | null
  sitemapUrls: string[] | null
}

export type RunRow = {
  id: number
  pageUrls: string[] | null
  nextPage: number
  cssHashes: Record<string, string>
  pagesChecked: number
  pagesChanged: number
  pagesFailed: number
  flags: string[]
}

export type StoredPage = PageSnapshot & { failError: string | null }
export type ChangeRow = DetectedChange & { severity: Severity }

export type ScanStore = {
  savePlan(site: SiteRow, run: RunRow, plan: { robotsTxt: string | null; sitemapUrls: string[] | null; changes: ChangeRow[] }): Promise<void>
  loadPages(siteId: number, urls: string[]): Promise<Map<string, StoredPage>>
  /** `snapshot` null keeps the stored fields (a failed load) and sets `failError`. */
  savePage(site: SiteRow, run: RunRow, url: string, page: { snapshot: PageSnapshot | null; failError: string | null; changes: ChangeRow[] }): Promise<void>
  saveProgress(run: RunRow): Promise<void>
}

export type ScanDeps = { store: ScanStore; fetchUrl: FetchUrl; deadline: number; now?: () => number }

const CONCURRENCY = 4
const STYLESHEETS_PER_PAGE = 20
/** Room left for one more group: a 30s fetch timeout plus saving. */
const GROUP_BUDGET_MS = 40_000
const THIN_TEXT_CHARS = 200
const LIST_CAP = 50

function normaliseUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    u.hash = ""
    return u.toString()
  } catch {
    return null
  }
}

function addFlag(run: RunRow, flag: string) {
  if (!run.flags.includes(flag)) run.flags.push(flag)
}

function keyPages(site: SiteRow): string[] {
  return [...new Set([site.baseUrl, ...site.keyUrls].map(normaliseUrl).filter((u): u is string => !!u))]
}

const disallowAllCount = (robots: string) => robots.split("\n").filter((l) => /^\s*disallow:\s*\/\s*$/i.test(l)).length

async function planRun(site: SiteRow, run: RunRow, deps: ScanDeps): Promise<void> {
  const origin = new URL(site.baseUrl).origin
  const changes: ChangeRow[] = []

  const robots = await deps.fetchUrl(site.robotsUrl ?? `${origin}/robots.txt`)
  const robotsTxt = robots.ok && robots.status === 200 ? robots.body.slice(0, 100_000) : null
  if (robotsTxt !== null && site.robotsTxt !== null && robotsTxt !== site.robotsTxt) {
    const diff = lineDiff(site.robotsTxt.split("\n"), robotsTxt.split("\n"))
    if (diff.total) {
      const c: DetectedChange = { url: null, category: "technical", field: "robots_txt", diff }
      // Counted on the whole file: the stored diff is capped at 40 lines.
      const blocksAll = disallowAllCount(robotsTxt) > disallowAllCount(site.robotsTxt)
      changes.push({ ...c, severity: blocksAll ? "critical" : severityFor(c, { isKeyPage: true }) })
    }
  }

  const fromRobots = robotsTxt ? robotsSitemaps(robotsTxt).slice(0, 10) : []
  const sitemapFiles = site.sitemapUrl ? [site.sitemapUrl] : fromRobots.length ? fromRobots : [`${origin}/sitemap.xml`]
  const prefix = origin + (site.urlPrefix ?? "/")
  // All or nothing: one unreadable file would make its URLs look removed.
  let read: string[] | null = []
  for (const file of sitemapFiles) {
    const part = await readSitemap(file, deps.fetchUrl, { deadline: deps.deadline, now: deps.now ?? Date.now })
    if (!part) {
      read = null
      break
    }
    read.push(...part)
  }
  const found = read
    ? [...new Set(read.map(normaliseUrl).filter((u): u is string => !!u && u.startsWith(prefix)))].sort()
    : []
  // An unreadable or empty sitemap is "no answer", never "every URL removed".
  const sitemapUrls = found.length ? found : null
  if (sitemapUrls && site.sitemapUrls) {
    const old = new Set(site.sitemapUrls)
    const now = new Set(sitemapUrls)
    const added = sitemapUrls.filter((u) => !old.has(u))
    const removed = site.sitemapUrls.filter((u) => !now.has(u))
    for (const [field, list] of [["sitemap_added", added], ["sitemap_removed", removed]] as const) {
      if (!list.length) continue
      const c: DetectedChange = { url: null, category: "technical", field, after: { urls: list.slice(0, LIST_CAP), total: list.length } }
      changes.push({ ...c, severity: severityFor(c, { isKeyPage: false }) })
    }
  }

  run.pageUrls = [...new Set([...keyPages(site), ...(sitemapUrls ?? site.sitemapUrls ?? [])])].slice(0, site.pageLimit)
  run.nextPage = 0
  await deps.store.savePlan(site, run, { robotsTxt, sitemapUrls, changes })
}

/** Returns true when the run is finished (every page checked, or the site is blocked). */
export async function advanceRun(site: SiteRow, run: RunRow, deps: ScanDeps): Promise<boolean> {
  const now = deps.now ?? Date.now
  if (!run.pageUrls) await planRun(site, run, deps)
  const urls = run.pageUrls!
  const keys = new Set(keyPages(site))
  const css = new Map<string, string | Promise<string>>(Object.entries(run.cssHashes))
  const cssHash = (url: string) => {
    let h = css.get(url)
    if (h === undefined) {
      h = deps.fetchUrl(url).then((f) => (f.ok ? (f.status === 200 ? shortHash(f.body) : `http-${f.status}`) : "unreachable"))
      css.set(url, h)
    }
    return h
  }

  while (run.nextPage < urls.length) {
    if (now() + GROUP_BUDGET_MS > deps.deadline) return false
    const group = urls.slice(run.nextPage, run.nextPage + CONCURRENCY)
    const [fetched, stored] = await Promise.all([
      Promise.all(group.map((u) => deps.fetchUrl(u))),
      deps.store.loadPages(site.id, group),
    ])
    if (run.nextPage === 0 && looksBlocked(fetched[0]!)) {
      addFlag(run, "blocked")
      run.nextPage = urls.length
      await deps.store.saveProgress(run)
      return true
    }
    // The group's pages (and their stylesheet fetches) run side by side.
    await Promise.all(
      group.map((url, i) => {
        const f = fetched[i]!
        if (looksBlocked(f)) return addFlag(run, "blocked")
        return checkPage(site, run, url, f, stored.get(url) ?? null, keys.has(url), cssHash, deps.store, run.nextPage + i === 0)
      }),
    )
    run.nextPage += group.length
    run.cssHashes = Object.fromEntries(await Promise.all([...css].map(async ([u, h]) => [u, await h] as const)))
    await deps.store.saveProgress(run)
  }
  return true
}

async function checkPage(
  site: SiteRow,
  run: RunRow,
  url: string,
  f: Fetched,
  old: StoredPage | null,
  isKeyPage: boolean,
  cssHash: (url: string) => string | Promise<string>,
  store: ScanStore,
  isFirst: boolean,
): Promise<void> {
  // A PDF, image or feed listed in the sitemap is not a page to watch.
  if (f.ok && f.status < 400 && !isHtml(f)) return
  run.pagesChecked++
  const rate = (c: DetectedChange): ChangeRow => ({ ...c, severity: severityFor(c, { isKeyPage }) })
  let error = f.ok ? (f.status >= 400 ? `HTTP ${f.status}` : null) : f.error
  if (error === null && f.ok) {
    try {
      await checkLoaded(site, run, url, f, old, cssHash, store, isFirst, rate)
      return
    } catch (err) {
      // One unreadable page is that page's failure, never the whole run's.
      console.error("[site-watch] page check failed", url, err)
      error = `could not read the page: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200)
    }
  }
  // A 4xx/5xx or failed load keeps the last good snapshot (brief 5.2.7).
  run.pagesFailed++
  if (!old) return // no baseline to keep
  const changes = old.failError ? [] : [rate({ url, category: "technical", field: "page_failed", after: error })]
  if (changes.length) run.pagesChanged++
  await store.savePage(site, run, url, { snapshot: null, failError: error, changes })
}

async function checkLoaded(
  site: SiteRow,
  run: RunRow,
  url: string,
  f: Extract<Fetched, { ok: true }>,
  old: StoredPage | null,
  cssHash: (url: string) => string | Promise<string>,
  store: ScanStore,
  isFirst: boolean,
  rate: (c: DetectedChange) => ChangeRow,
): Promise<void> {
  const page = extractPage({
    html: f.body,
    status: f.status,
    finalUrl: f.finalUrl,
    xRobotsTag: f.headers.get("x-robots-tag") ?? "",
    ignoreSelectors: site.ignoreSelectors,
  })
  if (site.watchVisual) {
    const sheets = page.stylesheetUrls.slice(0, STYLESHEETS_PER_PAGE)
    const hashes = await Promise.all(sheets.map(cssHash))
    page.fields.stylesheets = Object.fromEntries(sheets.map((u, i) => [stripQuery(u), hashes[i]!]))
  }
  if (isFirst && f.status === 200 && page.text.length < THIN_TEXT_CHARS) addFlag(run, "thin_html")
  const snapshot: PageSnapshot = { fields: page.fields, text: page.text, layout: page.layout }
  const changes: ChangeRow[] = []
  if (old) {
    if (old.failError) changes.push(rate({ url, category: "technical", field: "page_recovered", before: old.failError }))
    changes.push(...comparePages(url, old, snapshot, { watchText: site.watchText, watchVisual: site.watchVisual }).map(rate))
  }
  if (changes.length) run.pagesChanged++
  await store.savePage(site, run, url, { snapshot, failError: null, changes })
}
