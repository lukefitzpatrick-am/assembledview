/**
 * Unlinked contact link routes.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const queries: Array<{ text: string; values: unknown[] }> = []

function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks
  if (!chunks) return String(query)
  const parts: string[] = []
  for (const chunk of chunks) {
    if (typeof chunk === "string") {
      parts.push(chunk)
      continue
    }
    if (chunk && typeof chunk === "object" && "value" in chunk) {
      const value = (chunk as { value: unknown }).value
      if (Array.isArray(value)) parts.push(value.map((part) => String(part)).join(""))
      else if (typeof value === "string") parts.push(value)
    }
  }
  return parts.join(" ")
}

function sqlValues(query: unknown): unknown[] {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? []
  const values: unknown[] = []
  for (const chunk of chunks) {
    if (typeof chunk === "string" || typeof chunk === "number" || typeof chunk === "boolean") {
      values.push(chunk)
    }
  }
  return values
}

function execute(query: unknown) {
  const text = sqlText(query)
  const values = sqlValues(query)
  queries.push({ text, values })
  if (text.includes("FROM clients") && text.includes("WHERE id")) {
    return [{ id: 9 }]
  }
  if (text.includes("count(*)")) return [{ n: 0 }]
  return []
}

const requireFinanceAdminMock = mock.fn(
  async (): Promise<
    { session: { user: { email: string } } } | { response: NextResponse }
  > => ({
    session: { user: { email: "luke@assembledmedia.com.au" } },
  }),
)

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireFinanceAdmin: requireFinanceAdminMock },
  })
  await mock.module("@/db", {
    namedExports: {
      getDb: () => ({
        execute,
        transaction: async (fn: (tx: { execute: typeof execute }) => Promise<void>) => {
          await fn({ execute })
        },
      }),
    },
  })
}

const { GET } = await import("../unlinked/route")
const { POST } = await import("../route")

function forbid() {
  requireFinanceAdminMock.mock.mockImplementation(async () => ({
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  }))
}

function allow() {
  requireFinanceAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "luke@assembledmedia.com.au" } },
  }))
}

test("non-admin is refused on the unlinked contact routes", { skip }, async () => {
  queries.length = 0
  forbid()
  const getResponse = await GET(new NextRequest("http://localhost/api/finance/xero/contact-links/unlinked"))
  const postResponse = await POST(
    new NextRequest("http://localhost/api/finance/xero/contact-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ xeroContactId: "contact-1", clientId: 9 }),
    }),
  )
  assert.equal(getResponse.status, 403)
  assert.equal(postResponse.status, 403)
  assert.equal(queries.length, 0)
  allow()
})

test("POST writes one xero_contact_links row with learned_from manual_link", { skip }, async () => {
  queries.length = 0
  allow()
  const response = await POST(
    new NextRequest("http://localhost/api/finance/xero/contact-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ xeroContactId: "contact-1", clientId: 9 }),
    }),
  )
  assert.equal(response.status, 200)
  const inserts = queries.filter((query) => query.text.includes("INSERT INTO xero_contact_links"))
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0]?.values.includes("manual_link"), true)
  assert.equal(inserts[0]?.values.includes("contact-1"), true)
  assert.equal(inserts[0]?.values.includes(9), true)
  const body = (await response.json()) as { coverage?: { linked?: number; total?: number } }
  assert.equal(typeof body.coverage?.linked, "number")
  assert.equal(typeof body.coverage?.total, "number")
})
