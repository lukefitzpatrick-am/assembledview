import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isDashboardSlugAllowed } from "../dashboardSlugAccess"

describe("isDashboardSlugAllowed", () => {
  it("denies a client with an empty slug set", () => {
    assert.equal(
      isDashboardSlugAllowed({ roles: ["client"], tenantSlugs: [], slug: "golf-australia" }),
      false,
    )
  })

  it("allows a member slug (second slug in the set)", () => {
    assert.equal(
      isDashboardSlugAllowed({
        roles: ["client"],
        tenantSlugs: ["golf-australia", "pga-australia"],
        slug: "pga-australia",
      }),
      true,
    )
  })

  it("denies a foreign slug", () => {
    assert.equal(
      isDashboardSlugAllowed({
        roles: ["client"],
        tenantSlugs: ["golf-australia", "pga-australia"],
        slug: "go-golfer",
      }),
      false,
    )
  })

  it("allows admin regardless of slug set", () => {
    assert.equal(
      isDashboardSlugAllowed({ roles: ["admin"], tenantSlugs: [], slug: "golf-australia" }),
      true,
    )
  })
})
