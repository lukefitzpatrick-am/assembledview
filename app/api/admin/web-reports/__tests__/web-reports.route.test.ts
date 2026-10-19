/**
 * GET /api/admin/web-reports
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

type AdminGate =
  | { session: { user: { email: string; sub: string } } }
  | { response: NextResponse }

const requireAdminMock = mock.fn(async (): Promise<AdminGate> => ({
  session: { user: { email: "admin@assembled.media", sub: "admin-1" } },
}))

const listMock = mock.fn(async () => ({
  ready: true,
  rows: [],
}))

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireAdmin: requireAdminMock },
  })
  await mock.module("@/lib/webReport/admin/load", {
    namedExports: { loadAdminWebReportList: listMock },
  })
}

function denied(status: number, error: string): AdminGate {
  return { response: NextResponse.json({ error }, { status }) }
}

test("GET /api/admin/web-reports — a non-admin is 403", { skip }, async () => {
  requireAdminMock.mock.mockImplementation(async () => denied(403, "Forbidden"))
  listMock.mock.resetCalls()
  const { GET } = await import("../route.js")
  const res = await GET(new NextRequest("http://localhost/api/admin/web-reports"))
  assert.equal(res.status, 403)
  assert.equal(listMock.mock.calls.length, 0)
})
