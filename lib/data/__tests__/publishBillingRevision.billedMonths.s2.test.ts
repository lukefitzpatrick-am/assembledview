/**
 * S2 A (B56): a billing revision copies the published tip, so it cannot keep
 * billed rows; with `billed_months_choice` on it refuses a change to an
 * invoiced month (409), a true-up and its undo are exempt, and off changes
 * nothing. B56fix: the undo preview and its Confirm agree.
 * The planner is mocked to hand back cells that move an invoiced month, as a
 * planner bug would; the real publishBillingRevision runs.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import type { Db } from "@/db"
import type { FeatureRow } from "@/lib/features/registry"
import { setFeatureRowReaderForTests } from "@/lib/features/server"
import { mockModuleSkip, supportsMockModule } from "@/lib/test/mockModuleHarness"
import { penfold022V3Blob } from "@/lib/finance/revisions/__tests__/blobFixtures"
import { DEFAULT_OPTIONS, PENFOLD022_CAMPAIGN, PENFOLD022_V3, linesFromRows } from "@/lib/finance/revisions/__tests__/fixtures"
import { planBillingRevision as realPlanner } from "@/lib/finance/revisions/planBillingRevision"

const skip = mockModuleSkip()

const lines = linesFromRows(PENFOLD022_V3)
const plan = realPlanner({
  lines,
  locks: [],
  currentMonth: "2026-10",
  campaignMonths: PENFOLD022_CAMPAIGN,
  request: { mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" },
  options: DEFAULT_OPTIONS,
})
assert.ok(plan.ok)

const COMP = { m: "media", f: "fee", a: "adserving" } as const
const billingRows = PENFOLD022_V3.map(([id, , , c, month, cents]) => ({
  lineItemId: id,
  component: COMP[c],
  month: `${month}-01`,
  amountCents: cents,
  source: "computed" as const,
}))

if (supportsMockModule()) {
  const realCtx = await import("@/lib/finance/revisions/loadRevisionContext")
  await mock.module!("@/lib/finance/revisions/loadRevisionContext", {
    namedExports: {
      ...realCtx,
      loadRevisionContext: async () => ({
        masterId: 1,
        mbaNumber: "penfold022",
        base: { id: 9, versionNumber: 3, legacySchedules: { billingSchedule: penfold022V3Blob() } },
        partial: false,
        unmatchedLineIds: [],
        lines,
        billingRows,
        locks: [{ month: "2026-12", level: "hard", reasons: ["xero_matched"], past: false }],
      }),
      buildRevisionInput: () => ({}),
    },
  })
  const realPlan = await import("@/lib/finance/revisions/planBillingRevision")
  await mock.module!("@/lib/finance/revisions/planBillingRevision", {
    namedExports: { ...realPlan, planBillingRevision: () => plan },
  })
}

afterEach(() => setFeatureRowReaderForTests(null))

const row = (key: string, on: boolean): FeatureRow => ({
  key,
  enabled: on,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
  note: null,
})

class PastTheGate extends Error {}

/** Answers the next version number; any write means the revision went past the gate. */
function fakeDb(): Db {
  const select = () => {
    const chain: Record<string, unknown> = {}
    for (const k of ["from", "where"]) chain[k] = () => chain
    chain.then = (res: (v: unknown) => unknown) => res([{ maxVn: 3 }])
    return chain
  }
  const tx = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "select") return select
        throw new PastTheGate(`went on to tx.${String(prop)}`)
      },
    },
  )
  return { select, transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx) } as unknown as Db
}

type Mode = "pull_month" | "true_up" | "true_up_restore"

function requestFor(mode: Mode) {
  if (mode === "true_up") return { mode }
  if (mode === "true_up_restore") return { mode, target: { media: {} }, fixedAtMonth: "2027-01" }
  return { mode, fromMonth: "2026-12", intoMonth: "2026-11" }
}

async function run(on: boolean, mode: Mode) {
  setFeatureRowReaderForTests(async () => new Map([["billed_months_choice", row("billed_months_choice", on)]]))
  const { publishBillingRevision } = await import("@/lib/data/publishBillingRevision")
  return publishBillingRevision(
    {
      mbaNumber: "penfold022",
      baseVersionId: 9,
      expectedHash: plan.ok ? plan.hash : "",
      request: requestFor(mode) as never,
      options: DEFAULT_OPTIONS,
      reason: "Client asked",
      source: "ui",
      actor: { teamMemberId: 7, name: "Test", email: "test@example.com" },
    },
    fakeDb(),
  )
}

test("on: a revision that changes an invoiced month is refused (409) before any write", { skip }, async () => {
  const { BillingRevisionWriteError } = await import("@/lib/data/publishBillingRevision")
  await assert.rejects(run(true, "pull_month"), (err: unknown) => {
    assert.ok(err instanceof BillingRevisionWriteError)
    assert.equal(err.code, "BILLED_MONTHS_CHANGED")
    assert.equal(err.status, 409)
    assert.match(err.message, /invoiced months \(Dec 2026\)/)
    return true
  })
})

test("on: a true-up sets invoiced months to what was invoiced and goes on", { skip }, async () => {
  await assert.rejects(run(true, "true_up"), PastTheGate)
})

test("off: the revision goes on as before", { skip }, async () => {
  await assert.rejects(run(false, "pull_month"), PastTheGate)
})

test("on: a true-up undo that puts back an invoiced month goes on (B56fix R3)", { skip }, async () => {
  await assert.rejects(run(true, "true_up_restore"), PastTheGate)
})

test("on: the true-up undo preview and its Confirm agree (both go on)", { skip }, async () => {
  const prev = process.env.BILLING_REVISION_TOKEN_SECRET
  process.env.BILLING_REVISION_TOKEN_SECRET = "b56fix-test-secret-0123456789"
  try {
    setFeatureRowReaderForTests(async () => new Map([["billed_months_choice", row("billed_months_choice", true)]]))
    const { previewRevision } = await import("@/lib/finance/revisions/revisionService")
    const preview = await previewRevision({
      mbaNumber: "penfold022",
      request: requestFor("true_up_restore") as never,
      options: DEFAULT_OPTIONS,
      reason: "Undo true-up",
      source: "ui",
      sub: "auth0|test",
      db: fakeDb(),
    })
    assert.equal(preview.ok, true)
    // The plan changes Dec 2026, which is invoiced (hard, matched to Xero).
    const dec = preview.ok ? preview.plan.months.find((m) => m.month === "2026-12") : undefined
    assert.ok(dec && dec.total.before !== dec.total.after)
    await assert.rejects(run(true, "true_up_restore"), PastTheGate)
  } finally {
    if (prev === undefined) delete process.env.BILLING_REVISION_TOKEN_SECRET
    else process.env.BILLING_REVISION_TOKEN_SECRET = prev
  }
})
