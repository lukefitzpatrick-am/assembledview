/**
 * Collapse case-alias duplicate PKs in XANO_LINE_ITEMS_SNAPSHOT, then lower.
 * Requires DELETE+INSERT (AV_APP_WRITE_ROLE has both).
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

const conn = await new Promise((res, rej) => {
  const c = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    authenticator: "SNOWFLAKE_JWT",
    privateKey: privateKey(),
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
  })
  c.connect((e) => (e ? rej(e) : res(c)))
})

function exec(sql, label = "stmt") {
  return new Promise((res, rej) => {
    const t0 = Date.now()
    console.log(`[exec] ${label}`)
    conn.execute({
      sqlText: sql,
      complete: (e, _, rows) => {
        if (e) {
          console.error(`[fail] ${label}`, e.message)
          rej(e)
          return
        }
        console.log(`[ok] ${label} ${Date.now() - t0}ms`)
        res(rows || [])
      },
    })
  })
}

const before = await exec(
  `
  SELECT COUNT(*) AS C,
    COUNT_IF(
      REGEXP_LIKE(COALESCE(LINE_ITEM_ID::VARCHAR, ''), '.*[A-Z].*')
      OR REGEXP_LIKE(COALESCE(LINE_ITEM_NAME::VARCHAR, ''), '.*[A-Z].*')
    ) AS UPPERCASE_ROWS,
    COUNT(DISTINCT LOWER(TRIM(LINE_ITEM_ID))) AS DISTINCT_LOWER_IDS
  FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
`,
  "before-counts"
)

const collisionStats = await exec(
  `
  SELECT COUNT(*) AS COLLISION_KEYS, SUM(C - 1) AS EXTRA_ROWS FROM (
    SELECT LOWER(TRIM(LINE_ITEM_ID)) AS LID, COUNT(*) AS C
    FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
    GROUP BY 1 HAVING COUNT(*) > 1
  )
`,
  "collision-stats"
)

writeFileSync(
  resolve("scripts/snowflake/_snapshot_fold_plan.json"),
  JSON.stringify(
    {
      before: {
        row_count: Number(before[0].C),
        uppercase_rows: Number(before[0].UPPERCASE_ROWS),
        distinct_lower_ids: Number(before[0].DISTINCT_LOWER_IDS),
      },
      collisions: {
        keys: Number(collisionStats[0].COLLISION_KEYS),
        extra_rows_to_drop: Number(collisionStats[0].EXTRA_ROWS),
      },
      expected_after_count: Number(before[0].DISTINCT_LOWER_IDS),
    },
    null,
    2
  )
)

// Stage deduped lower rows in a table we can write (use session temp via CREATE TEMPORARY)
await exec(
  `
CREATE OR REPLACE TEMPORARY TABLE TMP_SNAPSHOT_LOWER AS
SELECT
  LOWER(TRIM(LINE_ITEM_ID)) AS LINE_ITEM_ID,
  LOWER(TRIM(COALESCE(MBA_NUMBER, ''))) AS MBA_NUMBER,
  LOWER(TRIM(COALESCE(LINE_ITEM_NAME, ''))) AS LINE_ITEM_NAME,
  PLATFORM,
  BUY_TYPE,
  FIXED_COST_MEDIA,
  BURSTS_JSON,
  SOURCE_TABLE,
  XANO_ROW_ID,
  XANO_CREATED_AT,
  SYNCED_AT
FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY LOWER(TRIM(LINE_ITEM_ID))
  ORDER BY COALESCE(XANO_CREATED_AT, 0) DESC, COALESCE(XANO_ROW_ID, 0) DESC
) = 1
`,
  "create-tmp"
)

const tmpCount = await exec(
  `SELECT COUNT(*) AS C FROM TMP_SNAPSHOT_LOWER`,
  "tmp-count"
)
if (Number(tmpCount[0].C) !== Number(before[0].DISTINCT_LOWER_IDS)) {
  throw new Error(
    `tmp count ${tmpCount[0].C} != distinct lower ${before[0].DISTINCT_LOWER_IDS}`
  )
}

await exec(`DELETE FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT`, "delete-all")
await exec(
  `
INSERT INTO ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT (
  LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME, PLATFORM, BUY_TYPE,
  FIXED_COST_MEDIA, BURSTS_JSON, SOURCE_TABLE, XANO_ROW_ID, XANO_CREATED_AT, SYNCED_AT
)
SELECT
  LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME, PLATFORM, BUY_TYPE,
  FIXED_COST_MEDIA, BURSTS_JSON, SOURCE_TABLE, XANO_ROW_ID, XANO_CREATED_AT, SYNCED_AT
FROM TMP_SNAPSHOT_LOWER
`,
  "reload"
)

const after = await exec(
  `
  SELECT COUNT(*) AS C,
    COUNT_IF(
      REGEXP_LIKE(COALESCE(LINE_ITEM_ID::VARCHAR, ''), '.*[A-Z].*')
      OR REGEXP_LIKE(COALESCE(LINE_ITEM_NAME::VARCHAR, ''), '.*[A-Z].*')
    ) AS UPPERCASE_ROWS
  FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
`,
  "after-counts"
)

console.log(
  JSON.stringify({
    before_rows: Number(before[0].C),
    after_rows: Number(after[0].C),
    dropped_case_aliases: Number(before[0].C) - Number(after[0].C),
    uppercase_after: Number(after[0].UPPERCASE_ROWS),
  })
)

conn.destroy(() => process.exit(0))
