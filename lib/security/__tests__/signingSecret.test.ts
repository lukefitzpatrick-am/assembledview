/**
 * APP_SIGNING_SECRET: per-purpose keys, the feature secret still wins, the
 * edge (Web Crypto) and Node derivations agree, and the token signers use it.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { isViewAsEnabled, getViewAsSecret } from "@/lib/auth/viewAs"
import { signPreviewToken, verifyPreviewToken } from "@/lib/finance/revisions/previewToken"
import { hasSigningKey, signingKeyFor, signingKeySource } from "@/lib/security/signingSecret"
import { signingKeyForSync } from "@/lib/security/signingSecretNode"

const MASTER = "m".repeat(40)

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k]
    if (vars[k] === undefined) delete process.env[k]
    else process.env[k] = vars[k]
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of Object.keys(prev)) {
        if (prev[k] === undefined) delete process.env[k]
        else process.env[k] = prev[k]
      }
    })
}

test("Web Crypto and Node derive the same key; purposes differ", async () => {
  const env = { APP_SIGNING_SECRET: MASTER }
  const edge = await signingKeyFor("view-as", env)
  const node = signingKeyForSync("view-as", env)
  assert.ok(edge && edge.length >= 40)
  assert.equal(edge, node)
  assert.notEqual(await signingKeyFor("billing-revision-preview", env), edge)
  assert.equal(await signingKeyFor("billing-revision-preview", env), signingKeyForSync("billing-revision-preview", env))
})

test("order: the feature's own secret, then APP_SIGNING_SECRET, then none", async () => {
  const own = "v".repeat(32)
  assert.equal(await signingKeyFor("view-as", { VIEW_AS_SECRET: own, APP_SIGNING_SECRET: MASTER }), own)
  assert.equal(signingKeySource("view-as", { VIEW_AS_SECRET: own, APP_SIGNING_SECRET: MASTER }), "feature_secret")
  assert.equal(signingKeySource("view-as", { VIEW_AS_SECRET: "short", APP_SIGNING_SECRET: MASTER }), "app_signing_secret")
  assert.equal(signingKeySource("view-as", { APP_SIGNING_SECRET: "too-short" }), "missing")
  assert.equal(await signingKeyFor("view-as", {}), null)
  assert.equal(signingKeyForSync("billing-revision-preview", { BILLING_REVISION_TOKEN_SECRET: " test-secret-at-least-16 " }), "test-secret-at-least-16")
  assert.equal(hasSigningKey("billing-revision-preview", { APP_SIGNING_SECRET: MASTER }), true)
  assert.equal(hasSigningKey("billing-revision-preview", {}), false)
})

test("View as client runs on APP_SIGNING_SECRET alone; VIEW_AS_ENABLED still decides", async () => {
  assert.equal(isViewAsEnabled({ VIEW_AS_ENABLED: "on", APP_SIGNING_SECRET: MASTER }), true)
  assert.equal(isViewAsEnabled({ VIEW_AS_ENABLED: "off", APP_SIGNING_SECRET: MASTER }), false)
  assert.equal(isViewAsEnabled({ VIEW_AS_ENABLED: "on" }), false)
  assert.equal(await getViewAsSecret({ APP_SIGNING_SECRET: MASTER }), await signingKeyFor("view-as", { APP_SIGNING_SECRET: MASTER }))
})

test("billing revision and true-up preview tokens sign with APP_SIGNING_SECRET when the old secret is gone", async () => {
  const payload = {
    mbaNumber: "golf025",
    baseVersionId: 1,
    hash: "h",
    request: { mode: "bill_amount" as const, intoMonth: "2026-11", amountCents: 100, strategy: "earliest_first" as const },
    options: { unlockApprovedMonths: [], includeProduction: false, feeMode: "follow" as const, adservingMode: "keep" as const },
    reason: "r",
    source: "ui" as const,
    restoresRevisionId: null,
    sub: "auth0|luke",
  }
  await withEnv({ BILLING_REVISION_TOKEN_SECRET: undefined, APP_SIGNING_SECRET: MASTER }, () => {
    const signed = signPreviewToken(payload)
    assert.ok("token" in signed)
    assert.equal(verifyPreviewToken(signed.token, { sub: "auth0|luke" }).ok, true)
  })
  await withEnv({ BILLING_REVISION_TOKEN_SECRET: undefined, APP_SIGNING_SECRET: undefined }, () => {
    assert.deepEqual(signPreviewToken(payload), { error: "TOKEN_SECRET_MISSING" })
  })
})
