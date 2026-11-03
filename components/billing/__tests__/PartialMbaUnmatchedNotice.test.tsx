/**
 * MB-33 (B21): saved partial MBA lines with no match on the plan.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PartialMbaUnmatchedNotice } from "@/components/billing/PartialMbaUnmatchedNotice"

describe("PartialMbaUnmatchedNotice", () => {
  it("renders nothing without a message", () => {
    expect(renderToStaticMarkup(<PartialMbaUnmatchedNotice message={null} />)).toBe("")
  })

  it("shows the message as an alert", () => {
    const html = renderToStaticMarkup(
      <PartialMbaUnmatchedNotice message="A line saved in this partial MBA has no match on the plan, so it stays out of the MBA: Social Media PGAAUS0051. Check the scope before you publish." />
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain("Saved lines not matched")
    expect(html).toContain("Social Media PGAAUS0051")
  })
})
