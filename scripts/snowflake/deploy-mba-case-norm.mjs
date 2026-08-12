/**
 * Deploy MART view LOWER() normalisation + full-history fact backfill +
 * snapshot case fold.
 *
 * PRIVILEGE REQUIREMENT: the connected role must OWN the MART pacing views and
 * have UPDATE/INSERT on PACING_FACT + SOCIAL_PACING_FACT. AV_APP_WRITE_ROLE
 * cannot do this today (views owned by ACCOUNTADMIN; fact tables SELECT-only
 * except SEARCH_PACING_FACT UPDATE). Set SNOWFLAKE_ROLE to a DDL/owner role
 * for the deploy session, then revert.
 *
 * Usage:
 *   npx tsx scripts/snowflake/deploy-mba-case-norm.mjs
 *   npx tsx scripts/snowflake/deploy-mba-case-norm.mjs --dry-run
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import snowflake from "snowflake-sdk"

snowflake.configure({ logLevel: "ERROR" })

const dryRun = process.argv.includes("--dry-run")

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

function exec(conn, sqlText, label = "stmt") {
  return new Promise((resolveRows, reject) => {
    const started = Date.now()
    console.log(`[exec] ${label}…`)
    if (dryRun) {
      console.log(`[dry-run] skipped (${sqlText.slice(0, 120).replace(/\s+/g, " ")}…)`)
      resolveRows([])
      return
    }
    conn.execute({
      sqlText,
      complete: (err, _stmt, rows) => {
        if (err) {
          console.error(`[fail] ${label} after ${Date.now() - started}ms`)
          reject(err)
          return
        }
        console.log(`[ok] ${label} ${Date.now() - started}ms`)
        resolveRows(rows || [])
      },
    })
  })
}

function stripUseSchema(sql) {
  return sql
    .replace(/USE SCHEMA\s+[^;]+;/gi, "")
    .trim()
}

function readSql(rel) {
  return stripUseSchema(readFileSync(resolve(rel), "utf8"))
}

/** Split on semicolons that end statements (naive but enough for our DDL files). */
function splitStatements(sql) {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--[^\n]*\n?)+$/s.test(s))
}

const VIEW_FILES = [
  "sql/snowflake/mart/views/vw_pacing_dv360.sql",
  "sql/snowflake/mart/views/vw_pacing_meta.sql",
  "sql/snowflake/mart/views/vw_pacing_tiktok.sql",
  "sql/snowflake/mart/views/vw_pacing_google_search_daily.sql",
]

const TASK_FILES = [
  "sql/snowflake/mart/tasks/tsk_refresh_pacing_fact.sql",
  "sql/snowflake/mart/tasks/tsk_refresh_social_pacing_fact.sql",
]

/** Full-history MERGE for PACING_FACT (no -14 day window). */
const PACING_FULL_BACKFILL = `
merge into ASSEMBLEDVIEW.MART.PACING_FACT t
using (
  with unioned as (
    select
      channel, date_day, line_item_name, line_item_id,
      entity_name, entity_id, campaign_name, amount_spent,
      impressions, clicks, results, video_3s_views,
      max_fivetran_synced_at::timestamp_ntz as max_fivetran_synced_at
    from ASSEMBLEDVIEW.MART.VW_PACING_DV360
  ),
  keyed as (
    select
      channel, date_day,
      lower(trim(entity_id::string)) as platform_line_item_id,
      line_item_id, line_item_name, entity_name, entity_id,
      campaign_name, amount_spent, impressions, clicks, results,
      video_3s_views, max_fivetran_synced_at
    from unioned
    where entity_id is not null and trim(entity_id::string) <> ''
  ),
  relabel as (
    select
      k.*,
      lower(trim(coalesce(m.line_item_id, k.line_item_id))) as final_line_item_id,
      lower(trim(coalesce(m.line_item_name, k.line_item_name))) as final_line_item_name
    from keyed k
    left join ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
      on lower(trim(m.channel)) = lower(trim(k.channel))
     and lower(trim(m.platform_line_item_id)) = lower(trim(k.platform_line_item_id))
     and m.is_active = true
  ),
  deduped as (
    select
      channel, date_day, platform_line_item_id,
      max(final_line_item_id) as line_item_id,
      max(final_line_item_name) as line_item_name,
      max(entity_name) as entity_name,
      max(entity_id) as entity_id,
      max(campaign_name) as campaign_name,
      sum(amount_spent) as amount_spent,
      sum(impressions) as impressions,
      sum(clicks) as clicks,
      sum(results) as results,
      sum(video_3s_views) as video_3s_views,
      max(max_fivetran_synced_at) as max_fivetran_synced_at
    from relabel
    group by 1,2,3
  )
  select *, current_timestamp() as updated_at from deduped
) s
on  t.channel = s.channel
and t.date_day = s.date_day
and lower(trim(t.platform_line_item_id)) = lower(trim(s.platform_line_item_id))
when matched then update set
  t.line_item_id = s.line_item_id,
  t.line_item_name = s.line_item_name,
  t.entity_name = s.entity_name,
  t.entity_id = s.entity_id,
  t.campaign_name = s.campaign_name,
  t.amount_spent = s.amount_spent,
  t.impressions = s.impressions,
  t.clicks = s.clicks,
  t.results = s.results,
  t.video_3s_views = s.video_3s_views,
  t.max_fivetran_synced_at = s.max_fivetran_synced_at,
  t.updated_at = current_timestamp()
when not matched then insert (
  channel, date_day, platform_line_item_id,
  line_item_id, line_item_name,
  entity_name, entity_id, campaign_name,
  amount_spent, impressions, clicks, results, video_3s_views,
  max_fivetran_synced_at, updated_at
) values (
  s.channel, s.date_day, s.platform_line_item_id,
  s.line_item_id, s.line_item_name,
  s.entity_name, s.entity_id, s.campaign_name,
  s.amount_spent, s.impressions, s.clicks, s.results, s.video_3s_views,
  s.max_fivetran_synced_at, current_timestamp()
)
`

const SOCIAL_FULL_BACKFILL = `
merge into ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT t
using (
  with unioned as (
    select channel, date_day, line_item_name, line_item_id, entity_name, entity_id,
           campaign_name, amount_spent, impressions, clicks, results, video_3s_views,
           max_fivetran_synced_at::timestamp_ntz as max_fivetran_synced_at
    from ASSEMBLEDVIEW.MART.VW_PACING_TIKTOK
    union all
    select channel, date_day, line_item_name, line_item_id, entity_name, entity_id,
           campaign_name, amount_spent, impressions, clicks, results, video_3s_views,
           max_fivetran_synced_at::timestamp_ntz
    from ASSEMBLEDVIEW.MART.VW_PACING_META
  ),
  keyed as (
    select channel, date_day,
           lower(trim(entity_id::string)) as platform_line_item_id,
           line_item_id, line_item_name, entity_name, entity_id,
           campaign_name, amount_spent, impressions, clicks, results,
           video_3s_views, max_fivetran_synced_at
    from unioned
    where entity_id is not null and trim(entity_id::string) <> ''
  ),
  relabel as (
    select k.*,
           lower(trim(coalesce(m.line_item_id, k.line_item_id))) as final_line_item_id,
           lower(trim(coalesce(m.line_item_name, k.line_item_name))) as final_line_item_name
    from keyed k
    left join ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
      on lower(trim(m.channel)) = lower(trim(k.channel))
     and lower(trim(m.platform_line_item_id)) = lower(trim(k.platform_line_item_id))
     and m.is_active = true
  ),
  deduped as (
    select channel, date_day, platform_line_item_id,
           max(final_line_item_id) as line_item_id,
           max(final_line_item_name) as line_item_name,
           max(entity_name) as entity_name, max(entity_id) as entity_id,
           max(campaign_name) as campaign_name,
           sum(amount_spent) as amount_spent, sum(impressions) as impressions,
           sum(clicks) as clicks, sum(results) as results,
           sum(video_3s_views) as video_3s_views,
           max(max_fivetran_synced_at) as max_fivetran_synced_at
    from relabel
    group by 1,2,3
  )
  select *, current_timestamp() as updated_at from deduped
) s
on  t.channel = s.channel
and t.date_day = s.date_day
and lower(trim(t.platform_line_item_id)) = lower(trim(s.platform_line_item_id))
when matched then update set
  t.line_item_id = s.line_item_id, t.line_item_name = s.line_item_name,
  t.entity_name = s.entity_name, t.entity_id = s.entity_id,
  t.campaign_name = s.campaign_name, t.amount_spent = s.amount_spent,
  t.impressions = s.impressions, t.clicks = s.clicks, t.results = s.results,
  t.video_3s_views = s.video_3s_views,
  t.max_fivetran_synced_at = s.max_fivetran_synced_at,
  t.updated_at = current_timestamp()
when not matched then insert (
  channel, date_day, platform_line_item_id, line_item_id, line_item_name,
  entity_name, entity_id, campaign_name, amount_spent, impressions, clicks,
  results, video_3s_views, max_fivetran_synced_at, updated_at
) values (
  s.channel, s.date_day, s.platform_line_item_id, s.line_item_id, s.line_item_name,
  s.entity_name, s.entity_id, s.campaign_name, s.amount_spent, s.impressions,
  s.clicks, s.results, s.video_3s_views, s.max_fivetran_synced_at, current_timestamp()
)
`

const SNAPSHOT_COLLISION_CHECK = `
SELECT LOWER(TRIM(LINE_ITEM_ID)) AS LID, COUNT(*) AS C
FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
GROUP BY 1
HAVING COUNT(*) > 1
`

/** In-place lower fold — refuses to run when case-only PK collisions exist. */
const SNAPSHOT_LOWER_UPDATE = `
UPDATE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
SET
  LINE_ITEM_ID = LOWER(TRIM(LINE_ITEM_ID)),
  MBA_NUMBER = LOWER(TRIM(COALESCE(MBA_NUMBER, ''))),
  LINE_ITEM_NAME = LOWER(TRIM(COALESCE(LINE_ITEM_NAME, '')))
WHERE
  REGEXP_LIKE(COALESCE(LINE_ITEM_ID, ''), '.*[A-Z].*')
  OR REGEXP_LIKE(COALESCE(MBA_NUMBER, ''), '.*[A-Z].*')
  OR REGEXP_LIKE(COALESCE(LINE_ITEM_NAME, ''), '.*[A-Z].*')
`

const conn = await connect()
await exec(conn, "USE SCHEMA ASSEMBLEDVIEW.MART", "use-schema")

for (const f of VIEW_FILES) {
  for (const [i, stmt] of splitStatements(readSql(f)).entries()) {
    await exec(conn, stmt, `view:${f}#${i}`)
  }
}
for (const f of TASK_FILES) {
  for (const [i, stmt] of splitStatements(readSql(f)).entries()) {
    await exec(conn, stmt, `task:${f}#${i}`)
  }
}

await exec(conn, PACING_FULL_BACKFILL, "backfill:PACING_FACT:full")
await exec(conn, SOCIAL_FULL_BACKFILL, "backfill:SOCIAL_PACING_FACT:full")
// ~10y window covers SEARCH history (min date ~2025-04); 4000 days is plenty.
await exec(
  conn,
  `CALL ASSEMBLEDVIEW.MART.SP_REFRESH_GOOGLESEARCHPACING_ROLLING(4000)`,
  "backfill:SEARCH_PACING_FACT:4000d"
)

const collisions = await exec(conn, SNAPSHOT_COLLISION_CHECK, "snapshot:collision-check")
console.log(`[info] snapshot case collisions: ${collisions.length}`)
writeFileSync(
  resolve("scripts/snowflake/_snapshot_collisions.json"),
  JSON.stringify(collisions, null, 2)
)
if (collisions.length > 0) {
  console.error("[abort] case-only LINE_ITEM_ID collisions — resolve before snapshot UPDATE")
  conn.destroy(() => process.exit(1))
} else {
  await exec(conn, SNAPSHOT_LOWER_UPDATE, "snapshot:lower-update")
}

console.log("[done] deploy + full backfill complete")
conn.destroy(() => process.exit(0))
