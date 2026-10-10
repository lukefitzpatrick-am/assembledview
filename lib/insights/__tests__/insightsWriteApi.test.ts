import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

type AdminGateResult =
  | {
      session: { user: { email: string } }
      roles: string[]
      clientSlug: null
      grantedByAllowlist: boolean
    }
  | { response: Response }

type InsightRow = {
  id: number
  mbaNumber: string
  clientId: number
  period: string | null
  insightType: string
  body: string
  source: string
  confidence: null
  createdBy: string
  createdAt: string
  supersededBy: null
  supersededAt: null
}

const requireAdminMock = mock.fn(async (_req: unknown): Promise<AdminGateResult> => ({
  session: { user: { email: "admin@example.com" } },
  roles: ["admin"] as string[],
  clientSlug: null,
  grantedByAllowlist: false,
}))

const createCampaignInsightMock = mock.fn(async (_input: unknown): Promise<InsightRow> => ({
  id: 99,
  mbaNumber: "bicau001",
  clientId: 9,
  period: null,
  insightType: "delivery",
  body: "Human note",
  source: "human",
  confidence: null,
  createdBy: "admin@example.com",
  createdAt: "2026-08-11T00:00:00Z",
  supersededBy: null,
  supersededAt: null,
}))

const editCampaignInsightMock = mock.fn(async (_input: unknown) => ({
  row: {
    id: 99,
    mbaNumber: "bicau001",
    clientId: 9,
    period: null,
    insightType: "delivery",
    body: "Edited",
    source: "human",
    confidence: null,
    createdBy: "admin@example.com",
    createdAt: "2026-08-11T00:00:00Z",
    supersededBy: null,
    supersededAt: null,
  },
  mode: "edit" as const,
}))

const listCampaignInsightsMock = mock.fn(async () => [] as unknown[])

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireAdmin: requireAdminMock,
      requireRole: requireAdminMock,
    },
  })
  await mock.module!("@/lib/insights/queryCampaignInsights", {
    namedExports: {
      listCampaignInsights: listCampaignInsightsMock,
    },
  })
  await mock.module!("@/lib/insights/writeCampaignInsights", {
    namedExports: {
      createCampaignInsight: createCampaignInsightMock,
      editCampaignInsight: editCampaignInsightMock,
      WriteInsightError: class WriteInsightError extends Error {
        code: string
        constructor(code: string, message: string) {
          super(message)
          this.code = code
        }
      },
    },
  })
}

test("DELETE is not exported on /api/insights — no delete path", { skip }, async () => {
  const mod = await import("../../../app/api/insights/route.js")
  assert.equal("DELETE" in mod, false)
  assert.equal(typeof (mod as { DELETE?: unknown }).DELETE, "undefined")
})

test("DELETE is not exported on /api/insights/[id] — no delete path", { skip }, async () => {
  const mod = await import("../../../app/api/insights/[id]/route.js")
  assert.equal("DELETE" in mod, false)
  assert.equal(typeof (mod as { DELETE?: unknown }).DELETE, "undefined")
})

test("POST /api/insights — client-role gets 403", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  createCampaignInsightMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  }))

  const { POST } = await import("../../../app/api/insights/route.js")
  const { NextRequest } = await import("next/server")
  const res = await POST(
    new NextRequest("http://localhost/api/insights", {
      method: "POST",
      body: JSON.stringify({
        clientId: 9,
        mbaNumber: "bicau001",
        body: "Note",
        insightType: "delivery",
      }),
      headers: { "Content-Type": "application/json" },
    }),
  )
  assert.equal(res.status, 403)
  assert.equal(createCampaignInsightMock.mock.calls.length, 0)
})

test("POST /api/insights — admin creates human insight", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  createCampaignInsightMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "Admin@Example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  createCampaignInsightMock.mock.mockImplementation(async (input: unknown) => ({
    id: 7,
    mbaNumber: "bicau001",
    clientId: 9,
    period: "2026-08",
    insightType: "delivery",
    body: "Quick note",
    source: "human",
    confidence: null,
    createdBy: "admin@example.com",
    createdAt: "2026-08-11T00:00:00Z",
    supersededBy: null,
    supersededAt: null,
    ...(typeof input === "object" && input ? {} : {}),
  }))

  const { POST } = await import("../../../app/api/insights/route.js")
  const { NextRequest } = await import("next/server")
  const res = await POST(
    new NextRequest("http://localhost/api/insights", {
      method: "POST",
      body: JSON.stringify({
        clientId: 9,
        mbaNumber: "BICAU001",
        body: "Quick note",
        insightType: "delivery",
        period: "2026-08",
      }),
      headers: { "Content-Type": "application/json" },
    }),
  )
  assert.equal(res.status, 201)
  assert.equal(createCampaignInsightMock.mock.calls.length, 1)
  const arg = createCampaignInsightMock.mock.calls[0]!.arguments[0] as Record<string, unknown>
  assert.equal(arg.createdBy, "admin@example.com")
  assert.equal(arg.body, "Quick note")
})

test("POST /api/insights — accepts and returns action, owner and outcome", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  createCampaignInsightMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  createCampaignInsightMock.mock.mockImplementation(async (input: Record<string, unknown>) => ({
    id: 18,
    mbaNumber: "krusty001",
    clientId: 12,
    period: null,
    insightType: "delivery",
    body: "Krabby Patties sold through by Thursday.",
    action: input.action,
    actionOwner: input.actionOwner,
    outcome: input.outcome,
    outcomeKind: input.outcomeKind,
    source: "human",
    confidence: null,
    createdBy: "admin@example.com",
    createdAt: "2026-10-10T00:00:00Z",
    supersededBy: null,
    supersededAt: null,
  }))

  const { POST } = await import("../../../app/api/insights/route.js")
  const { NextRequest } = await import("next/server")
  const res = await POST(
    new NextRequest("http://localhost/api/insights", {
      method: "POST",
      body: JSON.stringify({
        clientId: 12,
        mbaNumber: "krusty001",
        body: "Krabby Patties sold through by Thursday.",
        insightType: "delivery",
        action: "Restock the formula",
        actionOwner: "Assembled",
        outcome: "Thursday sell-through holds",
        outcomeKind: "expected",
      }),
      headers: { "Content-Type": "application/json" },
    }),
  )
  assert.equal(res.status, 201)
  const arg = createCampaignInsightMock.mock.calls[0]!.arguments[0] as Record<string, unknown>
  assert.equal(arg.action, "Restock the formula")
  assert.equal(arg.actionOwner, "Assembled")
  assert.equal(arg.outcome, "Thursday sell-through holds")
  assert.equal(arg.outcomeKind, "expected")
  const json = (await res.json()) as { item: Record<string, unknown> }
  assert.equal(json.item.action, "Restock the formula")
  assert.equal(json.item.actionOwner, "Assembled")
  assert.equal(json.item.outcome, "Thursday sell-through holds")
  assert.equal(json.item.outcomeKind, "expected")
})

test("POST /api/insights — rejects an outcome kind outside the check", { skip }, async () => {
  requireAdminMock.mock.resetCalls()
  createCampaignInsightMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))

  const { POST } = await import("../../../app/api/insights/route.js")
  const { NextRequest } = await import("next/server")
  const res = await POST(
    new NextRequest("http://localhost/api/insights", {
      method: "POST",
      body: JSON.stringify({
        clientId: 12,
        body: "A note",
        insightType: "delivery",
        outcomeKind: "maybe",
      }),
      headers: { "Content-Type": "application/json" },
    }),
  )
  assert.equal(res.status, 400)
  assert.equal(createCampaignInsightMock.mock.calls.length, 0)
  const json = (await res.json()) as { message?: string }
  assert.match(json.message ?? "", /achieved or expected/)
})
