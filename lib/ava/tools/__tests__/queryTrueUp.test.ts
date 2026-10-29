/**
 * query_true_up: finance admins only, TRUE_UP on, offered on /finance and the
 * MBA page; reads only the three tables 0110 grants; shapes open gaps and the ledger.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

import { avaToolDefinitionsForPage } from "../pageToolOffer"
import { queryTrueUpTool, shapeTrueUpForModel, trueUpToolGate, type TrueUpActionRecord, type TrueUpRunRecord } from "../queryTrueUp"

const ROOT = process.cwd()
const RUN_FILE = path.join(ROOT, "sql/supabase/2026-10-29_0110_ava_true_up_read_SUPABASE.sql")
const REPO_FILE = path.join(ROOT, "db/migrations/0110_ava_true_up_read.sql")
const TABLES = ["true_up_runs", "true_up_actions", "true_up_invoice_links"]

async function withTrueUp<T>(value: string | undefined, fn: () => T | Promise<T>): Promise<T> {
  const before = process.env.TRUE_UP
  if (value === undefined) delete process.env.TRUE_UP
  else process.env.TRUE_UP = value
  try {
    return await fn()
  } finally {
    if (before === undefined) delete process.env.TRUE_UP
    else process.env.TRUE_UP = before
  }
}

test("allowlist: 0110 grants ava_readonly SELECT plus an ava_read policy on exactly the three true-up tables", () => {
  for (const file of [RUN_FILE, REPO_FILE]) {
    const sql = fs.readFileSync(file, "utf8")
    const grants = [...sql.matchAll(/GRANT\s+(\w+)\s+ON TABLE public\.(\w+)\s+TO ava_readonly/gi)].map((m) => `${m[1]!.toUpperCase()} ${m[2]}`)
    assert.deepEqual(grants.sort(), TABLES.map((t) => `SELECT ${t}`).sort(), file)
    const policies = [...sql.matchAll(/CREATE POLICY ava_read ON public\.(\w+) FOR SELECT TO ava_readonly USING \(true\)/g)].map((m) => m[1])
    assert.deepEqual(policies.sort(), [...TABLES].sort(), file)
    assert.doesNotMatch(sql, /GRANT\s+(INSERT|UPDATE|DELETE|ALL)/i, file)
    assert.match(sql, /0110_ava_true_up_read/)
    assert.match(sql, /needs 0109/)
  }
})

test("allowlist: 0109 itself still grants AVA nothing (the grant lives only in 0110)", () => {
  const sql = fs.readFileSync(path.join(ROOT, "db/migrations/0109_true_up.sql"), "utf8")
  assert.doesNotMatch(sql, /GRANT[\s\S]*ava_readonly/i)
})

test("gate: admin only, then the true_up switch (env TRUE_UP with no switch row)", async () => {
  await withTrueUp("true", async () => {
    assert.match(String((await trueUpToolGate({ roles: ["client"] }))?.content), /finance admins only/)
    assert.equal(await trueUpToolGate({ roles: ["admin"] }), null)
  })
  await withTrueUp(undefined, async () => {
    assert.match(String((await trueUpToolGate({ roles: ["admin"] }))?.content), /True-up report/)
  })
})

test("gate: execute refuses a non-admin before any database read", async () => {
  await withTrueUp("true", async () => {
    const out = await queryTrueUpTool.execute({}, { roles: ["client"] } as never)
    assert.equal(out.isError, true)
    assert.match(String(out.content), /finance admins only/)
  })
})

test("offer: on /finance and the MBA page with TRUE_UP on, never on create or edit, never with TRUE_UP off", async () => {
  const defs = [{ name: "query_true_up" }, { name: "get_media_plan_summary" }]
  const offered = (pathname: string) => avaToolDefinitionsForPage(defs, { route: { pathname } } as never).map((d) => d.name)
  await withTrueUp("true", () => {
    assert.ok(offered("/finance/reports/true-up").includes("query_true_up"))
    assert.ok(offered("/mediaplans/mba/golf025").includes("query_true_up"))
    assert.equal(offered("/mediaplans/mba/golf025/edit").includes("query_true_up"), false)
    assert.equal(offered("/pacing").includes("query_true_up"), false)
  })
  await withTrueUp(undefined, () => {
    assert.equal(offered("/finance/reports/true-up").includes("query_true_up"), false)
  })
  // The chat path passes the live switch values; they win over env.
  await withTrueUp(undefined, () => {
    const live = avaToolDefinitionsForPage(defs, { route: { pathname: "/finance/reports/true-up" } } as never, {
      billingRevisions: false,
      trueUp: true,
    }).map((d) => d.name)
    assert.ok(live.includes("query_true_up"))
  })
})

const RUN: TrueUpRunRecord = {
  id: 3,
  createdAt: "2026-11-01T20:00:05Z",
  asOfMonth: "2026-10-01",
  fromMonth: "2026-07-01",
  source: "cron",
  xeroSyncedAt: "2026-11-01T00:20:00Z",
  provisionalInvoices: 1,
  mbasNeedingAction: 1,
  rows: [
    { mbaNumber: "golf025", clientName: "Golf Australia", campaignName: "AO FY27", versionNumber: 40, status: "gap", components: { fee: { status: "gap", gap: 163893, uncoveredGap: 163893 }, media: { status: "matches", gap: 0, uncoveredGap: 0 } } },
    { mbaNumber: "BICAU006", clientName: "BIC", campaignName: "Flex5", versionNumber: 24, status: "matches", components: { fee: { status: "matches", gap: 0, uncoveredGap: 0 } } },
  ],
}
const ACTION: TrueUpActionRecord = {
  id: 9, createdAt: "2026-11-03T01:00:00Z", mbaNumber: "golf025", component: "fee", action: "schedule", strategy: "carry",
  months: ["2026-11"], asOfMonth: "2026-10-01", gapCents: 163893, amountCents: 163893, billingRevisionId: 12,
  reasonCode: "timing", note: null, status: "applied", createdByName: "Luke", undoneAt: null,
}

test("shape: open gaps by default, dollars and cents, the ledger per MBA, the run it came from", () => {
  const out = shapeTrueUpForModel(RUN, [ACTION], {})
  assert.equal(out.matched, 1)
  assert.equal(out.rows[0]!.mba, "golf025")
  assert.deepEqual(out.rows[0]!.gaps.map((g) => [g.component, g.gapCents, g.gap]), [["fee", 163893, 1638.93]])
  assert.equal(out.rows[0]!.actions[0]!.billingRevisionId, 12)
  assert.equal(out.run.asOf, "2026-10")
  assert.match(out.source, /not live/)
  assert.equal(shapeTrueUpForModel(RUN, [], { client: "bic" }).matched, 0)
  assert.equal(shapeTrueUpForModel(RUN, [], { client: "bic", openOnly: false }).matched, 1)
  assert.equal(shapeTrueUpForModel(RUN, [], { mba: "BICAU006" }).rows[0]!.status, "matches")
})
