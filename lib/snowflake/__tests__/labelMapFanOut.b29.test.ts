/**
 * B29 (C-180): no warehouse reader may let MART.LINE_ITEM_LABEL_MAP multiply
 * delivery. Snowflake does not enforce unique keys, so a reader that joins the
 * raw map and then SUMs counts every duplicate active row once more. Four
 * copies of the BIC 7plus BVOD rows put 4x CM360 delivery in PACING_FACT.
 *
 * Rule for every task, view and procedure file under sql/snowflake/mart: the
 * map is read only
 *   - in a named CTE that keeps one active row per key:
 *       FROM ... LINE_ITEM_LABEL_MAP WHERE is_active = TRUE [AND ...]
 *       QUALIFY ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(channel)),
 *         LOWER(TRIM(platform_line_item_id)) ORDER BY ...) = 1
 *     or SELECT LOWER(TRIM(channel)), LOWER(TRIM(platform_line_item_id)), <aggregates>
 *       FROM ... WHERE is_active = TRUE [AND ...] GROUP BY 1, 2
 *     and every JOIN onto that CTE matches on both keys (channel and platform
 *     id), with no OR in the ON clause;
 *   - or inside EXISTS / NOT EXISTS,
 * and never straight after JOIN. Writes (UPDATE, MERGE INTO, INSERT INTO) are
 * not reads. Migrations are history and are not scanned.
 *
 * PENDING_LIVE_CHECK lists readers that still join the raw map because the
 * builder could not compare the repo file with the live task (CLAUDE_RW has no
 * privilege on it). It is held to the two refresh tasks (deep-equal below),
 * and each entry must still fail the rule, so the list can only be emptied.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { buildUnmappedDeliverySql } from "../../pacing/admin/unmappedDelivery.js"
import { buildUnmappedPlacementsSql } from "../../pacing/admin/unmappedPlacements.js"

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, "../../..")
const MART = join(repo, "sql/snowflake/mart")
const SCANNED_DIRS = ["tasks", "views", "procedures"]

const PENDING_LIVE_CHECK = new Map<string, string>([
  ["tasks/tsk_refresh_pacing_fact.sql", "C-180: compare with GET_DDL as ACCOUNTADMIN first"],
  ["tasks/tsk_refresh_social_pacing_fact.sql", "C-180: compare with GET_DDL as ACCOUNTADMIN first"],
])

/** The only files PENDING_LIVE_CHECK may hold (C-180). Never add to this. */
const PENDING_HELD_TO = ["tasks/tsk_refresh_pacing_fact.sql", "tasks/tsk_refresh_social_pacing_fact.sql"]

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
  return enclosingSpan(text, at).text
}

/** Start, end and trimmed text of the scope that encloses `at`. */
function enclosingSpan(text: string, at: number): { start: number; end: number; text: string } {
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
  return { start, end, text: text.slice(start, end).trim() }
}

const KEY_CHANNEL = String.raw`LOWER\(TRIM\((?:\w+\.)?CHANNEL\)\)`
const KEY_PLATFORM = String.raw`LOWER\(TRIM\((?:\w+\.)?PLATFORM_LINE_ITEM_ID(?:::VARCHAR|::STRING)?\)\)`
const ONE_ROW_QUALIFY = new RegExp(
  String.raw`QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY ${KEY_CHANNEL}, ${KEY_PLATFORM} ORDER BY [^()]*(?:\([^()]*(?:\([^()]*\))?[^()]*\)[^()]*)*\) = 1$`,
)
const GROUPED_BY_KEY = new RegExp(
  String.raw`^SELECT ${KEY_CHANNEL}(?: AS \w+)?, ${KEY_PLATFORM}(?: AS \w+)?, .* GROUP BY 1, 2$`,
)
/** The one-row scope's WHERE: is_active = TRUE first, ANDed, no OR. */
const ACTIVE_ONLY = /^(?:\w+\.)?IS_ACTIVE = TRUE(?: AND .*)?$/

/** WHERE clause of a one-row scope: after the map, before QUALIFY or GROUP BY. */
function oneRowWhere(scope: string): string | null {
  const m = /\bLINE_ITEM_LABEL_MAP(?: (?:AS )?\w+)? WHERE (.*?) (?:QUALIFY|GROUP BY) /.exec(scope)
  return m ? m[1]! : null
}

const END_OF_ON = /(?:(?:LEFT|RIGHT|INNER|FULL|CROSS|OUTER|NATURAL) )*JOIN |WHERE |GROUP BY |QUALIFY |UNION |ORDER BY |HAVING |LIMIT /y

/** The ON clause that starts at `from`: up to the next clause at the same depth. */
function onClause(text: string, from: number): string {
  let depth = 0
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === "(") depth++
    else if (c === ")") {
      if (depth === 0) return text.slice(from, i).trim()
      depth--
    } else if (c === ";" && depth === 0) return text.slice(from, i).trim()
    else if (depth === 0 && (i === from || text[i - 1] === " ")) {
      END_OF_ON.lastIndex = i
      if (END_OF_ON.test(text)) return text.slice(from, i).trim()
    }
  }
  return text.slice(from).trim()
}

/** True when `on` has an equality on alias.column (lowered and trimmed or not), either side. */
function onHasKey(on: string, alias: string, column: string): boolean {
  const side = String.raw`(?:LOWER\(TRIM\()?${alias}\.${column}(?:::VARCHAR|::STRING)?(?:\)\))?`
  return new RegExp(String.raw`(?:^|[ (])${side} = `).test(on) || new RegExp(String.raw` = ${side}(?:$|[ )])`).test(on)
}

/** Findings for every use of a one-row CTE: each JOIN onto it must use both keys. */
function oneRowCteUseFindings(text: string, name: string, definedAt: number): string[] {
  const findings: string[] = []
  for (const m of text.matchAll(new RegExp(String.raw`\b${name}\b`, "g"))) {
    const at = m.index ?? 0
    if (at === definedAt) continue
    if (text[at + name.length] === ".") continue // a column qualified by the CTE name
    const where = `…${text.slice(Math.max(0, at - 30), at + 80)}…`
    const before = text.slice(Math.max(0, at - 20), at)
    const after = text.slice(at + name.length)
    if (/\bJOIN $/.test(before)) {
      const head = /^ (?:AS )?(\w+) ON /.exec(after) ?? /^ ON /.exec(after)
      if (!head) {
        findings.push(`join onto ${name} has no ON clause: ${where}`)
        continue
      }
      const alias = head[1] && head[1] !== "ON" ? head[1] : name
      const on = onClause(text, at + name.length + head[0].length)
      if (/\bOR\b/.test(on)) findings.push(`join onto ${name} has OR in its ON clause: ${where}`)
      else if (!onHasKey(on, alias, "CHANNEL") || !onHasKey(on, alias, "PLATFORM_LINE_ITEM_ID")) {
        findings.push(`join onto ${name} does not match on both channel and platform id: ${where}`)
      }
      continue
    }
    if (/\bFROM $/.test(before)) {
      const scope = enclosingScope(text, at)
      if (/\bJOIN\b/.test(scope) || new RegExp(String.raw`\b${name}(?: \w+)?,`).test(scope)) {
        findings.push(`${name} read beside another table without a checked JOIN: ${where}`)
      }
      continue
    }
    findings.push(`unrecognised use of ${name}: ${where}`)
  }
  return findings
}

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
    const span = enclosingSpan(text, at)
    const scope = span.text
    if (/\bJOIN\b/.test(scope) || /LINE_ITEM_LABEL_MAP(?: \w+)?,/.test(scope)) {
      findings.push(`map read beside another table in one scope: ${where}`)
      continue
    }
    if (!ONE_ROW_QUALIFY.test(scope) && !GROUPED_BY_KEY.test(scope)) {
      findings.push(`map read without one row per (channel, platform id): ${where}`)
      continue
    }
    const active = oneRowWhere(scope)
    if (active === null || /\bOR\b/.test(active) || !ACTIVE_ONLY.test(active)) {
      findings.push(`one-row scope does not keep only active rows (WHERE is_active = TRUE): ${where}`)
      continue
    }
    const cte = /\b(\w+) AS $/.exec(text.slice(0, span.start - 1))
    if (!cte) {
      findings.push(`one-row scope is not a named CTE, so its joins cannot be checked: ${where}`)
      continue
    }
    findings.push(...oneRowCteUseFindings(text, cte[1]!, span.start - 1 - " AS ".length - cte[1]!.length))
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

  it("the pending list is held to the two refresh tasks", () => {
    assert.deepEqual([...PENDING_LIVE_CHECK.keys()].sort(), PENDING_HELD_TO)
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
      ["no active filter", "      WHERE is_active = TRUE\n", "\n"],
      ["active filter ORed", "WHERE is_active = TRUE\n", "WHERE is_active = TRUE OR channel IS NULL\n"],
      ["inactive rows kept", "WHERE is_active = TRUE\n", "WHERE is_active = FALSE\n"],
      ["join on platform id only", "ON LOWER(TRIM(m.channel)) = LOWER(TRIM(k.channel))\n       AND ", "ON "],
      ["join on channel only", "\n       AND LOWER(TRIM(m.platform_line_item_id)) = LOWER(TRIM(k.platform_line_item_id))", ""],
      ["OR in the join", "\n       AND LOWER(TRIM(m.platform_line_item_id))", "\n       OR LOWER(TRIM(m.platform_line_item_id))"],
      ["join keys on the other table", "LOWER(TRIM(m.channel)) = LOWER(TRIM(k.channel))", "LOWER(TRIM(k.channel)) = LOWER(TRIM(k.x))"],
      ["CTE read beside another table", "FROM keyed k\n      LEFT JOIN label_map_one m", "FROM keyed k, label_map_one m\n      LEFT JOIN y"],
    ]
    for (const [name, from, to] of mutations) {
      assert.ok(guarded.includes(from), `mutation "${name}" does not apply`)
      const mutated = guarded.replace(from, to)
      assert.ok(labelMapFanOutFindings(mutated).length > 0, `mutation "${name}" was not caught`)
    }
  })

  it("fails closed on a one-row subquery that is not a named CTE", () => {
    const findings = labelMapFanOutFindings(`
      SELECT k.x FROM keyed k
      LEFT JOIN (
        SELECT channel, platform_line_item_id, line_item_id
        FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP
        WHERE is_active = TRUE
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY LOWER(TRIM(channel)), LOWER(TRIM(platform_line_item_id))
          ORDER BY updated_at DESC
        ) = 1
      ) m ON LOWER(TRIM(m.channel)) = LOWER(TRIM(k.channel));`)
    assert.equal(findings.length, 1)
    assert.match(findings[0]!, /not a named CTE/)
  })

  it("accepts a one-row CTE joined without an alias, or with AS, on both keys", () => {
    for (const join of [
      "LEFT JOIN label_map_one ON label_map_one.channel = k.channel AND label_map_one.platform_line_item_id = k.pid",
      "LEFT JOIN label_map_one AS m ON k.pid = m.platform_line_item_id::varchar AND LOWER(TRIM(k.channel)) = LOWER(TRIM(m.channel))",
    ]) {
      const from = guarded.indexOf("LEFT JOIN label_map_one m")
      const to = guarded.indexOf("\n    )\n    SELECT channel")
      assert.ok(from > 0 && to > from, "the join block is where the test expects it")
      const sql = guarded.slice(0, from) + join + guarded.slice(to)
      assert.ok(sql.includes(join) && !sql.includes("LEFT JOIN label_map_one m\n"))
      assert.deepEqual(labelMapFanOutFindings(sql), [], join)
    }
  })
})

describe("app-side Unmapped SQL keeps one map row per key (C-181, B33)", () => {
  /** The pre-B33 labelMapJoinSql text: the raw map joined straight onto the fact. */
  const RAW_JOIN = `LEFT JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
        ON LOWER(TRIM(m.CHANNEL)) = LOWER(TRIM(f.CHANNEL))
       AND LOWER(TRIM(CAST(m.PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(CAST(f.PLATFORM_LINE_ITEM_ID AS VARCHAR)))
       AND m.IS_ACTIVE = TRUE`

  const builders: Array<[string, () => string, number]> = [
    ["unmapped placements (CM360)", buildUnmappedPlacementsSql, 1],
    ["unmapped delivery (all facts)", buildUnmappedDeliverySql, 3],
  ]

  for (const [name, buildSql, joins] of builders) {
    it(`${name} passes the fan-out rule`, () => {
      const sql = buildSql()
      assert.deepEqual(labelMapFanOutFindings(sql), [])
      assert.equal(sql.match(/LINE_ITEM_LABEL_MAP\b/g)?.length, 1, "the map is read once, in the CTE")
      assert.equal(sql.match(/LEFT JOIN LABEL_MAP_ONE m\b/g)?.length, joins, "every fact joins the one-row CTE")
    })

    it(`${name}: the pre-B33 raw join (a duplicate map row multiplies) is caught`, () => {
      const sql = buildSql()
      const cte = sql.indexOf("LABEL_MAP_ONE AS (")
      const end = sql.indexOf("\n    ),\n", cte)
      assert.ok(cte > 0 && end > cte, "the CTE is where the test expects it")
      const old = (sql.slice(0, cte) + sql.slice(end + "\n    ),\n".length)).replaceAll(
        /LEFT JOIN LABEL_MAP_ONE m\n {8}ON LOWER\(TRIM\(m\.CHANNEL\)\) = LOWER\(TRIM\(f\.CHANNEL\)\)\n {7}AND LOWER\(TRIM\(m\.PLATFORM_LINE_ITEM_ID\)\) = LOWER\(TRIM\(CAST\(f\.PLATFORM_LINE_ITEM_ID AS VARCHAR\)\)\)\n {7}AND m\.IS_ACTIVE = TRUE/g,
        RAW_JOIN,
      )
      assert.equal(old.match(/LEFT JOIN ASSEMBLEDVIEW\.MART\.LINE_ITEM_LABEL_MAP m\b/g)?.length, joins)
      const findings = labelMapFanOutFindings(old)
      assert.equal(findings.length, joins)
      for (const finding of findings) assert.match(finding, /joins the raw map/)
    })
  }

  it("the CTE keeps the LM1 ordering (latest UPDATED_AT, then CREATED_AT, then highest line id)", () => {
    const view = normalise(read("views/vw_platform_spend_line_month.sql"))
    const app = normalise(buildUnmappedPlacementsSql())
    const order = (text: string) => /QUALIFY ROW_NUMBER\(\) OVER \((PARTITION BY .*?)\) = 1/.exec(text)?.[1]
    assert.ok(order(app)?.includes("ORDER BY UPDATED_AT DESC NULLS LAST, CREATED_AT DESC NULLS LAST"), order(app))
    assert.equal(order(app), order(view))
  })
})
