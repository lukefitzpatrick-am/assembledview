/**
 * S14 A: /api/finance/billing/above-plan-reason. POST: finance admin first, 404
 * with the switch off, the reason checked, only a held record takes one, the
 * amount covered comes from the server's pack, and a server amount above the
 * one the admin saw stores nothing. GET: the month's held invoices.
 * Run with --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()
const dialect = new PgDialect()

type Gate = { session: { user: { email: string; sub: string } }; roles: string[] } | { response: NextResponse }
const admin: Gate = { session: { user: { email: "luke@example.com", sub: "auth0|luke" } }, roles: ["admin"] }
const requireFinanceAdminMock = mock.fn(async (): Promise<Gate> => admin)
const getCurrentUserMock = mock.fn(async (): Promise<{ id: number; name: string; email: string } | null> => ({
  id: 7,
  name: "Luke",
  email: "luke@example.com",
}))
let switchOn = true
const packMonths: string[] = []
const inserts: Array<{ sql: string; params: unknown[] }> = []
const held = [{ invoiceKey: "media:AC-001:2026-05", persistedId: 11, abovePlanCents: 4321 }]

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", { namedExports: { requireFinanceAdmin: requireFinanceAdminMock } })
  await mock.module("@/lib/auth/getCurrentUser", { namedExports: { getCurrentUser: getCurrentUserMock } })
  await mock.module("@/lib/features/server", {
    namedExports: { isFeatureOn: async (key: string) => key === "billing_above_plan_hold" && switchOn },
  })
  await mock.module("@/lib/finance/loadAccountsPack", {
    namedExports: {
      loadAccountsPack: async (month: string) => {
        packMonths.push(month)
        return { rows: [], held, records: [], metaByClientId: new Map() }
      },
    },
  })
  const schema = await import("@/db/schema")
  await mock.module("@/db", {
    namedExports: {
      schema,
      getDb: () => ({
        execute: async (q: SQL) => {
          inserts.push(dialect.sqlToQuery(q))
          return []
        },
      }),
    },
  })
}

const { GET, POST } = await import("../route")

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/finance/billing/above-plan-reason", { method: "POST", body: JSON.stringify(body) })
const good = { month: "2026-05", invoice_key: "media:AC-001:2026-05", reason: "  Client agreed the overage by email  ", seen_cents: 5000 }

test("a non-admin is refused before anything else", { skip }, async () => {
  requireFinanceAdminMock.mock.mockImplementationOnce(async () => ({ response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }))
  assert.equal((await POST(req(good))).status, 403)
})

test("404 with the switch off; nothing is read or stored", { skip }, async () => {
  switchOn = false
  const before = packMonths.length
  assert.equal((await POST(req(good))).status, 404)
  assert.equal(packMonths.length, before)
  switchOn = true
})

test("no audit user is 401", { skip }, async () => {
  getCurrentUserMock.mock.mockImplementationOnce(async () => null)
  assert.equal((await POST(req(good))).status, 401)
})

test("bad month, missing key, blank or over-long reason are 400 and store nothing", { skip }, async () => {
  const before = inserts.length
  assert.equal((await POST(req({ ...good, month: "2026-13" }))).status, 400)
  assert.equal((await POST(req({ ...good, invoice_key: " " }))).status, 400)
  assert.equal((await POST(req({ ...good, reason: "   " }))).status, 400)
  assert.equal((await POST(req({ ...good, reason: "x".repeat(2001) }))).status, 400)
  const { seen_cents: _seen, ...noSeen } = good
  assert.equal((await POST(req(noSeen))).status, 400)
  assert.equal((await POST(req({ ...good, seen_cents: 12.5 }))).status, 400)
  assert.equal((await POST(req({ ...good, seen_cents: "4321" }))).status, 400)
  assert.equal(inserts.length, before)
})

test("a record that is not held takes no reason (409)", { skip }, async () => {
  const before = inserts.length
  const res = await POST(req({ ...good, invoice_key: "media:AC-002:2026-05" }))
  assert.equal(res.status, 409)
  assert.equal(((await res.json()) as { error: string }).error, "not_held")
  assert.equal(inserts.length, before)
})

test("a held record stores the trimmed reason, who, and the server's amount above plan", { skip }, async () => {
  const before = inserts.length
  const res = await POST(req(good))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, invoice_key: "media:AC-001:2026-05", covers_cents: 4321 })
  assert.equal(packMonths.at(-1), "2026-05")
  assert.equal(inserts.length, before + 1)
  assert.deepEqual(inserts.at(-1)!.params, [11, "Client agreed the overage by email", 4321, 7, "Luke"])
})

test("a server amount above the one the admin saw stores nothing (409 amount_changed)", { skip }, async () => {
  const before = inserts.length
  const res = await POST(req({ ...good, seen_cents: 4320 }))
  assert.equal(res.status, 409)
  const body = (await res.json()) as { error: string; above_plan_cents: number }
  assert.equal(body.error, "amount_changed")
  assert.equal(body.above_plan_cents, 4321)
  assert.equal(inserts.length, before)
  // The amount the admin saw exactly is enough.
  assert.equal((await POST(req({ ...good, seen_cents: 4321 }))).status, 200)
})

const getReq = (month: string) => new NextRequest(`http://localhost/api/finance/billing/above-plan-reason?month=${month}`)

test("GET lists the month's held invoices; 404 with the switch off; admin first", { skip }, async () => {
  const res = await GET(getReq("2026-05"))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    month: "2026-05",
    held: [{ invoice_key: "media:AC-001:2026-05", above_plan_cents: 4321 }],
  })
  assert.equal((await GET(getReq("2026-5"))).status, 400)
  switchOn = false
  const before = packMonths.length
  assert.equal((await GET(getReq("2026-05"))).status, 404)
  assert.equal(packMonths.length, before)
  switchOn = true
  requireFinanceAdminMock.mock.mockImplementationOnce(async () => ({ response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }))
  assert.equal((await GET(getReq("2026-05"))).status, 403)
})
