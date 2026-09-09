import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { User } from "@auth0/nextjs-auth0/types"

import {
  getUserClientIdentifier,
  getUserClientSlugs,
  getUserClientSlugsWithSource,
  inspectUserRolesAndPermissions,
} from "@/lib/rbac"

const SLUGS_CLAIM = "https://assembledview.com/client_slugs"
const SLUG_CLAIM = "https://assembledview.com/client_slug"

function asUser(shape: Record<string, unknown>): User {
  return shape as unknown as User
}

describe("getUserClientSlugs union + primary", () => {
  it("rotates client_slug to element zero when client_slugs also lists it", () => {
    const user = asUser({
      app_metadata: {
        client_slug: "golf-australia",
        client_slugs: ["golf-australia", "pga-australia"],
      },
    })
    assert.deepEqual(getUserClientSlugs(user), ["golf-australia", "pga-australia"])
    assert.equal(getUserClientIdentifier(user), "golf-australia")
    assert.equal(getUserClientIdentifier(user), getUserClientSlugs(user)[0])
  })

  it("puts client_slug first even when client_slugs lists another slug first", () => {
    const user = asUser({
      app_metadata: {
        client_slug: "golf-australia",
        client_slugs: ["pga-australia", "golf-australia"],
      },
    })
    assert.deepEqual(getUserClientSlugs(user), ["golf-australia", "pga-australia"])
    assert.equal(getUserClientIdentifier(user), "golf-australia")
  })

  it("user with only client_slug matches today's single-slug behaviour", () => {
    const user = asUser({
      app_metadata: { client_slug: "Golf-Australia" },
    })
    assert.deepEqual(getUserClientSlugs(user), ["golf-australia"])
    assert.equal(getUserClientIdentifier(user), "golf-australia")
  })

  it("user with client_slugs but no client_slug uses client_slugs[0] as primary", () => {
    const user = asUser({
      app_metadata: { client_slugs: ["pga-australia", "golf-australia"] },
    })
    assert.deepEqual(getUserClientSlugs(user), ["pga-australia", "golf-australia"])
    assert.equal(getUserClientIdentifier(user), "pga-australia")
  })

  it("rejects numeric-only slugs via normalizeClientSlug", () => {
    const user = asUser({
      app_metadata: {
        client_slug: "19",
        client_slugs: ["19", "golf-australia", "46"],
      },
    })
    assert.deepEqual(getUserClientSlugs(user), ["golf-australia"])
    assert.equal(getUserClientIdentifier(user), "golf-australia")
  })

  it("unions namespaced claims with app_metadata and user_metadata, lowercased and deduped", () => {
    const user = asUser({
      [SLUGS_CLAIM]: ["PGA-Australia"],
      [SLUG_CLAIM]: "golf-australia",
      app_metadata: {
        client_slugs: ["golf-australia", "go-golfer"],
        client_slug: "golf-australia",
      },
      user_metadata: { client_slug: "Golf-Australia" },
    })
    assert.deepEqual(getUserClientSlugs(user), [
      "golf-australia",
      "pga-australia",
      "go-golfer",
    ])
    assert.equal(getUserClientIdentifier(user), "golf-australia")
  })

  it("empty set yields [] and null identifier", () => {
    const user = asUser({ app_metadata: { role: "client" } })
    assert.deepEqual(getUserClientSlugs(user), [])
    assert.equal(getUserClientIdentifier(user), null)
  })

  it("getUserClientSlugsWithSource feeds inspectUserRolesAndPermissions", () => {
    const user = asUser({
      app_metadata: {
        client_slug: "golf-australia",
        client_slugs: ["golf-australia", "pga-australia"],
      },
    })
    const sourced = getUserClientSlugsWithSource(user)
    assert.deepEqual(sourced.slugs, ["golf-australia", "pga-australia"])
    assert.equal(sourced.source, "app_metadata")
    const inspection = inspectUserRolesAndPermissions(user)
    assert.equal(inspection.clientSlug, "golf-australia")
    assert.deepEqual(inspection.clientSlugs, ["golf-australia", "pga-australia"])
    assert.equal(inspection.clientSlugSource, "app_metadata")
  })
})
