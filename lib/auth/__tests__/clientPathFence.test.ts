import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveClientPageFence } from "../clientPathFence"

const GOLF_PGA = ["golf-australia", "pga-australia"]

describe("resolveClientPageFence", () => {
  it("empty set → /unauthorized (client-missing-slug)", () => {
    assert.deepEqual(resolveClientPageFence("/dashboard/golf-australia", []), {
      redirectTarget: "/unauthorized",
      reason: "client-missing-slug",
    })
  })

  it("member slug is allowed (second slug in the set)", () => {
    assert.deepEqual(resolveClientPageFence("/dashboard/pga-australia", GOLF_PGA), {
      redirectTarget: null,
      reason: null,
    })
    assert.deepEqual(
      resolveClientPageFence("/dashboard/pga-australia/pgaaus003", GOLF_PGA),
      { redirectTarget: null, reason: null },
    )
  })

  it("unknown slug redirects to primary with client-cross-tenant-block", () => {
    assert.deepEqual(resolveClientPageFence("/dashboard/go-golfer", GOLF_PGA), {
      redirectTarget: "/dashboard/golf-australia",
      reason: "client-cross-tenant-block",
    })
  })

  it("single-slug user is unchanged vs today", () => {
    const slugs = ["golf-australia"]
    assert.deepEqual(resolveClientPageFence("/dashboard/golf-australia", slugs), {
      redirectTarget: null,
      reason: null,
    })
    assert.deepEqual(resolveClientPageFence("/dashboard/pga-australia", slugs), {
      redirectTarget: "/dashboard/golf-australia",
      reason: "client-cross-tenant-block",
    })
    assert.deepEqual(resolveClientPageFence("/", slugs), {
      redirectTarget: "/dashboard/golf-australia",
      reason: "client-root-redirect",
    })
    assert.deepEqual(resolveClientPageFence("/dashboard", slugs), {
      redirectTarget: "/dashboard/golf-australia",
      reason: "client-dashboard-redirect",
    })
  })

  it("client_slugs-only primary is element zero", () => {
    const slugs = ["pga-australia", "golf-australia"]
    assert.deepEqual(resolveClientPageFence("/dashboard/go-golfer", slugs), {
      redirectTarget: "/dashboard/pga-australia",
      reason: "client-cross-tenant-block",
    })
  })
})
