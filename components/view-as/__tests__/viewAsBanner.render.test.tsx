import assert from "node:assert/strict"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

// The repo compiles JSX with the classic runtime under tsx; shared UI files do not import React.
;(globalThis as { React?: typeof React }).React = React

const { ViewAsBanner } = await import("@/components/view-as/ViewAsBanner")
const { viewAsBannerText } = await import("@/components/view-as/viewAsClient")

describe("View as client banner", () => {
  it("names the client, says read-only, gives the end time and an Exit button", () => {
    const exp = Math.floor(Date.UTC(2026, 9, 29, 4, 30) / 1000)
    const html = renderToStaticMarkup(<ViewAsBanner viewAs={{ slug: "legal_super", clientName: "Legal Super", exp }} />)
    assert.match(html, /Viewing as Legal Super \(client view, read-only\)\. Ends /)
    assert.match(html, />Exit</)
    assert.match(html, /role="status"/)
    assert.doesNotMatch(html, /aria-label="Dismiss"|Close/)
  })

  it("end time is the viewer's local time, en-AU", () => {
    const exp = Math.floor(Date.UTC(2026, 9, 29, 4, 30) / 1000)
    const expected = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(new Date(exp * 1000))
    assert.equal(viewAsBannerText("Paul Hartmann", exp), `Viewing as Paul Hartmann (client view, read-only). Ends ${expected}.`)
  })
})
