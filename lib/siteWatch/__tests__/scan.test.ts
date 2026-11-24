/** Roz (Site Watch) phase 1: a run end to end against a fake site and an in-memory store (brief 5.2). */
import assert from "node:assert/strict"
import test from "node:test"

import type { PageSnapshot } from "../extract"
import type { Fetched } from "../fetchPage"
import { advanceRun, type ChangeRow, type RunRow, type ScanStore, type SiteRow, type StoredPage } from "../scan"

const ORIGIN = "https://shop.test"
type Resp = { status?: number; body?: string; headers?: Record<string, string> } | "down"

function page(title: string, extra = "") {
  return `<html><head><title>${title}</title><link rel="stylesheet" href="/s.css?v=1"></head><body><main><h1>${title}</h1><p>Plenty of copy on this page to stay well clear of the thin HTML rule, line one.</p><p>${extra} More words here so the text is long enough for the check that flags near empty pages.</p></main></body></html>`
}

function fakeSite(map: Record<string, Resp>) {
  const calls: string[] = []
  const fetchUrl = async (url: string): Promise<Fetched> => {
    calls.push(url)
    const r = map[url] ?? { status: 404, body: "not found" }
    if (r === "down") return { ok: false, error: "ECONNREFUSED" }
    return { ok: true, status: r.status ?? 200, finalUrl: url, headers: new Headers(r.headers ?? {}), body: r.body ?? "" }
  }
  return { fetchUrl, calls }
}

function memoryStore() {
  const pages = new Map<string, StoredPage>()
  const changes: ChangeRow[] = []
  const site: Partial<SiteRow> = {}
  const store: ScanStore = {
    async savePlan(s, _run, plan) {
      changes.push(...plan.changes)
      if (plan.robotsTxt !== null) site.robotsTxt = plan.robotsTxt
      if (plan.sitemapUrls !== null) site.sitemapUrls = plan.sitemapUrls
    },
    async loadPages(_id, urls) {
      return new Map(urls.filter((u) => pages.has(u)).map((u) => [u, structuredClone(pages.get(u)!)]))
    },
    async savePage(_s, _run, url, p: { snapshot: PageSnapshot | null; failError: string | null; changes: ChangeRow[] }) {
      changes.push(...p.changes)
      const old = pages.get(url)
      if (p.snapshot) pages.set(url, { ...p.snapshot, failError: null })
      else if (old) old.failError = p.failError
    },
    async saveProgress() {},
  }
  return { store, pages, changes, site }
}

function newSite(state: Partial<SiteRow>): SiteRow {
  return {
    id: 1, baseUrl: `${ORIGIN}/`, urlPrefix: null, sitemapUrl: null, robotsUrl: null, keyUrls: [],
    pageLimit: 100, ignoreSelectors: [], watchText: true, watchVisual: true,
    robotsTxt: state.robotsTxt ?? null, sitemapUrls: state.sitemapUrls ?? null,
  }
}
const newRun = (): RunRow => ({ id: 1, pageUrls: null, nextPage: 0, cssHashes: {}, pagesChecked: 0, pagesChanged: 0, pagesFailed: 0, flags: [] })

async function scan(map: Record<string, Resp>, mem: ReturnType<typeof memoryStore>, deadline = Date.now() + 600_000) {
  const { fetchUrl, calls } = fakeSite(map)
  const run = newRun()
  const before = mem.changes.length
  const done = await advanceRun(newSite(mem.site), run, { store: mem.store, fetchUrl, deadline })
  return { done, run, calls, changes: mem.changes.slice(before) }
}

const SITEMAP = `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/a</loc></url><url><loc>https://other.test/x</loc></url></urlset>`
const day1: Record<string, Resp> = {
  [`${ORIGIN}/robots.txt`]: { body: `User-agent: *\nDisallow: /cart\nSitemap: ${ORIGIN}/sm.xml` },
  [`${ORIGIN}/sm.xml`]: { body: SITEMAP },
  [`${ORIGIN}/`]: { body: page("Home") },
  [`${ORIGIN}/a`]: { body: page("Page A") },
  [`${ORIGIN}/s.css?v=1`]: { body: "body{}" },
}

test("first scan is the baseline: pages from the sitemap (same host only), no changes", async () => {
  const mem = memoryStore()
  const r = await scan(day1, mem)
  assert.equal(r.done, true)
  assert.deepEqual(r.run.pageUrls, [`${ORIGIN}/`, `${ORIGIN}/a`])
  assert.deepEqual(r.changes, [])
  assert.equal(r.run.pagesChecked, 2)
  assert.equal(r.calls.filter((u) => u.endsWith(".css?v=1")).length, 1, "each stylesheet fetched once per run")
  assert.deepEqual(Object.keys(mem.pages.get(`${ORIGIN}/`)!.fields.stylesheets), [`${ORIGIN}/s.css`])
})

test("second scan records title, robots.txt, sitemap and stylesheet changes with severity", async () => {
  const mem = memoryStore()
  await scan(day1, mem)
  const r = await scan(
    {
      ...day1,
      [`${ORIGIN}/robots.txt`]: { body: `User-agent: *\nDisallow: /\nSitemap: ${ORIGIN}/sm.xml` },
      [`${ORIGIN}/sm.xml`]: { body: SITEMAP.replace(`${ORIGIN}/a</loc>`, `${ORIGIN}/b</loc>`) },
      [`${ORIGIN}/`]: { body: page("Home!") },
      [`${ORIGIN}/b`]: { body: page("Page B") },
      [`${ORIGIN}/s.css?v=1`]: { body: "body{color:red}" },
    },
    mem,
  )
  const got = r.changes.map((c) => `${c.url ?? "site"} ${c.field} ${c.severity}`).sort()
  assert.deepEqual(got, [
    `${ORIGIN}/ h1 high`,
    `${ORIGIN}/ page_text medium`,
    `${ORIGIN}/ stylesheet_content low`,
    `${ORIGIN}/ title high`,
    "site robots_txt critical",
    "site sitemap_added medium",
    "site sitemap_removed medium",
  ])
})

test("a failed fetch keeps the snapshot, raises one change, then one on recovery", async () => {
  const mem = memoryStore()
  await scan(day1, mem)
  const good = structuredClone(mem.pages.get(`${ORIGIN}/a`)!.fields)
  const down = { ...day1, [`${ORIGIN}/a`]: "down" as const }
  const r1 = await scan(down, mem)
  assert.deepEqual(r1.changes.map((c) => [c.field, c.severity]), [["page_failed", "medium"]])
  assert.deepEqual(mem.pages.get(`${ORIGIN}/a`)!.fields, good)
  assert.equal(r1.run.pagesFailed, 1)
  const r2 = await scan(down, mem)
  assert.deepEqual(r2.changes, [], "still down: no second change")
  const r3 = await scan(day1, mem)
  assert.deepEqual(r3.changes.map((c) => c.field), ["page_recovered"])
})

test("bot protection on the home page flags the run blocked and raises nothing", async () => {
  const mem = memoryStore()
  await scan(day1, mem)
  const r = await scan({ ...day1, [`${ORIGIN}/`]: { status: 403, body: "<title>Just a moment...</title>", headers: { server: "cloudflare" } } }, mem)
  assert.equal(r.done, true)
  assert.deepEqual(r.run.flags, ["blocked"])
  assert.deepEqual(r.changes, [])
})

test("near-empty server HTML on the home page is flagged thin_html", async () => {
  const mem = memoryStore()
  const r = await scan({ ...day1, [`${ORIGIN}/`]: { body: "<html><body><div id=root></div></body></html>" } }, mem)
  assert.deepEqual(r.run.flags, ["thin_html"])
})

test("out of time: the run stops between groups and resumes where it left off", async () => {
  const mem = memoryStore()
  const map = { ...day1 }
  const locs = Array.from({ length: 9 }, (_, i) => `${ORIGIN}/p${i}`)
  map[`${ORIGIN}/sm.xml`] = { body: `<urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>` }
  for (const l of locs) map[l] = { body: page(l) }
  const { fetchUrl } = fakeSite(map)
  const run = newRun()
  let clock = 0
  const deps = { store: mem.store, fetchUrl, deadline: 90_000, now: () => (clock += 30_000) }
  // The first call also spends one clock tick on the sitemap's deadline check.
  assert.equal(await advanceRun(newSite(mem.site), run, { ...deps, deadline: 120_000 }), false)
  assert.equal(run.nextPage, 4)
  clock = 0
  assert.equal(await advanceRun(newSite(mem.site), run, deps), false)
  assert.equal(run.nextPage, 8)
  clock = 0
  assert.equal(await advanceRun(newSite(mem.site), run, deps), true)
  assert.equal(run.pagesChecked, 10)
  assert.equal(mem.pages.size, 10)
})

test("an HTTP 500 on the home page keeps the snapshot and raises one Critical change", async () => {
  const mem = memoryStore()
  await scan(day1, mem)
  const good = structuredClone(mem.pages.get(`${ORIGIN}/`)!.fields)
  const r = await scan({ ...day1, [`${ORIGIN}/`]: { status: 500, body: "<title>Server error</title><h1>Oops</h1>" } }, mem)
  assert.deepEqual(r.changes.map((c) => [c.field, c.after, c.severity]), [["page_failed", "HTTP 500", "critical"]])
  assert.deepEqual(mem.pages.get(`${ORIGIN}/`)!.fields, good, "no title or H1 change from the error page")
  const back = await scan(day1, mem)
  assert.deepEqual(back.changes.map((c) => c.field), ["page_recovered"])
})

test("a real outage behind Cloudflare is not hidden as blocked; a challenge is", async () => {
  const mem = memoryStore()
  await scan(day1, mem)
  const outage = await scan({ ...day1, [`${ORIGIN}/`]: { status: 503, body: "Service unavailable", headers: { "cf-ray": "1", server: "cloudflare" } } }, mem)
  assert.deepEqual(outage.run.flags, [])
  assert.deepEqual(outage.changes.map((c) => [c.field, c.severity]), [["page_failed", "critical"]])
  const challenge = await scan({ ...day1, [`${ORIGIN}/`]: { status: 403, body: "", headers: { "cf-mitigated": "challenge" } } }, mem)
  assert.deepEqual(challenge.run.flags, ["blocked"])
})

test("a PDF in the sitemap is skipped, and one page that cannot be saved fails alone", async () => {
  const mem = memoryStore()
  const map: Record<string, Resp> = {
    ...day1,
    [`${ORIGIN}/sm.xml`]: { body: SITEMAP.replace(`${ORIGIN}/a</loc>`, `${ORIGIN}/a</loc></url><url><loc>${ORIGIN}/f.pdf</loc>`) },
    [`${ORIGIN}/f.pdf`]: { body: "", headers: { "content-type": "application/pdf" } },
  }
  await scan(map, mem)
  assert.equal(mem.pages.has(`${ORIGIN}/f.pdf`), false)
  const save = mem.store.savePage
  mem.store.savePage = async (s, run, url, p) => {
    if (url === `${ORIGIN}/a` && p.snapshot) throw new Error("null character not permitted")
    return save(s, run, url, p)
  }
  const r = await scan({ ...map, [`${ORIGIN}/a`]: { body: page("Page A2") } }, mem)
  assert.equal(r.done, true)
  assert.equal(r.run.pagesChecked, 2, "the PDF is not counted")
  assert.equal(r.run.pagesFailed, 1)
  assert.deepEqual(r.changes.map((c) => c.field), ["page_failed"])
})
