/**
 * GET /api/codex/time/summary — gate + mba normalize + math via mocked repo.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const auth0GetSession = mock.fn(
  async () => null as null | { user: { email?: string; roles?: string[] } }
)

const getMbaTimeSummary = mock.fn(
  async (_mba: string) => ({
    mba_number: "foo001",
    total_hours: 2.5,
    total_minutes: 150,
    by_member: [
      {
        member_email: "a@example.com",
        hours: 2.5,
        duration_minutes: 150,
      },
    ],
    sparkline_weeks: [0, 0, 1, 1.5],
    week_starts: ["2025-07-14", "2025-07-21", "2025-07-28", "2025-08-04"],
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
  await mock.module!("@/lib/myhours/timeSummary", {
    namedExports: {
      getMbaTimeSummary,
    },
  })
}

async function withFlagOn<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.CODEX_V2
  process.env.CODEX_V2 = "on"
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env.CODEX_V2
    else process.env.CODEX_V2 = prev
  }
}

test(
  "GET /api/codex/time/summary: client role forbidden; admin gets rounded hours",
  { skip },
  async () => {
    const { GET } = await import("../../../app/api/codex/time/summary/route.js")

    await withFlagOn(async () => {
      auth0GetSession.mock.mockImplementation(async () => ({
        user: { email: "c@x.com", roles: ["client"] },
      }))
      const forbidden = await GET(
        new Request("http://localhost/api/codex/time/summary?mba=FOO001")
      )
      assert.equal(forbidden.status, 403)

      auth0GetSession.mock.mockImplementation(async () => ({
        user: { email: "a@x.com", roles: ["admin"] },
      }))
      getMbaTimeSummary.mock.resetCalls()
      const ok = await GET(
        new Request("http://localhost/api/codex/time/summary?mba=FOO001")
      )
      assert.equal(ok.status, 200)
      const body = (await ok.json()) as {
        total_hours: number
        mba_number: string
      }
      assert.equal(body.total_hours, 2.5)
      assert.equal(getMbaTimeSummary.mock.callCount(), 1)
      assert.equal(
        (getMbaTimeSummary.mock.calls[0]?.arguments as unknown[])?.[0],
        "FOO001"
      )

      const bad = await GET(
        new Request("http://localhost/api/codex/time/summary")
      )
      assert.equal(bad.status, 400)
    })
  }
)
