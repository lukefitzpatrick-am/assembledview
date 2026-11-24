/**
 * S14 fix: GET /api/finance/send-to-accounts?preview=1 carries `held` only
 * when the pack holds something, so with the switch off the preview is the
 * same as before S14. Run with --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const hold = { invoiceKey: "media:AC-001:2026-05", persistedId: 11, abovePlanCents: 4321 }
let held: unknown[] = []

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireFinanceAdmin: async () => ({ session: { user: { sub: "auth0|luke" } }, roles: ["admin"] }) },
  })
  await mock.module("@/lib/auth/getCurrentUser", { namedExports: { getCurrentUser: async () => null } })
  await mock.module("@/lib/finance/loadAccountsPack", {
    namedExports: {
      loadAccountsPack: async () => ({ rows: [], held, records: [], metaByClientId: new Map() }),
    },
  })
}

const { GET } = await import("../route")

async function preview() {
  const prior = process.env.ACCOUNTS_NOTIFY_EMAIL
  process.env.ACCOUNTS_NOTIFY_EMAIL = "accounts@example.com"
  try {
    const res = await GET(new NextRequest("http://localhost/api/finance/send-to-accounts?preview=1&fy=2026&month=2026-05"))
    assert.equal(res.status, 200)
    return (await res.json()) as Record<string, unknown>
  } finally {
    if (prior === undefined) delete process.env.ACCOUNTS_NOTIFY_EMAIL
    else process.env.ACCOUNTS_NOTIFY_EMAIL = prior
  }
}

test("nothing held: the preview has no `held` key", { skip }, async () => {
  held = []
  const body = await preview()
  assert.equal("held" in body, false)
  assert.equal(body.fy, 2026)
})

test("a held invoice: the preview lists it under `held`", { skip }, async () => {
  held = [hold]
  assert.deepEqual((await preview()).held, [hold])
})
