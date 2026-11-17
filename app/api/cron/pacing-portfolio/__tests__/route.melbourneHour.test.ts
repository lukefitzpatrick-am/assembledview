/**
 * RELFIX1 (B49 R4, S31): the portfolio cron builds only in its Melbourne
 * hour (08:00 build, 08:30 retry), in AEDT and AEST. A run in the other
 * UTC slot answers `skipped` and builds nothing.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()
const runBuild = mock.fn(async (_args: { retry: boolean }) => ({ status: "already built" as const }))

if (typeof mock.module === "function") {
  await mock.module("@/lib/pacing/portfolio/runPortfolioCron", { namedExports: { runPortfolioCronBuild: runBuild } })
  await mock.module("@/lib/pacing/portfolio/buildAndStorePortfolioSnapshot", { namedExports: { buildAndStorePortfolioSnapshot: async () => null } })
  await mock.module("@/lib/pacing/portfolio/portfolioSnapshotStore", { namedExports: { readPortfolioSnapshot: async () => null } })
}

const SECRET = "test-cron-secret"

const CASES = [
  { at: "2026-06-15T21:00:00Z", retry: false, builds: false, label: "07:00 AEST, the AEDT slot" },
  { at: "2026-06-15T22:00:00Z", retry: false, builds: true, label: "08:00 AEST" },
  { at: "2026-06-15T21:30:00Z", retry: true, builds: false, label: "retry 07:30 AEST" },
  { at: "2026-06-15T22:30:00Z", retry: true, builds: true, label: "retry 08:30 AEST" },
  { at: "2026-12-15T21:00:00Z", retry: false, builds: true, label: "08:00 AEDT" },
  { at: "2026-12-15T22:00:00Z", retry: false, builds: false, label: "09:00 AEDT, the AEST slot" },
  { at: "2026-12-15T21:30:00Z", retry: true, builds: true, label: "retry 08:30 AEDT" },
] as const

for (const c of CASES) {
  test(`portfolio cron at ${c.label}: ${c.builds ? "builds" : "skipped"}`, { skip }, async (t) => {
    process.env.CRON_SECRET = SECRET
    runBuild.mock.resetCalls()
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(c.at) })
    const { GET } = await import("../route")
    const url = `http://localhost/api/cron/pacing-portfolio${c.retry ? "?retry=1" : ""}`
    const res = await GET(new Request(url, { headers: { authorization: `Bearer ${SECRET}` } }))
    assert.equal(res.status, 200)
    const body = (await res.json()) as { status: string }
    assert.equal(body.status, c.builds ? "already built" : "skipped")
    assert.equal(runBuild.mock.callCount(), c.builds ? 1 : 0)
    if (c.builds) assert.equal(runBuild.mock.calls[0]!.arguments[0].retry, c.retry)
  })
}
