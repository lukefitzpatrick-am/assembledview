/**
 * B29 (C-180): no warehouse reader may let MART.LINE_ITEM_LABEL_MAP multiply
 * delivery. Snowflake does not enforce unique keys, so a reader that joins the
 * raw map and then SUMs counts every duplicate active row once more. Four
 * copies of the BIC 7plus BVOD rows put 4x CM360 delivery in PACING_FACT.
 *
 * Rule for every task, view and procedure file under sql/snowflake/mart: the
 * map is read only
 *   - in a scope that keeps one row per key:
 *       QUALIFY ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(channel)),
 *         LOWER(TRIM(platform_line_item_id)) ORDER BY ...) = 1
 *     or SELECT LOWER(TRIM(channel)), LOWER(TRIM(platform_line_item_id)), <aggregates> ... GROUP BY 1, 2
 *   - or inside EXISTS / NOT EXISTS,
 * and never straight after JOIN. Writes (UPDATE, MERGE INTO, INSERT INTO) are
 * not reads. Migrations are history and are not scanned.
 *
 * PENDING_LIVE_CHECK lists readers that still join the raw map because the
 * builder could not compare the repo file with the live task (CLAUDE_RW has no
 * privilege on it). Each entry must still fail the rule, so the list only
 * shrinks.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, "../../..")
const MART = join(repo, "sql/snowflake/mart")
const SCANNED_DIRS = ["tasks", "views", "procedures"]

const PENDING_LIVE_CHECK = new Map<string, string>([
  ["tasks/tsk_refresh_pacing_fact.sql", "C-180: compare with GET_DDL as ACCOUNTADMIN first"],
  ["tasks/tsk_refresh_social_pacing_fact.sql", "C-180: compare with GET_DDL as ACCOUNTADMIN first"],
])

/** SQL with -- and block comments removed; single-quoted strings kept. */
function stripComments(sql: string): string {
  let out = ""
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++
      continue
    }
    if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2)
      i = end < 0 ? sql.length : end + 2
      out += " "
      continue
    }
    if (c === "'") {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2
          continue
        }
        if (sql[j] === "'") break
        j++
      }
      out += sql.slice(i, j + 1)
      i = j + 1
      continue
    }
    out += c
    i++
  }
  return out
}

function normalise(sql: string): string {
  return stripComments(sql)
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .toUpperCase()
}

/** The text between the parentheses that enclose `at` (or the statement). */
function enclosingScope(text: string, at: number): string {
  let depth = 0
  let start = 0
  for (let i = at; i >= 0; i--) {
    const c = text[i]
    if (c === ")") depth++
    else if (c === "(") {
      if (depth === 0) {
        start = i + 1
        break
      }
      depth--
    } else if (c === ";" && depth === 0) {
      start = i + 1
      break
    }
  }
  depth = 0
  let end = text.length
  for (let i = at; i < text.length; i++) {
    const c = text[i]
    if (c === "(") depth++
    else if (c === ")") {
      if (depth === 0) {
        end = i
        break
      }
      depth--
    } else if (c === ";" && depth === 0) {
      end = i
      break
    }
  }
  return text.slice(start, end).trim()
}

const KEY_CHANNEL = String.raw`LOWER\(TRIM\((?:\w+\.)?CHANNEL\)\)`
const KEY_PLATFORM = String.raw`LOWER\(TRIM\((?:\w+\.)?PLATFORM_LINE_ITEM_ID(?:::VARCHAR|::STRING)?\)\)`
const ONE_ROW_QUALIFY = new RegExp(
  String.raw`QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY ${KEY_CHANNEL}, ${KEY_PLATFORM} ORDER BY [^()]*(?:\([^()]*(?:\([^()]*\))?[^()]*\)[^()]*)*\) = 1$`,
)
const GROUPED_BY_KEY = new RegExp(
  String.raw`^SELECT ${KEY_CHANNEL}(?: AS \w+)?, ${KEY_PLATFORM}(?: AS \w+)?, .* GROUP BY 1, 2$`,
)

/** Every place the text reads the label map in a way that can multiply rows. */
function labelMapFanOutFindings(sql: string): string[] {
  const text = normalise(sql)
  const findings: string[] = []
  const re = /(?:\bASSEMBLEDVIEW\.MART\.|\bMART\.|\b)LINE_ITEM_LABEL_MAP\b/g
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0
    const before = text.slice(Math.max(0, at - 40), at)
    const where = `…${text.slice(Math.max(0, at - 30), at + 50)}…`
    if (/\b(UPDATE|INTO)\s*$/.test(before)) continue
    if (/\bJOIN\s*$/.test(before)) {
      findings.push(`joins the raw map: ${where}`)
      continue
    }
    if (!/\bFROM\s*$/.test(before)) {
      findings.push(`unrecognised read of the map: ${where}`)
      continue
    }
    if (/\bEXISTS \(SELECT 1 FROM\s*$/.test(text.slice(Math.max(0, at - 60), at))) continue
    const scope = enclosingScope(text, at)
    if (/\bJOIN\b/.test(scope) || /LINE_ITEM_LABEL_MAP(?: \w+)?,/.test(scope)) {
      findings.push(`map read beside another table in one scope: ${where}`)
      continue
    }
    if (ONE_ROW_QUALIFY.test(scope) || GROUPED_BY_KEY.test(scope)) continue
    findings.push(`map read without one row per (channel, platform id): ${where}`)
  }
  return findings
}

function sqlFiles(): string[] {
  const out: string[] = []
  for (const dir of SCANNED_DIRS) {
    for (const name of readdirSync(join(MART, dir))) {
      if (name.endsWith(".sql")) out.push(`${dir}/${name}`)
    }
  }
  return out.sort()
}

const read = (rel: string) => readFileSync(join(MART, rel), "utf8")

/** The CREATE ... through the last GRANT of a view, as both copies hold it. */
function createBlock(sql: string, view: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.${view}`)
  assert.ok(start >= 0, `no CREATE for ${view}`)
  const lastGrant = sql.lastIndexOf(`GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.${view}`)
  assert.ok(lastGrant > start, `no GRANT for ${view}`)
  return sql.slice(start, sql.indexOf(";", lastGrant) + 1)
}

describe("LINE_ITEM_LABEL_MAP readers keep one row per key (C-180)", () => {
  it("every task, view and procedure passes, apart from the pending list", () => {
    const files = sqlFiles()
    assert.ok(files.length >= 20, `expected the mart SQL files, found ${files.length}`)
    const readers = files.filter((f) => /LINE_ITEM_LABEL_MAP/i.test(stripComments(read(f))))
    assert.ok(readers.length >= 3, `expected at least 3 map readers, found ${readers.join(", ")}`)
    for (const file of files) {
      const findings = labelMapFanOutFindings(read(file))
      if (PENDING_LIVE_CHECK.has(file)) {
        assert.ok(
          findings.length > 0,
          `${file} no longer joins the raw map: remove it from PENDING_LIVE_CHECK`,
        )
      } else {
        assert.deepEqual(findings, [], `${file}`)
      }
    }
  })

  it("every pending entry is a real file", () => {
    const files = new Set(sqlFiles())
    for (const file of PENDING_LIVE_CHECK.keys()) assert.ok(files.has(file), file)
  })

  it("fails the pre-B29 platform spend view (FCM1 body)", () => {
    const fcm1 = readFileSync(
      join(MART, "migrations/2026-10-26_FCM1_platform_spend_line_month_ACCOUNTADMIN.sql"),
      "utf8",
    )
    const findings = labelMapFanOutFindings(createBlock(fcm1, "VW_PLATFORM_SPEND_LINE_MONTH"))
    assert.equal(findings.length, 1)
    assert.match(findings[0]!, /joins the raw map/)
  })

  it("fails both refresh tasks as they stand", () => {
    for (const file of PENDING_LIVE_CHECK.keys()) {
      const findings = labelMapFanOutFindings(read(file))
      assert.equal(findings.length, 1, file)
      assert.match(findings[0]!, /joins the raw map/, file)
    }
  })

  it("the LM1 migration holds the same view text as the views file", () => {
    const view = read("views/vw_platform_spend_line_month.sql")
    const lm1 = read("migrations/2026-11-09_LM1_platform_spend_label_map_one_row_ACCOUNTADMIN.sql")
    assert.equal(createBlock(lm1, "VW_PLATFORM_SPEND_LINE_MONTH"), createBlock(view, "VW_PLATFORM_SPEND_LINE_MONTH"))
  })

  it("the CD1 migration holds the same drift view text as the views file", () => {
    const view = read("views/vw_pacing_fact_cm360_drift.sql")
    const cd1 = read("migrations/2026-11-09_CD1_pacing_fact_cm360_drift_view_ACCOUNTADMIN.sql")
    assert.equal(createBlock(cd1, "VW_PACING_FACT_CM360_DRIFT"), createBlock(view, "VW_PACING_FACT_CM360_DRIFT"))
  })
})

describe("labelMapFanOutFindings", () => {
  const guarded = `
    WITH label_map_one AS (
      SELECT channel, platform_line_item_id, line_item_id, line_item_name, is_active
      FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP
      WHERE is_active = TRUE
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(channel)), LOWER(TRIM(platform_line_item_id))
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST,
                 LOWER(TRIM(line_item_id)) DESC NULLS LAST
      ) = 1
    ),
    relabel AS (
      SELECT k.*, COALESCE(m.line_item_id, k.line_item_id) AS final_line_item_id
      FROM keyed k
      LEFT JOIN label_map_one m
        ON LOWER(TRIM(m.channel)) = LOWER(TRIM(k.channel))
       AND LOWER(TRIM(m.platform_line_item_id)) = LOWER(TRIM(k.platform_line_item_id))
    )
    SELECT channel, SUM(impressions) FROM relabel GROUP BY 1;`

  it("passes the one-row CTE", () => {
    assert.deepEqual(labelMapFanOutFindings(guarded), [])
  })

  it("passes a GROUP BY on the two keys, EXISTS, writes and comments", () => {
    assert.deepEqual(
      labelMapFanOutFindings(`
        WITH label_map AS (
          SELECT LOWER(TRIM(channel)) AS channel,
                 LOWER(TRIM(platform_line_item_id::varchar)) AS platform_line_item_id,
                 MAX(line_item_id) AS line_item_id
          FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP
          WHERE is_active = TRUE
          GROUP BY 1, 2
        ) SELECT 1 FROM label_map;
        UPDATE t SET x = 1 WHERE NOT EXISTS (SELECT 1 FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m WHERE m.is_active);
        MERGE INTO ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP t USING s ON t.a = s.a WHEN MATCHED THEN UPDATE SET t.b = s.b;
        UPDATE ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP SET is_active = FALSE;
        -- LEFT JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m (old text in a comment)
        /* LEFT JOIN LINE_ITEM_LABEL_MAP m */
        SELECT '-- not a comment' FROM dual;`),
      [],
    )
  })

  it("catches the mutations that bring the fan-out back", () => {
    const mutations: Array<[string, string, string]> = [
      ["raw join", "LEFT JOIN label_map_one m", "LEFT JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m"],
      ["raw inner join, lower case", "LEFT JOIN label_map_one m", "join assembledview.mart.line_item_label_map m"],
      ["no QUALIFY", "QUALIFY ROW_NUMBER() OVER (", "AND ROW_NUMBER() OVER ("],
      ["partition on channel only", "PARTITION BY LOWER(TRIM(channel)), LOWER(TRIM(platform_line_item_id))", "PARTITION BY LOWER(TRIM(channel))"],
      ["keeps up to 4 rows", ") = 1\n    ),", ") <= 4\n    ),"],
      ["partition on line id", "LOWER(TRIM(platform_line_item_id))\n", "LOWER(TRIM(line_item_id))\n"],
      ["second table in the CTE", "FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP\n", "FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP JOIN x ON TRUE\n"],
    ]
    for (const [name, from, to] of mutations) {
      assert.ok(guarded.includes(from), `mutation "${name}" does not apply`)
      const mutated = guarded.replace(from, to)
      assert.ok(labelMapFanOutFindings(mutated).length > 0, `mutation "${name}" was not caught`)
    }
  })
})
