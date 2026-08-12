import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  resolveInternalEmailDomains,
  DEFAULT_ASSEMBLED_DOMAINS,
} from "../internalDomains.js"

describe("resolveInternalEmailDomains", () => {
  it("unset env → DEFAULT_ASSEMBLED_DOMAINS", () => {
    const r = resolveInternalEmailDomains({})
    assert.equal(r.warned, false)
    for (const d of DEFAULT_ASSEMBLED_DOMAINS) assert.ok(r.domains.has(d))
  })

  it("empty string env → default + warned", () => {
    const r = resolveInternalEmailDomains({ INTERNAL_EMAIL_DOMAINS: "" })
    assert.equal(r.warned, true)
    assert.ok(r.domains.has("assembledmedia.com.au"))
  })

  it("whitespace-only → default + warned", () => {
    const r = resolveInternalEmailDomains({ INTERNAL_EMAIL_DOMAINS: "  ,  " })
    assert.equal(r.warned, true)
    assert.ok(r.domains.size >= 1)
  })

  it("non-empty CSV replaces set", () => {
    const r = resolveInternalEmailDomains({
      INTERNAL_EMAIL_DOMAINS: "Alias.Media,other.com",
    })
    assert.equal(r.warned, false)
    assert.deepEqual([...r.domains].sort(), ["alias.media", "other.com"])
  })
})
