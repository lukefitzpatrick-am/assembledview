import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import postgres from "postgres"

function loadUrl(): string | null {
  try {
    const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    const pick = (key: string) => {
      const m =
        env.match(new RegExp(`${key}="([^"]+)"`)) ||
        env.match(new RegExp(`${key}=([^\\r\\n]+)`))
      return (m?.[1] || "").trim()
    }
    return pick("DIRECT_URL") || pick("DATABASE_URL") || null
  } catch {
    return null
  }
}

test("EXPLAIN client live query uses idx_campaign_insights_live", async (t) => {
  const url = loadUrl()
  if (!url) {
    t.skip("No DATABASE_URL/DIRECT_URL — skipping live EXPLAIN")
    return
  }

  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  try {
    const sample = await sql<{ client_id: string }[]>`
      SELECT client_id::text AS client_id
      FROM campaign_insights
      WHERE superseded_by IS NULL
      LIMIT 1
    `
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
