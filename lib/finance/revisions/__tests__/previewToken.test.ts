import assert from "node:assert/strict"
import test from "node:test"

import { signPreviewToken, verifyPreviewToken } from "../previewToken"

const SECRET = "test-secret-at-least-16"
const payload = {
  mbaNumber: "PENFOLD020",
  baseVersionId: 16999,
  hash: "abc",
  request: { mode: "bill_amount" as const, intoMonth: "2026-10", amountCents: 10_000_000, strategy: "earliest_first" as const },
  options: { unlockApprovedMonths: ["2026-10"], includeProduction: false, feeMode: "follow" as const, adservingMode: "keep" as const },
  reason: "Bill $100k in October",
  source: "ava" as const,
  restoresRevisionId: null,
  sub: "auth0|luke",
}

function withSecret<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.BILLING_REVISION_TOKEN_SECRET
  if (value === undefined) delete process.env.BILLING_REVISION_TOKEN_SECRET
  else process.env.BILLING_REVISION_TOKEN_SECRET = value
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.BILLING_REVISION_TOKEN_SECRET
    else process.env.BILLING_REVISION_TOKEN_SECRET = prev
  }
}

const NOW = new Date("2026-10-26T06:00:00Z")

test("round trip", () =>
  withSecret(SECRET, () => {
    const s = signPreviewToken(payload, NOW)
    assert.ok("token" in s)
    const v = verifyPreviewToken(s.token, { sub: "auth0|luke", now: NOW })
    assert.ok(v.ok)
    assert.equal(v.payload.request.mode, "bill_amount")
    assert.equal(s.expiresAt, "2026-10-26T06:15:00.000Z")
  }))

test("tampered payload is refused", () =>
  withSecret(SECRET, () => {
    const s = signPreviewToken(payload, NOW)
    assert.ok("token" in s)
    const [body, mac] = s.token.split(".")
    const forged = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"))
    forged.request.amountCents = 50_000_000
    const token = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${mac}`
    const v = verifyPreviewToken(token, { sub: "auth0|luke", now: NOW })
    assert.equal(!v.ok && v.error, "TOKEN_INVALID")
  }))

test("expired, other user, missing secret", () =>
  withSecret(SECRET, () => {
    const s = signPreviewToken(payload, NOW)
    assert.ok("token" in s)
    const late = verifyPreviewToken(s.token, { sub: "auth0|luke", now: new Date("2026-10-26T06:15:01Z") })
    assert.equal(!late.ok && late.error, "TOKEN_EXPIRED")
    const other = verifyPreviewToken(s.token, { sub: "auth0|someone", now: NOW })
    assert.equal(!other.ok && other.error, "TOKEN_OTHER_USER")
    withSecret(undefined, () => {
      const v = verifyPreviewToken(s.token, { sub: "auth0|luke", now: NOW })
      assert.equal(!v.ok && v.error, "TOKEN_SECRET_MISSING")
      const signed = signPreviewToken(payload, NOW)
      assert.deepEqual(signed, { error: "TOKEN_SECRET_MISSING" })
    })
    withSecret("another-secret-of-16+", () => {
      const v = verifyPreviewToken(s.token, { sub: "auth0|luke", now: NOW })
      assert.equal(!v.ok && v.error, "TOKEN_INVALID")
    })
  }))
