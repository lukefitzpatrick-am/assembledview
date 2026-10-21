import assert from "node:assert/strict"
import test from "node:test"
import postgres from "postgres"

import { loadEnvLocalForTests } from "../../testing/loadEnvLocalForTests"
import { safeTestDirectUrl } from "../../testing/testDatabaseGuard"

function loadUrl(): string | null {
  // Guarded: refuses the production URLs in .env.local (see testDatabaseGuard).
  loadEnvLocalForTests()
  return safeTestDirectUrl()
}

test("EXPLAIN client live query uses idx_campaign_insights_live", async (t) => {
  const url = loadUrl()
  if (!url) {
    t.skip("No DATABASE_URL/DIRECT_URL — skipping live EXPLAIN")
    return
  }

  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  try {
    let sample: { client_id: string }[]
    try {
      sample = await sql<{ client_id: string }[]>`
        SELECT client_id::text AS client_id
        FROM campaign_insights
        WHERE superseded_by IS NULL
        LIMIT 1
      `
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code)
          : ""
      if (
        code === "ENOTFOUND" ||
        code === "ECONNREFUSED" ||
        code === "ETIMEDOUT" ||
        code === "ECONNRESET"
      ) {
        t.skip(`DB unreachable (${code}) — skipping live EXPLAIN`)
        return
      }
      throw err
    }
    const clientId = sample[0]?.client_id ? Number(sample[0].client_id) : 1

    const plan = await sql<Array<{ "QUERY PLAN": string }>>`
      EXPLAIN (FORMAT TEXT)
      SELECT id, mba_number, client_id, created_at
      FROM campaign_insights
      WHERE client_id = ${clientId}
        AND superseded_by IS NULL
      ORDER BY created_at DESC
      LIMIT 5
    `
    const text = plan.map((r) => r["QUERY PLAN"]).join("\n")
    console.log("[insights EXPLAIN]\n" + text)
    assert.match(
      text,
      /idx_campaign_insights_live/i,
      `Expected idx_campaign_insights_live in plan, got:\n${text}`,
    )
  } finally {
    await sql.end({ timeout: 5 })
  }
})
