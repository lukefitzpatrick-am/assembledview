/**
 * Layer 2 roster eligibility — Management API users have app_metadata only.
 * Namespaced RBAC claims are token-only and must not be required here.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { rosterEligibilityForManagementUser } from "../rosterEligibility.js"

describe("rosterEligibilityForManagementUser", () => {
  it("skips hinatanveer-style gmail even when app_metadata says admin", () => {
    const r = rosterEligibilityForManagementUser({
      email: "hinatanveer992.0@gmail.com",
      app_metadata: { role: "admin" },
    })
    assert.equal(r.eligible, false)
    if (!r.eligible) assert.equal(r.reason, "free-mail")
  })

  it("treats assembledmedia staff with empty app_metadata as admin via domain rule", () => {
    const r = rosterEligibilityForManagementUser({
      email: "luke.fitzpatrick@assembledmedia.com.au",
    })
    assert.equal(r.eligible, true)
    if (r.eligible) assert.equal(r.via, "domain_rule")
  })

  it("skips a client-role assembledmedia address", () => {
    const r = rosterEligibilityForManagementUser({
      email: "digital@assembledmedia.com.au",
      app_metadata: { role: "client" },
    })
    assert.equal(r.eligible, false)
    if (!r.eligible) assert.equal(r.reason, "client role")
  })

  it("does not treat a lookalike domain as staff (exact match only)", () => {
    const r = rosterEligibilityForManagementUser({
      email: "luke@notassembledmedia.com.au",
    })
    assert.equal(r.eligible, false)
  })

  it("does not treat a subdomain as staff", () => {
    const r = rosterEligibilityForManagementUser({
      email: "luke@mail.assembledmedia.com.au",
    })
    assert.equal(r.eligible, false)
  })

  it("accepts app_metadata admin on a non-free-mail domain via (a)", () => {
    const r = rosterEligibilityForManagementUser({
      email: "contractor@nine.com.au",
      app_metadata: { role: "admin" },
    })
    assert.equal(r.eligible, true)
    if (r.eligible) assert.equal(r.via, "app_metadata")
  })
})
