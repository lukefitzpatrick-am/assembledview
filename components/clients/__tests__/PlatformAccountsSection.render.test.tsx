/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { PlatformAccountsSection } from "../PlatformAccountsSection"

describe("PlatformAccountsSection web platforms", () => {
  it("hides Google Analytics 4 and Search Console when the flag is unset", () => {
    const previous = process.env.NEXT_PUBLIC_PLATFORM_ACCOUNTS_WEB
    delete process.env.NEXT_PUBLIC_PLATFORM_ACCOUNTS_WEB
    try {
      const html = renderToStaticMarkup(<PlatformAccountsSection clientId={1} />)
      expect(html).toContain("Platform accounts")
      expect(html).not.toContain("Google Analytics 4")
      expect(html).not.toContain("Search Console")
      const choices = html.match(/data-platform-choices="([^"]*)"/)?.[1] ?? ""
      expect(choices.split(" ")).not.toContain("ga4")
      expect(choices.split(" ")).not.toContain("gsc")
      expect(choices).toContain("meta_ads")
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_PLATFORM_ACCOUNTS_WEB
      else process.env.NEXT_PUBLIC_PLATFORM_ACCOUNTS_WEB = previous
    }
  })
})
