/**
 * /api/codex/time/proposals — internal auth and route wiring.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const auth0GetSession = mock.fn(
  async () => null as null | { user: { email?: string; roles?: string[] } }
)
const listTimeEntryProposalsForWeek = mock.fn(async (_weekStart: string) => [
  {
    id: 41,
    entryDate: "2026-08-10",
    clientName: "Acme",
    campaignName: "Launch",
  },
])
const confirmTimeEntryProposal = mock.fn(
  async (_id: number, _actor: string, _deps: unknown) => ({
    status: "confirmed",
    myhoursLogId: "901",
  })
)
const skipTimeEntryProposal = mock.fn(
  async (_id: number, _actor: string, _deps: unknown) => ({
    status: "skipped",
  })
)

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: auth0GetSession },
    },
  })
  await mock.module!("@/lib/rbac", {
    namedExports: {
      getUserRoles: (user: { roles?: string[] }) => user.roles ?? [],
    },
  })
  await mock.module!("@/lib/myhours/proposalRepo", {
    namedExports: {
      listTimeEntryProposalsForWeek,
      loadTimeEntryProposal: async () => null,
      updateTimeEntryProposal: async () => undefined,
      loadTimeEntryProposalContext: async () => null,
      listMyHoursLinks: async () => [],
      saveMyHoursLink: async () => undefined,
      listSameDayTimeEntries: async () => [],
    },
  })
  await mock.module!("@/lib/myhours/timeEntryProposals", {
    namedExports: {
      confirmTimeEntryProposal,
      skipTimeEntryProposal,
    },
  })
  await mock.module!("@/lib/myhours/client", {
    namedExports: {
      MyHoursClient: class {
        listUsers = async () => []
        createTimeLog = async () => ({ id: 1 })
      },
    },
  })
  await mock.module!("@/lib/myhours/ensureOneStructure", {
    namedExports: {
      ensureClientCampaignStructure: async () => ({
        ok: false,
        reason: "unused in route test",
      }),
    },
  })
}

async function withFlagOn<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.CODEX_V2
  process.env.CODEX_V2 = "on"
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.CODEX_V2
    else process.env.CODEX_V2 = previous
  }
}

function setRole(role: "admin" | "client") {
  auth0GetSession.mock.mockImplementation(async () => ({
    user: { email: `${role}@example.com`, roles: [role] },
  }))
}

test("GET time proposals forbids clients and lists an admin week", { skip }, async () => {
  const { GET } = await import(
    "../../../app/api/codex/time/proposals/route.js"
  )

  await withFlagOn(async () => {
    setRole("client")
    const forbidden = await GET(
      new Request(
        "http://localhost/api/codex/time/proposals?week_start=2026-08-10"
      )
    )
    assert.equal(forbidden.status, 403)

    setRole("admin")
    listTimeEntryProposalsForWeek.mock.resetCalls()
    const response = await GET(
      new Request(
        "http://localhost/api/codex/time/proposals?week_start=2026-08-10"
      )
    )
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      week_start: "2026-08-10",
      week_end: "2026-08-16",
      proposals: [
        {
          id: 41,
          entryDate: "2026-08-10",
          clientName: "Acme",
          campaignName: "Launch",
        },
      ],
    })
    assert.equal(
      (listTimeEntryProposalsForWeek.mock.calls[0]?.arguments as unknown[])?.[0],
      "2026-08-10"
    )

    const invalid = await GET(
      new Request(
        "http://localhost/api/codex/time/proposals?week_start=2026-08-11"
      )
    )
    assert.equal(invalid.status, 400)
  })
})

test("POST confirm forbids clients and confirms for admins", { skip }, async () => {
  const { POST } = await import(
    "../../../app/api/codex/time/proposals/[id]/confirm/route.js"
  )
  const context = { params: Promise.resolve({ id: "41" }) }

  await withFlagOn(async () => {
    setRole("client")
    assert.equal(
      (await POST(new Request("http://localhost"), context)).status,
      403
    )

    setRole("admin")
    confirmTimeEntryProposal.mock.resetCalls()
    const response = await POST(new Request("http://localhost"), context)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      status: "confirmed",
      myhoursLogId: "901",
    })
    assert.deepEqual(
      (confirmTimeEntryProposal.mock.calls[0]?.arguments as unknown[])?.slice(
        0,
        2
      ),
      [41, "admin@example.com"]
    )
  })
})

test("POST skip forbids clients and skips for admins", { skip }, async () => {
  const { POST } = await import(
    "../../../app/api/codex/time/proposals/[id]/skip/route.js"
  )
  const context = { params: Promise.resolve({ id: "41" }) }

  await withFlagOn(async () => {
    setRole("client")
    assert.equal(
      (await POST(new Request("http://localhost"), context)).status,
      403
    )

    setRole("admin")
    skipTimeEntryProposal.mock.resetCalls()
    const response = await POST(new Request("http://localhost"), context)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: "skipped" })
    assert.deepEqual(
      (skipTimeEntryProposal.mock.calls[0]?.arguments as unknown[])?.slice(0, 2),
      [41, "admin@example.com"]
    )
  })
})
