import assert from "node:assert/strict"
import test from "node:test"

import {
  currentUserFromSession,
  hasResolvableAuditUserId,
  resolveAuditUserId,
} from "../teamMemberAuditId.js"

test("claimed 0 plus a team_members id stamps the team id", () => {
  assert.equal(resolveAuditUserId({ claimedId: 0, teamMemberId: 42 }), 42)
  assert.equal(resolveAuditUserId({ claimedId: null, teamMemberId: 42 }), 42)
})

test("missing team_members lookup falls through to 0, the documented default", () => {
  assert.equal(resolveAuditUserId({ claimedId: 0, teamMemberId: null }), 0)
  assert.equal(resolveAuditUserId({ claimedId: null, teamMemberId: null }), 0)
  assert.equal(hasResolvableAuditUserId(0), false)
  assert.equal(hasResolvableAuditUserId(42), true)
})

test("team_members id wins over a Xano users_id claim", () => {
  assert.equal(resolveAuditUserId({ claimedId: 99, teamMemberId: 42 }), 42)
  assert.equal(resolveAuditUserId({ claimedId: 99, teamMemberId: null }), 99)
})

test("getCurrentUser uses the injectable team_members lookup, not the 0 default", async () => {
  const user = await currentUserFromSession(
    {
      sub: "auth0|luke",
      email: "luke@assembledmedia.com.au",
      name: "Luke",
    },
    async () => 42
  )
  assert.equal(user.id, 42)
  assert.equal(user.email, "luke@assembledmedia.com.au")

  const missing = await currentUserFromSession(
    { sub: "auth0|unknown", email: "nobody@example.com", name: "N" },
    async () => null
  )
  assert.equal(missing.id, 0)
  assert.equal(hasResolvableAuditUserId(missing.id), false)
})
