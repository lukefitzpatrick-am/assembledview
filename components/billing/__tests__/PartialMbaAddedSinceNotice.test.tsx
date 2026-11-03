/**
 * B21fix (decision B21 R4): lines added since to an all-selected channel of an old partial MBA.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PartialMbaAddedSinceNotice } from "@/components/billing/PartialMbaAddedSinceNotice"

describe("PartialMbaAddedSinceNotice", () => {
  it("renders nothing without a message", () => {
    expect(renderToStaticMarkup(<PartialMbaAddedSinceNotice message={null} />)).toBe("")
  })

  it("names the lines as a status note", () => {
    const html = renderToStaticMarkup(
      <PartialMbaAddedSinceNotice message="2 lines were added to a channel that was all in when this partial MBA was set. They stay out of the MBA: OOH PENFOLD015OH95, OOH PENFOLD015OH96. Tick them in the MBA scope if the client has approved them." />
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('data-partial-mba-added-since="1"')
    expect(html).toContain("Lines added since the partial MBA was set")
    expect(html).toContain("OOH PENFOLD015OH95, OOH PENFOLD015OH96")
  })
})
