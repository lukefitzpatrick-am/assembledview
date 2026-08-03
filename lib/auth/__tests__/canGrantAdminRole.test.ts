import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  assertCanGrantAdminRole,
  canGrantAdminRole,
  parseSuperadminEmailAllowlist,
} from "../canGrantAdminRole"

const ENV_KEY = "SUPERADMIN_EMAIL_ALLOWLIST"

describe("parseSuperadminEmailAllowlist", () => {
  it("splits comma-separated emails and lowercases", () => {
    assert.deepEqual(parseSuperadminEmailAllowlist("Luke@Example.com, other@x.com "), [
      "luke@example.com",
      "other@x.com",
    ])
  })

  it("treats empty/whitespace as empty list", () => {
    assert.deepEqual(parseSuperadminEmailAllowlist(""), [])
    assert.deepEqual(parseSuperadminEmailAllowlist("  ,  "), [])
    assert.deepEqual(parseSuperadminEmailAllowlist(undefined), [])
  })
})

describe("canGrantAdminRole — fail closed", () => {
  const prev = process.env[ENV_KEY]

  afterEach(() => {
    if (prev === undefined) delete process.env[ENV_KEY]
    else process.env[ENV_KEY] = prev
  })

  it("denies everyone when allowlist unset", () => {
    delete process.env[ENV_KEY]
    assert.equal(canGrantAdminRole("luke@example.com"), false)
  })

  it("denies everyone when allowlist empty", () => {
    process.env[ENV_KEY] = "  , "
    assert.equal(canGrantAdminRole("luke@example.com"), false)
  })

  it("allows case-insensitive match", () => {
    process.env[ENV_KEY] = "Luke@Example.com"
    assert.equal(canGrantAdminRole("luke@example.com"), true)
    assert.equal(canGrantAdminRole("LUKE@EXAMPLE.COM"), true)
    assert.equal(canGrantAdminRole("other@example.com"), false)
  })

  it("denies missing session email even when allowlist set", () => {
    process.env[ENV_KEY] = "luke@example.com"
    assert.equal(canGrantAdminRole(null), false)
    assert.equal(canGrantAdminRole(""), false)
  })
})

describe("assertCanGrantAdminRole", () => {
  const prev = process.env[ENV_KEY]

  afterEach(() => {
    if (prev === undefined) delete process.env[ENV_KEY]
    else process.env[ENV_KEY] = prev
  })

  it("returns null for client role without checking allowlist", () => {
    delete process.env[ENV_KEY]
    const res = assertCanGrantAdminRole({ user: { email: "anyone@x.com" } }, "client")
    assert.equal(res, null)
  })

  it("returns 403 for admin target when caller not allowlisted", async () => {
    process.env[ENV_KEY] = "ops@assembled.media"
    const res = assertCanGrantAdminRole(
      { user: { email: "admin@example.com" } },
      "admin",
    )
    assert.ok(res)
    assert.equal(res!.status, 403)
    const body = (await res!.json()) as { error?: string }
    assert.match(String(body.error), /allowlisted operator/i)
  })

  it("returns null for admin target when caller is allowlisted", () => {
    process.env[ENV_KEY] = "ops@assembled.media"
    const res = assertCanGrantAdminRole(
      { user: { email: "ops@assembled.media" } },
      "admin",
    )
    assert.equal(res, null)
  })
})
