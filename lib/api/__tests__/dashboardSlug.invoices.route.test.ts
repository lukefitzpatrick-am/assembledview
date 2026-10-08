/**
 * Tenant slug membership and the client-invoices flag for
 * GET /api/dashboard/[slug]/invoices.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const getSessionMock = mock.fn(async (_req?: unknown) => null as null | { user: Record<string, unknown> })
const fetchRowMock = mock.fn(async (_slug: string) => null as null | Record<string, unknown>)
const fetchGroupMock = mock.fn(async (_slug: string) => null as null | {
  anchor: Record<string, unknown>
  members: Record<string, unknown>[]
  mbaidentifier: string | null
  nameSlugs: Set<string>
})
const loadMock = mock.fn(async (_clientId: number) => ({
  totalBasis: "inc_gst" as const,
  invoices: [
    {
      xeroInvoiceId: "inv-1",
      invoiceNumber: "INV-1",
      issueDate: "2026-08-01",
      dueDate: "2026-08-15",
      totalCents: 11000,
      amountDueCents: 11000,
      amountPaidCents: 0,
      fullyPaidDate: null,
      mbaNumber: "ACME001",
      hasPdf: true,
      state: "overdue" as const,
      daysOverdue: 10,
    },
  ],
  summary: {
    outstandingCents: 11000,
    overdueCents: 11000,
    overdueCount: 1,
    oldestOverdueDueDate: "2026-08-15",
  },
}))

let invoicesEnabled = true

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: getSessionMock },
    },
  })
  await mock.module!("@/lib/clients/fetchClientRowByUrlSlug", {
    namedExports: {
      fetchXanoClientRowByUrlSlug: fetchRowMock,
      fetchClientGroupByUrlSlug: fetchGroupMock,
    },
  })
  await mock.module!("@/lib/finance/invoices/clientInvoices", {
    namedExports: {
      isClientInvoicesEnabled: () => invoicesEnabled,
      loadClientInvoicesForClient: loadMock,
    },
  })
}

const ROLE_CLAIM = "https://assembledview.com/roles"

function clientUser(slugs: string[]) {
  return {
    email: "client@example.com",
    [ROLE_CLAIM]: ["client"],
    app_metadata: {
      role: "client",
      client_slug: slugs[0] ?? "",
      client_slugs: slugs,
    },
  }
}

function adminUser() {
  return {
    email: "admin@example.com",
    [ROLE_CLAIM]: ["admin"],
    app_metadata: { role: "admin" },
  }
}

function groupFor(id: number) {
  return {
    anchor: { id },
    members: [{ id }],
    mbaidentifier: null,
    nameSlugs: new Set<string>(),
  }
}

async function getInvoices(slug: string) {
  const { GET } = await import("../../../app/api/dashboard/[slug]/invoices/route.js")
  return GET(new NextRequest(`http://localhost/api/dashboard/${slug}/invoices`), {
    params: Promise.resolve({ slug }),
  })
}

test("GET /api/dashboard/[slug]/invoices — admin sees the list with the flag off", { skip }, async () => {
  invoicesEnabled = false
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({ user: adminUser() }))
  fetchRowMock.mock.resetCalls()
  fetchRowMock.mock.mockImplementation(async () => ({ id: 7, slug: "acme" }))
  fetchGroupMock.mock.resetCalls()
  loadMock.mock.resetCalls()

  const res = await getInvoices("acme")
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.totalBasis, "inc_gst")
  assert.equal(body.invoices[0].xeroInvoiceId, "inv-1")
  assert.equal(loadMock.mock.calls[0]?.arguments[0], 7)
})

test("GET /api/dashboard/[slug]/invoices — client sees only their own client id", { skip }, async () => {
  invoicesEnabled = true
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({ user: clientUser(["acme"]) }))
  fetchRowMock.mock.resetCalls()
  fetchRowMock.mock.mockImplementation(async () => ({ id: 7, slug: "acme" }))
  fetchGroupMock.mock.resetCalls()
  fetchGroupMock.mock.mockImplementation(async () => groupFor(7))
  loadMock.mock.resetCalls()

  const res = await getInvoices("acme")
  assert.equal(res.status, 200)
  assert.equal(loadMock.mock.calls.length, 1)
  assert.equal(loadMock.mock.calls[0]?.arguments[0], 7)
  assert.equal(fetchRowMock.mock.calls[0]?.arguments[0], "acme")
})

test("GET /api/dashboard/[slug]/invoices — client of slug A requesting slug B is refused", { skip }, async () => {
  invoicesEnabled = true
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({ user: clientUser(["acme"]) }))
  fetchRowMock.mock.resetCalls()
  loadMock.mock.resetCalls()

  const res = await getInvoices("other-co")
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
  assert.equal(fetchRowMock.mock.calls.length, 0)
  assert.equal(loadMock.mock.calls.length, 0)
})

test("GET /api/dashboard/[slug]/invoices — flag off, a client gets 404", { skip }, async () => {
  invoicesEnabled = false
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({ user: clientUser(["acme"]) }))
  fetchRowMock.mock.resetCalls()
  loadMock.mock.resetCalls()

  const res = await getInvoices("acme")
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: "not found" })
  assert.equal(fetchRowMock.mock.calls.length, 0)
  assert.equal(loadMock.mock.calls.length, 0)
})
