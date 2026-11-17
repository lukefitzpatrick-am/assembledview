/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { RosterInitialsGaps } from "../RosterInitialsGaps"

describe("Team tab initials clashes (B53)", () => {
  it("names each person, the alias and who shares it, and asks for an alias by hand", () => {
    const html = renderToStaticMarkup(
      <RosterInitialsGaps
        gaps={[
          { email: "sarah.mills@x.au", name: "Sarah Mills", initials: "SM", alias: "sm@x.au", sharedWith: ["Samantha Murphy"] },
          { email: "free@gmail.com", name: "Free Mail", initials: "FM", alias: null, sharedWith: [] },
        ]}
      />
    )
    expect(html).toContain("Initials aliases to add by hand")
    expect(html).toContain("Sarah Mills")
    expect(html).toContain("sm@x.au")
    expect(html).toContain("shares SM with Samantha Murphy")
    expect(html).toContain("Free Mail")
    expect(html).toContain("has no initials alias the app can make")
  })
  it("shows nothing when no one needs a manual alias", () => {
    expect(renderToStaticMarkup(<RosterInitialsGaps gaps={[]} />)).toBe("")
  })
})
