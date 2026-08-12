/**
 * Capture spend-by-MBA + orphan baseline for case-norm reconciliation.
 * Usage: npx tsx scripts/snowflake/mba-case-norm-baseline.mjs [out.json]
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import snowflake from "snowflake-sdk"

snowflake.configure({ logLevel: "ERROR" })

for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/)
  if (!m) continue
  let v = m[2].trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1)
  }
  if (process.env[m[1]] === undefined) process.env[m[1]] = v
}

function privateKey() {
  const b64 = process.env.SNOWFLAKE_PRIVATE_KEY_B64?.trim()
  if (b64) {
    return Buffer.from(b64, "base64").toString("utf8").replace(/\r\n/g, "\n").trim()
  }
  const p = process.env.SNOWFLAKE_PRIVATE_KEY_PATH
  if (p && existsSync(p)) {
    return readFileSync(p, "utf8").replace(/\r\n/g, "\n").trim()
  }
  throw new Error("Missing Snowflake private key")
}

function connect() {
  return new Promise((resolveConn, reject) => {
    const conn = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT,
      username: process.env.SNOWFLAKE_USERNAME,
      authenticator: "SNOWFLAKE_JWT",
      privateKey: privateKey(),
      role: process.env.SNOWFLAKE_ROLE,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE,
      database: process.env.SNOWFLAKE_DATABASE,
      schema: process.env.SNOWFLAKE_SCHEMA,
    })
    conn.connect((err) => (err ? reject(err) : resolveConn(conn)))
  })
}

function exec(conn, sqlText) {
  return new Promise((resolveRows, reject) => {
    conn.execute({
      sqlText,
      complete: (err, _stmt, rows) => (err ? reject(err) : resolveRows(rows || [])),
    })
  })
}

const outPath = resolve(process.argv[2] || "scripts/snowflake/_before_spend.json")
const conn = await connect()

const spend = await exec(
  conn,
  `
WITH facts AS (
  SELECT LOWER(TRIM(LINE_ITEM_ID)) AS LID, AMOUNT_SPENT::FLOAT AS SPEND
  FROM ASSEMBLEDVIEW.MART.PACING_FACT
  UNION ALL
  SELECT LOWER(TRIM(LINE_ITEM_ID)), AMOUNT_SPENT::FLOAT
  FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
  UNION ALL
  SELECT LOWER(TRIM(LINE_ITEM_ID)), AMOUNT_SPENT::FLOAT
  FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
),
joined AS (
  SELECT LOWER(TRIM(s.MBA_NUMBER)) AS MBA, SUM(f.SPEND) AS SPEND
  FROM facts f
  INNER JOIN ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
    ON LOWER(TRIM(s.LINE_ITEM_ID)) = f.LID
  GROUP BY 1
)
SELECT MBA, ROUND(SPEND, 2) AS SPEND FROM joined ORDER BY MBA
`
)

const total = spend.reduce((a, r) => a + Number(r.SPEND), 0)

const orphans = await exec(
  conn,
  `
SELECT COUNT(*) AS ORPHAN_GROUPS FROM (
  SELECT CHANNEL, PLATFORM_LINE_ITEM_ID
  FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
  WHERE PLATFORM_LINE_ITEM_ID IS NOT NULL
    AND (
      LINE_ITEM_ID IS NULL
      OR TRIM(LINE_ITEM_ID) = ''
      OR LOWER(TRIM(LINE_ITEM_ID)) = LOWER(TRIM(PLATFORM_LINE_ITEM_ID))
    )
  GROUP BY 1, 2
)
`
)

const sePairs = await exec(
  conn,
  `
WITH s AS (
  SELECT LOWER(TRIM(LINE_ITEM_ID)) AS LID, SUM(AMOUNT_SPENT)::FLOAT AS SPEND
  FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
  WHERE REGEXP_LIKE(LOWER(TRIM(LINE_ITEM_ID)), '.*se[12]$')
  GROUP BY 1
)
SELECT LID, ROUND(SPEND, 2) AS SPEND FROM s ORDER BY LID
`
)

const payload = {
  captured_at: new Date().toISOString(),
  total_spend: Number(total.toFixed(2)),
  mba_count: spend.length,
  mba_spend: Object.fromEntries(spend.map((r) => [r.MBA, Number(r.SPEND)])),
  orphan_groups: Number(orphans[0].ORPHAN_GROUPS),
  se_line_spend: Object.fromEntries(sePairs.map((r) => [r.LID, Number(r.SPEND)])),
}

writeFileSync(outPath, JSON.stringify(payload, null, 2))
console.log(
  JSON.stringify({
    outPath,
    total_spend: payload.total_spend,
    mba_count: payload.mba_count,
    orphan_groups: payload.orphan_groups,
    se_ids: sePairs.length,
  })
)

conn.destroy(() => process.exit(0))
