import assert from "node:assert/strict"
import test from "node:test"

import {
  isUnscopedAvaAccess,
  resolveScopedClientSlug,
  resolveScopedMba,
} from "../helpers.js"
import type { AvaToolContext } from "../types.js"

function baseContext(
  overrides: Partial<AvaToolContext> = {},
): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: undefined,
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: "user-1",
    userEmail: "user@example.com",
    roles: ["manager"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    capturedLineItemsLoad: null,
    currentLineItems: null,
    ...overrides,
  }
}

test("isUnscopedAvaAccess: admin → true", () => {
  const ctx = baseContext({ roles: ["admin"] })
  assert.equal(isUnscopedAvaAccess(ctx), true)
})

test("isUnscopedAvaAccess: non-admin + empty clientSlugs → false (not unscoped)", () => {
  const ctx = baseContext({ roles: ["manager"], clientSlugs: [] })
  assert.equal(isUnscopedAvaAccess(ctx), false)
})

test("isUnscopedAvaAccess: non-admin with clientSlugs → false", () => {
  const ctx = baseContext({
    roles: ["manager"],
    clientSlugs: ["acme"],
  })
  assert.equal(isUnscopedAvaAccess(ctx), false)
})

test("resolveScopedMba: admin/unscoped → ok", () => {
  const ctx = baseContext({ roles: ["admin"], mbaNumbers: [] })
  const result = resolveScopedMba(ctx, "MBA-1")
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.mba, "MBA-1")
})

test("resolveScopedMba: scoped + empty mbaNumbers → fail closed", () => {
  const ctx = baseContext({ roles: ["manager"], mbaNumbers: [] })
  const result = resolveScopedMba(ctx, "MBA-1")
  assert.equal(result.ok, false)
})

test("resolveScopedMba: scoped + out-of-scope want → fail", () => {
  const ctx = baseContext({
    roles: ["manager"],
    mbaNumbers: ["MBA-1", "MBA-2"],
  })
  const result = resolveScopedMba(ctx, "MBA-999")
  assert.equal(result.ok, false)
})

test("resolveScopedMba: scoped + in-scope want → ok", () => {
  const ctx = baseContext({
    roles: ["manager"],
    mbaNumbers: ["MBA-1", "MBA-2"],
  })
  const result = resolveScopedMba(ctx, "MBA-1")
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.mba, "MBA-1")
})

test("resolveScopedClientSlug: scoped + empty clientSlugs → fail closed", () => {
  const ctx = baseContext({ roles: ["manager"], clientSlugs: [] })
  const noWant = resolveScopedClientSlug(ctx, null)
  assert.equal(noWant.ok, false)

  const withWant = resolveScopedClientSlug(ctx, "acme")
  assert.equal(withWant.ok, false)
})

test("resolveScopedClientSlug: scoped + in-scope → ok", () => {
  const ctx = baseContext({
    roles: ["manager"],
    clientSlugs: ["Acme Co"],
  })
  const result = resolveScopedClientSlug(ctx, "Acme Co")
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.slug, "Acme Co")
})

test("resolveScopedClientSlug: scoped + out-of-scope → fail", () => {
  const ctx = baseContext({
    roles: ["manager"],
    clientSlugs: ["Acme Co"],
  })
  const result = resolveScopedClientSlug(ctx, "Other Client")
  assert.equal(result.ok, false)
})

test("resolveScopedClientSlug: admin → ok even with empty clientSlugs", () => {
  const ctx = baseContext({ roles: ["admin"], clientSlugs: [] })
  const result = resolveScopedClientSlug(ctx, "any-client")
  assert.equal(result.ok, true)
})
