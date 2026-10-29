import assert from "node:assert/strict"
import test from "node:test"

import type { Db } from "@/db"

import { planBillingRevision } from "../planBillingRevision"
import { signPreviewToken } from "../previewToken"
import { applyRevisionFromToken, revisionImpacts } from "../revisionService"
import type { RevisionContext } from "../loadRevisionContext"
import { DEFAULT_OPTIONS, PENFOLD020_CAMPAIGN, PENFOLD020_V29, linesFromRows } from "./fixtures"

const noDb = new Proxy({}, { get() { throw new Error("no DB in this test") } }) as unknown as Db
const actor = { teamMemberId: 7, name: "Luke", email: "luke@assembledmedia.com.au" }

test("apply refuses a forged token, an expired one and another user's, before any DB", async () => {
  process.env.BILLING_REVISION_TOKEN_SECRET = "test-secret-at-least-16"
  const forged = await applyRevisionFromToken({ token: "abc.def", sub: "auth0|luke", actor, db: noDb })
  assert.equal(!forged.ok && forged.status, 400)
  const signed = signPreviewToken(
    {
      mbaNumber: "PENFOLD020",
      baseVersionId: 16999,
      hash: "h",
      request: { mode: "bill_remainder", intoMonth: "2026-10" },
      options: DEFAULT_OPTIONS,
      reason: "r",
      source: "ava",
      restoresRevisionId: null,
      sub: "auth0|luke",
    },
    new Date("2026-10-26T06:00:00Z"),
  )
  assert.ok("token" in signed)
  const other = await applyRevisionFromToken({ token: signed.token, sub: "auth0|other", actor, now: new Date("2026-10-26T06:01:00Z"), db: noDb })
  assert.equal(!other.ok && other.code, "TOKEN_OTHER_USER")
  assert.equal(!other.ok && other.status, 403)
  const late = await applyRevisionFromToken({ token: signed.token, sub: "auth0|luke", actor, now: new Date("2026-10-26T07:00:00Z"), db: noDb })
  assert.equal(!late.ok && late.code, "TOKEN_EXPIRED")
})

test("impacts for PENFOLD020 $100k: Oct needs Re-approve, publishes v30, drafts warned", () => {
  const plan = planBillingRevision({
    lines: linesFromRows(PENFOLD020_V29),
    locks: [{ month: "2026-10", level: "soft", reasons: ["approved"], past: false }],
    currentMonth: "2026-10",
    campaignMonths: PENFOLD020_CAMPAIGN,
    request: { mode: "bill_amount", intoMonth: "2026-10", amountCents: 10_000_000, strategy: "earliest_first" },
    options: { ...DEFAULT_OPTIONS, unlockApprovedMonths: ["2026-10"] },
  })
  assert.ok(plan.ok)
  const ctx = { base: { versionNumber: 29 }, hasAaLines: false, workingDraftCount: 2 } as unknown as RevisionContext
  const impacts = revisionImpacts(ctx, plan, 30)
  assert.equal(impacts[0], 'Oct 2026 is approved at $14,160.67. It will show "changed since" and need Re-approve.')
  assert.ok(impacts.includes("Publishes v30 and a new MBA PDF (kept on file, no client re-sign)."))
  assert.ok(impacts.includes("2 working drafts on this plan will be out of date. This does not block the change."))
})

test("the generic apply refuses a true-up token, and the true-up apply refuses a generic one", async () => {
  process.env.BILLING_REVISION_TOKEN_SECRET = "test-secret-at-least-16"
  const now = new Date("2026-11-02T06:00:00Z")
  const sign = (request: Parameters<typeof signPreviewToken>[0]["request"]) => {
    const s = signPreviewToken(
      { mbaNumber: "golf025", baseVersionId: 19625, hash: "h", request, options: DEFAULT_OPTIONS, reason: "r", source: "ui", restoresRevisionId: null, sub: "auth0|luke" },
      now,
    )
    assert.ok("token" in s)
    return s.token
  }
  const trueUp = sign({ mode: "true_up", asOfMonth: "2026-10", strategy: "spread", components: ["fee"], actuals: { "2026-10": { fee: 1 } } })
  const generic = sign({ mode: "bill_remainder", intoMonth: "2026-11" })
  const a = await applyRevisionFromToken({ token: trueUp, sub: "auth0|luke", actor, now, db: noDb })
  assert.equal(!a.ok && a.code, "TOKEN_WRONG_KIND")
  const b = await applyRevisionFromToken({ token: generic, sub: "auth0|luke", actor, now, db: noDb, allowTrueUp: true })
  assert.equal(!b.ok && b.code, "TOKEN_WRONG_KIND")
})
