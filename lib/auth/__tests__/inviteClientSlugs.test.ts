import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildClientRoleAppMetadata,
  listedUserClientSlugs,
  resolveInviteClientSlugs,
} from "../inviteClientSlugs.js"

describe("resolveInviteClientSlugs", () => {
  it("maps legacy clientSlug to a one-element array", () => {
    assert.deepEqual(resolveInviteClientSlugs({ clientSlug: "Golf-Australia" }), {
      ok: true,
      slugs: ["golf-australia"],
    })
  })

  it("uses clientSlugs when present and does not merge clientSlug", () => {
    assert.deepEqual(
      resolveInviteClientSlugs({
        clientSlugs: ["golf-australia", "pga-australia"],
        clientSlug: "bic",
      }),
      { ok: true, slugs: ["golf-australia", "pga-australia"] },
    )
  })

  it("dedupes while preserving first-pick order", () => {
    assert.deepEqual(
      resolveInviteClientSlugs({
        clientSlugs: ["golf-australia", "PGA-Australia", "golf-australia"],
      }),
      { ok: true, slugs: ["golf-australia", "pga-australia"] },
    )
  })

  it("rejects numeric-only slugs", () => {
    assert.deepEqual(resolveInviteClientSlugs({ clientSlug: "19" }), {
      ok: false,
      reason: "numeric",
    })
    assert.deepEqual(resolveInviteClientSlugs({ clientSlugs: ["golf-australia", "46"] }), {
      ok: false,
      reason: "numeric",
    })
  })

  it("returns missing when neither field has a slug", () => {
    assert.deepEqual(resolveInviteClientSlugs({}), { ok: false, reason: "missing" })
    assert.deepEqual(resolveInviteClientSlugs({ clientSlugs: [] }), {
      ok: false,
      reason: "missing",
    })
  })
})

describe("listedUserClientSlugs", () => {
  it("puts client_slug first then the rest of client_slugs", () => {
    assert.deepEqual(
      listedUserClientSlugs({
        client_slug: "golf-australia",
        client_slugs: ["pga-australia", "golf-australia"],
      }),
      ["golf-australia", "pga-australia"],
    )
  })

  it("falls back to client_slug when the array is absent", () => {
    assert.deepEqual(listedUserClientSlugs({ client_slug: "golf-australia" }), [
      "golf-australia",
    ])
  })
})

describe("buildClientRoleAppMetadata", () => {
  it("writes primary first and empty mba_numbers when unrestricted", () => {
    assert.deepEqual(
      buildClientRoleAppMetadata({
        slugs: ["golf-australia", "pga-australia"],
      }),
      {
        role: "client",
        client_slug: "golf-australia",
        client_slugs: ["golf-australia", "pga-australia"],
        mba_numbers: [],
        primary_mba_number: null,
      },
    )
  })

  it("lowercases restricted mba_numbers", () => {
    const meta = buildClientRoleAppMetadata({
      slugs: ["golf-australia"],
      mbaNumbers: ["GA-001"],
      primaryMbaNumber: "GA-001",
    })
    assert.deepEqual(meta.mba_numbers, ["ga-001"])
    assert.equal(meta.primary_mba_number, "ga-001")
  })
})
