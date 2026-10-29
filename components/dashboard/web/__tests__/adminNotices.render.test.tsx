import assert from "node:assert/strict"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { WebReportAdminStatus } from "@/lib/webReport/admin/status"

// The repo compiles JSX with the classic runtime under tsx; shared UI files do not import React.
;(globalThis as { React?: typeof React }).React = React

const {
  ACCOUNTS_STRIP,
  DRAFT_STRIP,
  FLAG_OFF_NOTICE,
  WebReportAdminStrip,
  WebReportSetupState,
  WebSearchFlagOffNotice,
} = await import("@/components/dashboard/web/WebReportAdminNotices")
const { WebSearchHubLink, WebSearchListBadge } = await import("@/components/dashboard/WebSearchHubLink")
const { resolveWebReportAdminStatus } = await import("@/lib/webReport/admin/status")

const notSetUp: WebReportAdminStatus = resolveWebReportAdminStatus({ report: null, ga4Count: 1, gscCount: 0, flagOn: true })
const draft = resolveWebReportAdminStatus({
  report: { status: "draft", currentVersion: 0 },
  ga4Count: 1,
  gscCount: 1,
  flagOn: true,
})
const published = resolveWebReportAdminStatus({
  report: { status: "published", currentVersion: 4 },
  ga4Count: 1,
  gscCount: 1,
  flagOn: true,
})

function decode(html: string): string {
  return html.replace(/&amp;/g, "&").replace(/&#x27;/g, "'")
}

describe("Web & search admin notices", () => {
  it("setup state: title, checklist and both buttons", () => {
    const html = decode(
      renderToStaticMarkup(
        <WebReportSetupState slug="golf-australia" clientName="Golf Australia" status={notSetUp} flagOff={false} />,
      ),
    )
    assert.match(html, /No Web & search report for Golf Australia yet\./)
    assert.match(html, /GA4 property connected<\/span><span[^>]*>Yes/)
    assert.match(html, /Search Console site connected<\/span><span[^>]*>No/)
    assert.match(html, /Report published<\/span><span[^>]*>No/)
    assert.match(html, /href="\/client\/golf-australia#platform-accounts"[^>]*>Connect accounts/)
    assert.match(html, /href="\/admin\/web-reports\/golf-australia"[^>]*>Build report/)
    assert.doesNotMatch(html, /FEATURE_WEB_SEARCH/)
  })

  it("setup state shows the switch notice when the flag is off", () => {
    const html = decode(
      renderToStaticMarkup(
        <WebReportSetupState slug="golf-australia" clientName="Golf Australia" status={notSetUp} flagOff />,
      ),
    )
    assert.ok(html.includes(FLAG_OFF_NOTICE))
  })

  it("flag-off notice names the switch", () => {
    const html = decode(renderToStaticMarkup(<WebSearchFlagOffNotice />))
    assert.match(html, /switched off for everyone \(FEATURE_WEB_SEARCH\)/)
  })

  it("draft strip says the client cannot see it", () => {
    const html = decode(renderToStaticMarkup(<WebReportAdminStrip slug="legal_super" strip="draft" status={draft} />))
    assert.ok(html.includes(DRAFT_STRIP))
    assert.match(html, />Draft</)
    assert.match(html, /href="\/admin\/web-reports\/legal_super"/)
  })

  it("accounts strip links to Connect accounts", () => {
    const html = decode(
      renderToStaticMarkup(<WebReportAdminStrip slug="legal_super" strip="accounts_missing" status={null} />),
    )
    assert.ok(html.includes(ACCOUNTS_STRIP))
    assert.match(html, /href="\/client\/legal_super#platform-accounts"/)
  })
})

describe("Web & search hub link and list badge", () => {
  it("hub link opens the viewer and shows the chip", () => {
    const html = decode(renderToStaticMarkup(<WebSearchHubLink slug="legal_super" status={published} />))
    assert.match(html, /href="\/dashboard\/legal_super\/web"/)
    assert.match(html, />Published</)
  })

  it("hub link hides the chip when the status is unknown", () => {
    const html = decode(renderToStaticMarkup(<WebSearchHubLink slug="legal_super" status={null} />))
    assert.match(html, /Web & search/)
    assert.doesNotMatch(html, /Published|Draft|Not set up/)
  })

  it("list badge renders a link, or nothing when unknown", () => {
    const html = decode(renderToStaticMarkup(<WebSearchListBadge slug="paul-hartmann-pty-ltd" status={published} />))
    assert.match(html, /href="\/dashboard\/paul-hartmann-pty-ltd\/web"/)
    assert.match(html, /Web & search:/)
    assert.equal(renderToStaticMarkup(<WebSearchListBadge slug="x" status={null} />), "")
  })
})
