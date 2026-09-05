/**
 * SM-7 — edit-page presence banner. Information, not a lock.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { PlanPresenceBanner } from "@/components/mediaplans/PlanPresenceBanner"

describe("PlanPresenceBanner", () => {
  it("renders muted copy and nothing when there is no line", () => {
    expect(renderToStaticMarkup(<PlanPresenceBanner line={null} />)).toBe("")
    const html = renderToStaticMarkup(
      <PlanPresenceBanner line="Sarah Chen also has this campaign open (2 min ago)" />
    )
    expect(html).toContain("Sarah Chen also has this campaign open (2 min ago)")
    expect(html).toContain("text-muted-foreground")
    expect(html).toContain('role="status"')
  })
})
