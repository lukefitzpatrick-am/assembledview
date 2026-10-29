/**
 * True-up service: the apply rebuilds the report and refuses a stale fix,
 * writes one ledger row per component (plus a one-off for a residual) inside
 * the publish transaction, and an undo marks the fix's rows undone.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()
const dialect = new PgDialect()

type ApplyArgs = {
  beforeApply?: (p: { mbaNumber: string; request: unknown }) => Promise<unknown>
  inTransaction?: (tx: unknown, r: unknown) => Promise<void>
}
let tokenRequest: Record<string, unknown> = {}
let planForTx: unknown = null
const applyMock = mock.fn(async (args: ApplyArgs) => {
  const refused = await args.beforeApply?.({ mbaNumber: "golf025", request: tokenRequest })
  if (refused) return refused
  const queries: string[] = []
  const tx = {
    execute: async (q: SQL) => {
      const text = dialect.sqlToQuery(q).sql
      queries.push(text)
      if (text.includes("SELECT params FROM billing_revisions")) return { rows: [{ params: { request: tokenRequest } }] }
      if (text.includes("restores_revision_id AS id")) return { rows: [{ id: 41 }] }
      if (text.includes("INSERT INTO true_up_actions")) return { rows: [{ id: 100 + queries.length }] }
      return { rows: [] }
    },
  }
  await args.inTransaction?.(tx, { revisionId: 9, newVersionId: 20001, mbaNumber: "golf025", plan: planForTx })
  ;(applyMock as unknown as { lastQueries: string[] }).lastQueries = queries
  return { ok: true, result: { status: "published", revisionId: 9, mbaNumber: "golf025", newVersionNumber: 41, warnings: [] } }
})

if (typeof mock.module === "function") {
  await mock.module("@/lib/finance/revisions/revisionService", {
    namedExports: { applyRevisionFromToken: applyMock, previewRevision: async () => ({ ok: true, impacts: [] as string[] }) },
  })
}

const { applyTrueUpFromToken, previewTrueUpFix } = await import("../service")
const { buildTrueUpReport } = await import("../compute")
const { INVOICES, MATCHED_RECORDS, PLANS, SCHEDULE } = await import("./fixtures")
const { buildTrueUpFixRequest } = await import("../fixRequest")

const load = async (args: { asOfMonth: string; fromMonth: string }) =>
  buildTrueUpReport({ ...args, plans: PLANS, schedule: SCHEDULE, invoices: INVOICES, matchedRecords: MATCHED_RECORDS })

const actor = { teamMemberId: 7, name: "Luke", email: "luke@assembledmedia.com.au" }
const now = new Date("2026-11-02T00:00:00Z")
const fresh = {
  mode: "true_up",
  asOfMonth: "2026-09",
  fromMonth: "2026-07",
  strategy: "spread",
  components: ["fee"],
  actuals: { "2026-07": { fee: 99561 }, "2026-08": { fee: 123060 }, "2026-09": { fee: 181002 } },
}

test("stale: refused when what was invoiced moved since the preview", { skip }, async () => {
  tokenRequest = { ...fresh, actuals: { ...fresh.actuals, "2026-09": { fee: 181003 } } }
  const out = await applyTrueUpFromToken({ token: "t", sub: "s", actor, now, load })
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.code, "PREVIEW_STALE")
})

test("fresh: one schedule row per component and a one-off for a residual, in the transaction", { skip }, async () => {
  const report = await load({ asOfMonth: "2026-09", fromMonth: "2026-07" })
  const built = buildTrueUpFixRequest({
    row: report.rows.find((r) => r.mbaNumber === "golf025")!,
    asOfMonth: "2026-09",
    fromMonth: "2026-07",
    currentMonth: "2026-11",
    choice: { components: ["fee", "adserving"], strategy: "spread" },
  })
  assert.ok(built.ok)
  if (!built.ok) return
  tokenRequest = built.request as unknown as Record<string, unknown>
  planForTx = {
    hash: "h",
    trueUp: {
      asOfMonth: "2026-09",
      strategy: "spread",
      months: ["2026-07", "2026-08", "2026-09"],
      components: [
        { component: "fee", gapBefore: -163893, residual: 0, rebalanced: 163893 },
        { component: "adserving", gapBefore: 300, residual: 150, rebalanced: 150 },
      ],
    },
  }
  const out = await applyTrueUpFromToken({ token: "t", sub: "s", actor, now, load })
  assert.equal(out.ok, true, JSON.stringify(out))
  if (!out.ok) return
  assert.equal(out.kind, "true_up")
  assert.equal(out.ledgerIds.length, 3)
  const inserts = (applyMock as unknown as { lastQueries: string[] }).lastQueries.filter((q) => q.includes("INSERT INTO true_up_actions"))
  assert.equal(inserts.length, 3)
})

test("undo: the fix's ledger rows are marked undone in the same transaction", { skip }, async () => {
  tokenRequest = { mode: "true_up_restore", target: { media: {} }, fixedAtMonth: "2026-11" }
  const out = await applyTrueUpFromToken({ token: "t", sub: "s", actor, now, load })
  assert.equal(out.ok, true)
  if (!out.ok) return
  assert.equal(out.kind, "true_up_restore")
  const q = (applyMock as unknown as { lastQueries: string[] }).lastQueries
  assert.ok(q.some((x) => x.includes("UPDATE true_up_actions") && x.includes("status = 'undone'")))
})

test("reset guard: the preview warns when the plan is not approved, and stays quiet when it is", { skip }, async () => {
  const choice = { components: ["fee" as const], strategy: "spread" as const }
  const args = { mbaNumber: "golf025", asOfMonth: "2026-09", fromMonth: "2026-07", choice, sub: "auth0|x", now }
  const approved = await previewTrueUpFix({ ...args, load })
  assert.ok("impacts" in approved)
  assert.ok(!(approved as { impacts: string[] }).impacts.some((x) => x.includes("full billing reset")))
  const draftLoad = async (a: { asOfMonth: string; fromMonth: string }) =>
    buildTrueUpReport({
      ...a,
      plans: PLANS.map((p) => (p.mba_number === "golf025" ? { ...p, campaign_status: "draft" } : p)),
      schedule: SCHEDULE,
      invoices: INVOICES,
      matchedRecords: MATCHED_RECORDS,
    })
  const draft = await previewTrueUpFix({ ...args, load: draftLoad })
  assert.ok("impacts" in draft)
  assert.ok((draft as { impacts: string[] }).impacts.some((x) => x.includes("full billing reset") && x.includes("draft")))
})
