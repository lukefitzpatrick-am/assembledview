/**
 * CB-FIX-4 — GET draft-match must not write; auto-stamps are transactional
 * and idempotent. Requires Node 22+ `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

type Mode = "report" | "idempotent" | "txn-fail" | "rate-limit"

const state: {
  mode: Mode
  sql: string[]
  txStarted: boolean
  txRolledBack: boolean
  txUpdates: number
  matchedAt: string
  lastPullAt: string | null
} = {
  mode: "report",
  sql: [],
  txStarted: false,
  txRolledBack: false,
  txUpdates: 0,
  matchedAt: "2026-01-15T00:00:00.000Z",
  lastPullAt: "2026-09-01T00:00:00.000Z",
}

function sqlText(query: unknown): string {
  const seen = new Set<unknown>()
  function walk(q: unknown): string {
    if (q == null || seen.has(q)) return ""
    if (typeof q === "string") return q
    if (typeof q !== "object") return String(q)
    seen.add(q)
    const o = q as { queryChunks?: unknown[]; sql?: unknown; value?: unknown }
    if (typeof o.sql === "string") return o.sql
    if (Array.isArray(o.queryChunks)) return o.queryChunks.map(walk).join("")
    if (typeof o.value === "string") return o.value
    if (Array.isArray(o.value)) return o.value.map(walk).join("")
    try {
      return JSON.stringify(q)
    } catch {
      return ""
    }
  }
  const walked = walk(query)
  if (walked) return walked
  try {
    return JSON.stringify(query)
  } catch {
    return String(query)
  }
}

function isWriteSql(text: string): boolean {
  return /\b(UPDATE|INSERT|DELETE)\b/i.test(text)
}

const APPROVED = {
  invoice_key: "media:PENFOLD018:2026-08",
  clients_id: 1,
  client_name: "Penfolds",
  mba_number: "PENFOLD018",
  billing_month: "2026-08",
  approved_amount_cents: 10_000,
  total: 100,
}

const AR = {
  xero_invoice_id: "guid-agree",
  invoice_number: "INV-1",
  reference_raw: "Penfolds - Grange (PENFOLD018)",
  issue_date: "2026-08-15",
  status: "DRAFT",
  sub_total: 100,
  xero_contact_id: "contact-1",
  contact_name: "Penfolds",
}

const MATCH_ROW = {
  invoice_key: "media:PENFOLD018:2026-08",
  matched_xero_invoice_id: "guid-1",
  matched_at: "2026-01-15T00:00:00.000Z",
  matched_by: "auto",
}

function selectRows(text: string): unknown[] {
  if (/FROM finance_billing_records/i.test(text) && /approved_at IS NOT NULL/i.test(text)) {
    return [APPROVED]
  }
  if (/FROM xero_ar_invoices/i.test(text)) return [AR]
  if (/FROM clients/i.test(text)) return [{ id: 1, mp_client_name: "Penfolds" }]
  if (/FROM xero_client_aliases/i.test(text)) return []
  if (/FROM xero_sync_log/i.test(text) && /pulled_by/i.test(text)) {
    return state.lastPullAt ? [{ run_finished_at: state.lastPullAt }] : []
  }
  if (/FROM xero_sync_log/i.test(text)) {
    return [{ run_finished_at: "2026-09-01T00:00:00.000Z" }]
  }
  if (/FROM finance_billing_records/i.test(text) && /invoice_key/i.test(text)) {
    return [{ ...MATCH_ROW, matched_at: state.matchedAt }]
  }
  return []
}

async function executeSql(query: unknown): Promise<unknown[]> {
  const text = sqlText(query)
  state.sql.push(text)
  if (isWriteSql(text)) {
    if (state.mode === "idempotent") {
      if (/IS DISTINCT FROM/i.test(text)) return []
      state.matchedAt = "2026-09-01T12:00:00.000Z"
      return [{ ...MATCH_ROW, matched_at: state.matchedAt }]
    }
    return [{ ...MATCH_ROW, matched_at: "2026-09-01T12:00:00.000Z" }]
  }
  return selectRows(text)
}

const fakeTx = {
  execute: async (query: unknown) => {
    state.txUpdates += 1
    if (state.mode === "txn-fail" && state.txUpdates === 2) {
      throw new Error("mid-loop stamp failed")
    }
    return executeSql(query)
  },
}

const fakeDb = {
  execute: executeSql,
  transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => {
    state.txStarted = true
    try {
      return await fn(fakeTx)
    } catch (err) {
      state.txRolledBack = true
      throw err
    }
  },
}

if (supportsMockModule()) {
  await mock.module!("@/db", {
    namedExports: {
      getDb: () => fakeDb,
      db: fakeDb,
      schema: {},
    },
  })
  await mock.module!("@/lib/xero/contactLinks", {
    namedExports: {
      loadContactLinks: async () => [],
    },
  })
  await mock.module!("@/lib/xero/applyMatchMba", {
    namedExports: {
      loadMbaMasters: async () => [{ id: 18, mba_number: "PENFOLD018" }],
      loadScopeOfWorkRefs: async () => [],
    },
  })
  await mock.module!("@/lib/finance/sections/xero/enrichPendingFromXero", {
    namedExports: {
      loadMbaOptionsForQueue: async () => [],
    },
  })
}

const draftMatchQuery = supportsMockModule() ? await import("../draftMatchQuery") : null
const writeFinance = supportsMockModule() ? await import("../../../data/writeFinance") : null
const pullXeroRateLimit = supportsMockModule()
  ? await import("../pullXeroRateLimit")
  : null

function reset(mode: Mode): void {
  state.mode = mode
  state.sql = []
  state.txStarted = false
  state.txRolledBack = false
  state.txUpdates = 0
  state.matchedAt = "2026-01-15T00:00:00.000Z"
  state.lastPullAt = "2026-09-01T00:00:00.000Z"
}

test("GET draft-match report performs no writes", { skip }, async () => {
  assert.ok(draftMatchQuery)
  reset("report")
  const payload = await draftMatchQuery.fetchDraftMatchReport({ clientIds: [] })
  const writes = state.sql.filter(isWriteSql)
  assert.equal(writes.length, 0, `unexpected writes:\n${writes.join("\n")}`)
  assert.ok(payload.rows.length > 0)
  assert.equal(payload.rows[0]?.stamps[0]?.matched_by, "auto")
})

test("re-running the stamp with an unchanged match does not move matched_at", { skip }, async () => {
  assert.ok(writeFinance)
  reset("idempotent")
  const first = await writeFinance.setFinanceBillingRecordXeroMatch({
    invoiceKey: MATCH_ROW.invoice_key,
    xeroInvoiceId: MATCH_ROW.matched_xero_invoice_id,
    matchedBy: "auto",
  })
  const firstAt =
    (first as { record?: { matched_at?: unknown }; matched_at?: unknown }).record?.matched_at ??
    (first as { matched_at?: unknown }).matched_at
  const second = await writeFinance.setFinanceBillingRecordXeroMatch({
    invoiceKey: MATCH_ROW.invoice_key,
    xeroInvoiceId: MATCH_ROW.matched_xero_invoice_id,
    matchedBy: "auto",
  })
  const secondAt =
    (second as { record?: { matched_at?: unknown }; matched_at?: unknown }).record?.matched_at ??
    (second as { matched_at?: unknown }).matched_at
  assert.equal(String(firstAt), "2026-01-15T00:00:00.000Z")
  assert.equal(String(secondAt), "2026-01-15T00:00:00.000Z")
  assert.equal(state.matchedAt, "2026-01-15T00:00:00.000Z")
})

test("a mid-loop stamp failure rolls back and is reported, not swallowed", { skip }, async () => {
  assert.ok(draftMatchQuery)
  reset("txn-fail")
  const stamps = [
    { invoice_key: "media:PENFOLD018:2026-08", xero_invoice_id: "guid-a", matched_by: "auto" as const },
    { invoice_key: "media:PENFOLD018:2026-09", xero_invoice_id: "guid-b", matched_by: "auto" as const },
  ]
  const result = (await draftMatchQuery.persistAutoStamps(stamps)) as {
    ok?: boolean
    failed?: number
    stamped?: number
    error?: string
  }
  assert.equal(result.ok, false)
  assert.ok((result.failed ?? 0) >= 1)
  assert.equal(result.stamped, 0)
  assert.equal(state.txStarted, true)
  assert.equal(state.txRolledBack, true)
  assert.match(result.error ?? "", /mid-loop stamp failed/)
})

test("pull-xero rate limit reads last pull for this user from Postgres", { skip }, async () => {
  assert.ok(pullXeroRateLimit)
  reset("rate-limit")
  const now = Date.parse("2026-09-01T00:00:30.000Z")
  const limited = await pullXeroRateLimit.checkPullXeroRateLimit("auth0|user-1", now)
  assert.equal(limited.ok, false)
  if (!limited.ok) {
    assert.equal(limited.retryAfterSeconds, 30)
  }
  const pulledBySql = state.sql.find((s) => /pulled_by/i.test(s))
  assert.ok(pulledBySql, "expected CASE-guarded pulled_by lookup")
  assert.match(pulledBySql!, /CASE/i)
})
