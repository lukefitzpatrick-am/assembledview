/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import {
  noteAuthenticatedWriteOk,
  noteWriteUnauthorized,
  resetWriteSessionExpiryForTests,
} from "@/lib/auth/writeSessionExpiry"
import { SessionExpiredBanner } from "@/components/auth/SessionExpiredBanner"

afterEach(() => {
  resetWriteSessionExpiryForTests()
})

describe("SessionExpiredBanner", () => {
  it("is hidden until a write 401, then shows the blocking copy and a sign-in link", () => {
    expect(renderToStaticMarkup(<SessionExpiredBanner pathname="/mediaplans/create" />)).toBe(
      ""
    )
    noteWriteUnauthorized()
    const html = renderToStaticMarkup(
      <SessionExpiredBanner pathname="/mediaplans/create" />
    )
    expect(html).toContain("Session expired")
    expect(html).toContain("not written")
    expect(html).toContain("/auth/login?returnTo=")
    expect(html).toContain(encodeURIComponent("/mediaplans/create"))
    expect(html.includes("unauthorised") || html.includes("401")).toBe(false)
  })

  it("clears after a successful authenticated write", () => {
    noteWriteUnauthorized()
    noteAuthenticatedWriteOk()
    expect(renderToStaticMarkup(<SessionExpiredBanner pathname="/mediaplans/create" />)).toBe(
      ""
    )
  })
})
