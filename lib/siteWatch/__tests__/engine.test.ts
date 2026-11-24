/** Roz (Site Watch) phase 1: extraction, diff, severity, sitemap, sites and the email (pure). */
import assert from "node:assert/strict"
import test from "node:test"

import { comparePages } from "../compare"
import { criticalEmail } from "../email"
import { extractPage } from "../extract"
import { lineDiff } from "../lineDiff"
import { findTrackingIds } from "../patterns"
import { severityFor } from "../severity"
import { parseSitemapXml, readSitemap, robotsSitemaps } from "../sitemap"
import { sitesFromClients, urlPrefixFor } from "../sites"
import { isPublicUrl, type Fetched } from "../fetchPage"

const PAGE = `<!doctype html><html><head>
<title> Jayco caravans </title>
<meta name="description" content="Great escapes">
<meta name="robots" content="index,follow">
<meta property="og:title" content="OG T"><meta property="og:image" content="/og.png">
<link rel="canonical" href="https://www.jayco.com.au/">
<link rel="alternate" hreflang="en-au" href="https://www.jayco.com.au/">
<link rel="stylesheet" href="/css/site.css?v=123">
<style>.a{color:red}</style>
<script src="https://www.googletagmanager.com/gtm.js?id=GTM-TJQF7V9"></script>
<script src="/local.js"></script>
<script type="application/ld+json">{"@type":"Organization","x":{"@type":"PostalAddress"}}</script>
<script>fbq('init', '1234567890'); gtag('config','G-ABCDEFGH12'); gtag('config','AW-123456789');</script>
</head><body>
<header id="top" class="site-header css-1a2b3c4d hd123"><nav class="main">Menu</nav></header>
<main><section class="hero"><h1>Your   great escape</h1><p>Line one</p><img src="/img/a.jpg?w=1"><img src="data:image/png;base64,xx"></section>
<div class="cookie">Cookie banner 12:01</div></main>
<footer><p>Footer text</p></footer>
<noscript>enable js</noscript></body></html>`

function extract(html = PAGE, ignore: string[] = []) {
  return extractPage({ html, status: 200, finalUrl: "https://www.jayco.com.au/", xRobotsTag: "", ignoreSelectors: ignore })
}

test("extracts the technical fields, tracking IDs and visual signals", () => {
  const { fields, text, layout, stylesheetUrls } = extract()
  assert.equal(fields.title, "Jayco caravans")
  assert.equal(fields.meta_description, "Great escapes")
  assert.equal(fields.robots_meta, "index,follow")
  assert.equal(fields.canonical, "https://www.jayco.com.au/")
  assert.deepEqual(fields.h1, ["Your great escape"])
  assert.deepEqual(fields.hreflang, ["en-au=https://www.jayco.com.au/"])
  assert.deepEqual(fields.schema_types, ["Organization", "PostalAddress"])
  assert.deepEqual(fields.script_hosts, ["www.googletagmanager.com"])
  assert.deepEqual(fields.tracking, {
    ga4: ["G-ABCDEFGH12"],
    google_ads: ["AW-123456789"],
    gtm: ["GTM-TJQF7V9"],
    meta_pixel: ["1234567890"],
  })
  assert.deepEqual(stylesheetUrls, ["https://www.jayco.com.au/css/site.css?v=123"])
  assert.deepEqual(fields.images, ["https://www.jayco.com.au/img/a.jpg"])
  assert.deepEqual(layout, ["header#top.site-header", "  nav.main", "main", "  section.hero", "    h1", "footer"])
  assert.ok(text.includes("Line one") && text.includes("Cookie banner 12:01"))
  assert.ok(!text.includes("enable js") && !text.includes("fbq"))
})

test("ignore selectors drop copy, images and outline; a bad selector is skipped", () => {
  const { text } = extract(PAGE, [".cookie", "::bad(("])
  assert.ok(!text.includes("Cookie banner"))
})

test("tracking patterns record the capture group when there is one", () => {
  assert.deepEqual(findTrackingIds("ttq.load('C4ABCDEFGHIJ1234') _linkedin_partner_id = \"55555\"; hjid:123456"), {
    hotjar: ["123456"],
    linkedin_partner: ["55555"],
    tiktok_pixel: ["C4ABCDEFGHIJ1234"],
  })
})

test("line diff trims common lines and caps what it shows", () => {
  assert.deepEqual(lineDiff(["a", "b", "c"], ["a", "x", "c"]), { lines: ["- b", "+ x"], total: 2 })
  assert.deepEqual(lineDiff(["a"], ["a"]), { lines: [], total: 0 })
  const big = lineDiff([], Array.from({ length: 60 }, (_, i) => `l${i}`))
  assert.equal(big.total, 60)
  assert.equal(big.lines.length, 40)
})

const opts = { watchText: true, watchVisual: true }
const url = "https://www.jayco.com.au/"

function changed(edit: (html: string) => string, key = true) {
  const old = extract()
  const next = extract(edit(PAGE))
  return comparePages(url, old, next, opts).map((c) => ({ field: c.field, severity: severityFor(c, { isKeyPage: key }) }))
}

test("brief 5.4: the critical, high, medium and low rules", () => {
  assert.deepEqual(changed((h) => h.replace("index,follow", "noindex,follow")), [{ field: "robots_meta", severity: "critical" }])
  assert.deepEqual(
    changed((h) => h.replace("GTM-TJQF7V9", "GTM-NEW1234")).filter((c) => c.field === "tracking:gtm"),
    [{ field: "tracking:gtm", severity: "critical" }],
  )
  assert.deepEqual(changed((h) => h.replace("G-ABCDEFGH12", "G-ZZZZZZZZ99")), [{ field: "tracking:ga4", severity: "high" }])
  assert.deepEqual(changed((h) => h.replace("fbq('init', '1234567890');", "")), [{ field: "tracking:meta_pixel", severity: "high" }])
  assert.deepEqual(
    changed((h) => h.replace('href="https://www.jayco.com.au/">\n<link rel="alternate"', 'href="https://other.example/">\n<link rel="alternate"')),
    [{ field: "canonical", severity: "critical" }],
  )
  const title = changed((h) => h.replace(" Jayco caravans ", "Jayco"))
  assert.deepEqual(title.find((c) => c.field === "title"), { field: "title", severity: "high" })
  assert.deepEqual(
    changed((h) => h.replace(" Jayco caravans ", "Jayco"), false).find((c) => c.field === "title"),
    { field: "title", severity: "medium" },
  )
  assert.deepEqual(changed((h) => h.replace("Line one", "Line two")), [{ field: "page_text", severity: "medium" }])
  assert.deepEqual(changed((h) => h.replace("Line one", "Line two"), false), [{ field: "page_text", severity: "low" }])
  assert.deepEqual(changed((h) => h.replace("color:red", "color:blue")), [{ field: "inline_css", severity: "low" }])
  assert.deepEqual(changed((h) => h.replace('class="hero"', 'class="hero2"')), [{ field: "layout", severity: "low" }])
  assert.equal(severityFor({ url, category: "technical", field: "status", before: 200, after: 404 }, { isKeyPage: true }), "critical")
  assert.equal(severityFor({ url, category: "technical", field: "page_failed", after: "timed out" }, { isKeyPage: false }), "medium")
  assert.equal(
    severityFor({ url: null, category: "technical", field: "robots_txt", diff: { lines: ["+ Disallow: /"], total: 1 } }, { isKeyPage: true }),
    "critical",
  )
  assert.equal(
    severityFor({ url: null, category: "technical", field: "robots_txt", diff: { lines: ["+ Disallow: /cart"], total: 1 } }, { isKeyPage: true }),
    "medium",
  )
})

test("visual and copy switches turn those changes off", () => {
  const old = extract()
  const next = extract(PAGE.replace("color:red", "color:blue").replace("Line one", "Line two"))
  assert.deepEqual(comparePages(url, old, next, { watchText: false, watchVisual: false }), [])
})

test("robots Sitemap lines and sitemap XML, following an index", async () => {
  assert.deepEqual(robotsSitemaps("User-agent: *\nSitemap: https://a.test/s.xml\nsitemap:https://a.test/b.xml"), [
    "https://a.test/s.xml",
    "https://a.test/b.xml",
  ])
  assert.deepEqual(parseSitemapXml("<urlset><url><loc> https://a.test/1 </loc></url></urlset>"), { index: false, locs: ["https://a.test/1"] })
  const files: Record<string, string> = {
    "https://a.test/index.xml": "<sitemapindex><sitemap><loc>https://a.test/p.xml</loc></sitemap><sitemap><loc>https://a.test/missing.xml</loc></sitemap></sitemapindex>",
    "https://a.test/p.xml": "<urlset><url><loc>https://a.test/1</loc></url><url><loc>https://a.test/2</loc></url></urlset>",
  }
  const fetchUrl = async (u: string): Promise<Fetched> =>
    files[u] ? { ok: true, status: 200, finalUrl: u, headers: new Headers(), body: files[u]! } : { ok: true, status: 404, finalUrl: u, headers: new Headers(), body: "" }
  const limits = { deadline: Date.now() + 600_000, now: Date.now }
  assert.deepEqual(await readSitemap("https://a.test/index.xml", fetchUrl, limits), ["https://a.test/1", "https://a.test/2"])
  assert.equal(await readSitemap("https://a.test/none.xml", fetchUrl, limits), null)
  // Out of time is "no answer", never a partial list.
  assert.equal(await readSitemap("https://a.test/index.xml", fetchUrl, { deadline: Date.now() + 1_000, now: Date.now }), null)
  // A nested file on another host is never fetched.
  const seen: string[] = []
  files["https://a.test/x.xml"] = "<sitemapindex><sitemap><loc>https://evil.test/s.xml</loc></sitemap><sitemap><loc>https://www.a.test/p.xml</loc></sitemap></sitemapindex>"
  files["https://www.a.test/p.xml"] = files["https://a.test/p.xml"]!
  await readSitemap("https://a.test/x.xml", async (u) => (seen.push(u), fetchUrl(u)), limits)
  assert.deepEqual(seen, ["https://a.test/x.xml", "https://www.a.test/p.xml"])
})

test("gate D4: one site per website, owned by the lowest client id; prefix from the path", () => {
  assert.equal(urlPrefixFor("/"), null)
  assert.equal(urlPrefixFor("/en-au/home"), "/en-au/")
  assert.equal(urlPrefixFor("/au/en/home.html"), "/au/en/")
  assert.equal(urlPrefixFor("/en-au"), "/en-au/")
  assert.equal(urlPrefixFor("/brands/olive-grove/"), "/brands/olive-grove/")
  assert.equal(urlPrefixFor("/index.html"), null)
  const sites = sitesFromClients([
    { id: 9, name: "PGA Australia", website: "https://golf.com.au/" },
    { id: 4, name: "Golf Australia", website: "https://GOLF.com.au/#x" },
    { id: 5, name: "No site", website: "" },
    { id: 6, name: "Bad", website: "ftp://x.test" },
    { id: 7, name: "Challenger", website: "https://www.challenger.com.au" },
  ])
  assert.deepEqual(sites, [
    { clientId: 4, label: "Golf Australia", baseUrl: "https://golf.com.au/", urlPrefix: null },
    { clientId: 7, label: "Challenger", baseUrl: "https://www.challenger.com.au/", urlPrefix: null },
  ])
})

test("gate D9: the Critical email escapes scanned values and folds grouped changes to one line", () => {
  const { subject, html } = criticalEmail({
    label: "Jayco",
    clientName: "Jayco Australia",
    baseUrl: "https://www.jayco.com.au/",
    changes: [
      { url: "https://www.jayco.com.au/<x>", field: "robots_meta", before: "index", after: "noindex<script>", groupKey: null },
      { url: "https://www.jayco.com.au/a", field: "tracking:gtm", before: ["GTM-1"], after: [], groupKey: "g1" },
      { url: "https://www.jayco.com.au/b", field: "tracking:gtm", before: ["GTM-1"], after: [], groupKey: "g1" },
    ],
  })
  assert.equal(subject, "Roz found 2 critical changes lurking on Jayco")
  assert.ok(!html.includes("<script>") && html.includes("noindex&lt;script&gt;") && html.includes("&lt;x&gt;"))
  assert.match(html, /and 1 more pages/)
  assert.match(html, /Roz here/)
})

test("a field missing from an older snapshot compares as unchanged", () => {
  const old = extract()
  delete (old.fields as Partial<typeof old.fields>).og_image
  delete (old.fields as Partial<typeof old.fields>).schema_types
  assert.deepEqual(comparePages(url, old, extract(), opts), [])
})

test("review fixes: robots meta in any case plus googlebot, JSON-LD type arrays, real class names kept", () => {
  const html = `<html><head><meta name="ROBOTS" content="index"><meta name="googlebot" content="noindex">
<script type="application/ld+json">{"@type":["Product","Thing"]}</script></head>
<body><main class="facade decade"><p>text</p></main></body></html>`
  const p = extractPage({ html, status: 200, finalUrl: "https://a.test/", xRobotsTag: "", ignoreSelectors: [] })
  assert.equal(p.fields.robots_meta, "index, noindex")
  assert.deepEqual(p.fields.schema_types, ["Product", "Thing"])
  assert.ok(p.layout.some((l) => l.includes("facade") && l.includes("decade")), p.layout.join("\n"))
  assert.equal(
    severityFor({ url: "https://a.test/", category: "technical", field: "robots_meta", before: "index", after: p.fields.robots_meta }, { isKeyPage: false }),
    "critical",
  )
})

test("only public addresses are fetched", () => {
  for (const u of ["https://www.jayco.com.au/", "http://8.8.8.8/"]) assert.equal(isPublicUrl(u), true, u)
  for (const u of ["http://localhost/", "http://127.0.0.1/", "http://10.1.2.3/", "http://169.254.169.254/latest", "http://192.168.0.1/", "http://172.20.0.1/", "http://[::1]/", "http://intranet/", "file:///etc/passwd"]) {
    assert.equal(isPublicUrl(u), false, u)
  }
})
