import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveEffectiveAuth } from "@/contexts/AuthContext"

const ADMIN_PROFILE = {
  sub: "auth0|admin-luke",
  name: "Luke Fitzpatrick",
  email: "luke.fitzpatrick@assembledmedia.com.au",
  "https://assembledview.com/roles": ["admin"],
  permissions: ["write:users"],
} as never

describe("AuthContext effective roles", () => {
  it("a client view wins over the admin's Auth0 profile: exactly client, minimal user", () => {
    const out = resolveEffectiveAuth({
      profileUser: ADMIN_PROFILE,
      serverRoles: ["client"],
      viewAs: { slug: "legal_super", clientName: "Legal Super", exp: 1 },
    })
    assert.deepEqual(out.userRoles, ["client"])
    assert.equal(out.userRole, "client")
    assert.deepEqual(out.user, {
      sub: "auth0|admin-luke",
      name: "Legal Super",
      email: "view-as+legal_super@assembledview.invalid",
    })
  })

  it("client view stays client even if the server roles were wrong", () => {
    const out = resolveEffectiveAuth({
      profileUser: ADMIN_PROFILE,
      serverRoles: ["admin"],
      viewAs: { slug: "paul-hartmann-pty-ltd", clientName: "Paul Hartmann", exp: 1 },
    })
    assert.deepEqual(out.userRoles, ["client"])
  })

  it("server roles win over profile claims when present", () => {
    const out = resolveEffectiveAuth({ profileUser: ADMIN_PROFILE, serverRoles: ["client"], viewAs: null })
    assert.deepEqual(out.userRoles, ["client"])
    assert.equal(out.user, ADMIN_PROFILE)
    const empty = resolveEffectiveAuth({ profileUser: ADMIN_PROFILE, serverRoles: [], viewAs: null })
    assert.deepEqual(empty.userRoles, [])
    assert.equal(empty.userRole, null)
  })

  it("falls back to the profile claims when the server read failed (null)", () => {
    const out = resolveEffectiveAuth({ profileUser: ADMIN_PROFILE, serverRoles: null, viewAs: null })
    assert.deepEqual(out.userRoles, ["admin"])
    assert.equal(out.userRole, "admin")
    const signedOut = resolveEffectiveAuth({ profileUser: undefined, serverRoles: null, viewAs: null })
    assert.deepEqual(signedOut.userRoles, [])
  })
})
