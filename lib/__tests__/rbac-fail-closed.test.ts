import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { User } from "@auth0/nextjs-auth0/types"

import {
  canAccessPage,
  getHighestRole,
  getUserRoles,
  hasRole,
  userHasAdminAccess,
} from "@/lib/rbac"

const ROLE_CLAIM = "https://assembledview.com/roles"

function sessionUser(roles: string[]): User {
  return { [ROLE_CLAIM]: roles } as unknown as User
}

describe("rbac fail-closed unknown / removed roles", () => {
  it('roles ["manager"] are denied admin access and do not throw', () => {
    const user = sessionUser(["manager"])
    assert.doesNotThrow(() => getUserRoles(user))
    assert.deepEqual(getUserRoles(user), [])
    assert.equal(userHasAdminAccess(user), false)
    assert.equal(hasRole(user, "admin"), false)
    assert.equal(canAccessPage(user, "management"), false)
    assert.equal(canAccessPage(user, "finance"), false)
    assert.equal(canAccessPage(user, "mediaplans"), false)
    assert.equal(getHighestRole(user), null)
  })

  it('roles ["nonsense"] are denied admin access and do not throw', () => {
    const user = sessionUser(["nonsense"])
    assert.doesNotThrow(() => getUserRoles(user))
    assert.deepEqual(getUserRoles(user), [])
    assert.equal(userHasAdminAccess(user), false)
    assert.equal(hasRole(user, "admin"), false)
    assert.equal(canAccessPage(user, "management"), false)
    assert.equal(getHighestRole(user), null)
  })

  it("admin and client sessions keep their roles", () => {
    assert.deepEqual(getUserRoles(sessionUser(["admin"])), ["admin"])
    assert.equal(userHasAdminAccess(sessionUser(["admin"])), true)
    assert.deepEqual(getUserRoles(sessionUser(["client"])), ["client"])
    assert.equal(userHasAdminAccess(sessionUser(["client"])), false)
  })
})
