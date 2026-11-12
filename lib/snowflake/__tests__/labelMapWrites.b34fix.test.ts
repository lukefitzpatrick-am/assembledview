/**
 * B34fix (C-180, C-188): a hand-run write to MART.LINE_ITEM_LABEL_MAP must
 * leave one active row per (LOWER(TRIM(channel)), LOWER(TRIM(platform_line_item_id)))
 * and run the duplicate-key check after it.
 *
 * The app has never applied a relabel (delivery_relabels had 0 rows on
 * 13 Nov 2026), so the map's duplicate rows came from outside the app. The
 * repo's hand-run migrations hr1, rl90 and DG5 write the map with
 * `MERGE ... WHEN MATCHED THEN UPDATE SET is_active = TRUE`, which turns every
 * matched row back on, inactive history included: the pattern C-188 removed
 * from the app's revert.
 *
 * Rule for every .sql file under sql/snowflake (migrations included): a
 * statement that can leave an active map row (MERGE INTO the map with a SET
 * is_active = TRUE or an INSERT branch, UPDATE of the map that SETs
 * is_active = TRUE, INSERT INTO the map) must be followed, later in the same
 * file and outside a comment, by the duplicate-key check: a SELECT on the map
 * with is_active, both LOWER(TRIM(...)) keys and HAVING COUNT(*) > 1 (the shape
 * of LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL).
 *
 * PAST_FILES are applied one-offs that predate the rule. Each carries a
 * "DO NOT RE-RUN (see C-188)" header, the list is held to these three
 * (deep-equal) and each must still break the rule, so it can only be emptied.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL } from "../../pacing/relabel/labelMapActive.js"

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, "../../..")
const SQL_ROOT = join(repo, "sql/snowflake")

/** Applied one-offs that predate the rule. Never add to this. */
const PAST_FILES = [
  "mart/migrations/2026-10-20_hr1_hartm001_relabels_and_dv360_dupes_ACCOUNTADMIN.sql",
  "mart/migrations/2026-10-20_rl90_relabel_unmapped_90d_ACCOUNTADMIN.sql",
  "mart/migrations/2026-10-21_DG5_pgaaus0061_to_pgaaus006sm1_ACCOUNTADMIN.sql",
]

/** SQL with -- and block comments removed; single-quoted strings kept. */
function stripSqlComments(sql: string): string {
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

/** Statements split on semicolons outside single-quoted strings. */
function statements(sql: string): string[] {
  const out: string[] = []
  let cur = ""
  let inStr = false
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!
    if (c === "'") {
      if (inStr && sql[i + 1] === "'") {
        cur += "''"
        i++
        continue
      }
      inStr = !inStr
    }
    if (c === ";" && !inStr) {
      out.push(cur)
      cur = ""
      continue
    }
    cur += c
  }
  if (cur.trim()) out.push(cur)
  return out
}

const MAP = String.raw`(?:[\w$"]+\.)*"?LINE_ITEM_LABEL_MAP"?`
const SETS_ACTIVE_TRUE = /\bis_active\s*=\s*TRUE\b/i

/** The SET clause of an UPDATE (up to FROM or WHERE). */
function updateSetClause(stmt: string): string {
  const m = /\bSET\b([\s\S]*?)(?:\bFROM\b|\bWHERE\b|$)/i.exec(stmt)
  return m?.[1] ?? ""
}

/** Every `UPDATE SET` clause in a MERGE (up to the next WHEN). */
function mergeSetClauses(stmt: string): string[] {
  const out: string[] = []
  const re = /\bTHEN\s+UPDATE\s+SET\b([\s\S]*?)(?=\bWHEN\b|$)/gi
  for (let m = re.exec(stmt); m; m = re.exec(stmt)) out.push(m[1] ?? "")
  return out
}

/** True when the statement can leave an active LINE_ITEM_LABEL_MAP row. */
function isActivatingMapWrite(stmt: string): boolean {
  const s = stmt.trim()
  if (new RegExp(String.raw`^MERGE\s+INTO\s+${MAP}\b`, "i").test(s)) {
    return /\bTHEN\s+INSERT\b/i.test(s) || mergeSetClauses(s).some((c) => SETS_ACTIVE_TRUE.test(c))
  }
  if (new RegExp(String.raw`^UPDATE\s+${MAP}\b`, "i").test(s)) {
    return SETS_ACTIVE_TRUE.test(updateSetClause(s))
  }
  return new RegExp(String.raw`^INSERT\s+(?:OVERWRITE\s+)?INTO\s+${MAP}\b`, "i").test(s)
}

/** True when the statement is the duplicate active key check on the map. */
function isDuplicateKeyCheck(stmt: string): boolean {
  const s = stmt.replace(/\s+/g, " ")
  return (
    /\bSELECT\b/i.test(s) &&
    new RegExp(String.raw`\bFROM ${MAP}\b`, "i").test(s) &&
    /\bis_active\b/i.test(s) &&
    /LOWER\s*\(\s*TRIM\s*\(\s*(?:\w+\.)?channel\s*\)\s*\)/i.test(s) &&
    /LOWER\s*\(\s*TRIM\s*\(\s*(?:CAST\s*\(\s*)?(?:\w+\.)?platform_line_item_id\b/i.test(s) &&
    /\bHAVING\s+COUNT\s*\(\s*\*\s*\)\s*>\s*1\b/i.test(s)
  )
}

type MapWriteFinding = { statement: number; text: string }

/** Activating map writes with no duplicate-key check after them in the file. */
function uncheckedMapWrites(sql: string): MapWriteFinding[] {
  const stmts = statements(stripSqlComments(sql))
  const findings: MapWriteFinding[] = []
  stmts.forEach((stmt, i) => {
    if (!isActivatingMapWrite(stmt)) return
    if (stmts.slice(i + 1).some(isDuplicateKeyCheck)) return
    findings.push({ statement: i, text: stmt.trim().slice(0, 80) })
  })
  return findings
}

function sqlFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sqlFiles(p))
    else if (name.toLowerCase().endsWith(".sql")) out.push(p)
  }
  return out
}

const CHECK = `
SELECT LOWER(TRIM(channel)) AS channel_key,
       LOWER(TRIM(platform_line_item_id)) AS platform_key,
       COUNT(*) AS active_rows
FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP
WHERE is_active = TRUE
GROUP BY 1, 2
HAVING COUNT(*) > 1;`

const REACTIVATING_MERGE = `
MERGE INTO ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP t
USING (SELECT 'Social - Meta' AS channel, '1' AS platform_line_item_id, 'x1' AS line_item_id) s
ON LOWER(TRIM(t.channel)) = LOWER(s.channel) AND LOWER(TRIM(t.platform_line_item_id)) = s.platform_line_item_id
WHEN MATCHED THEN UPDATE SET line_item_id = s.line_item_id, is_active = TRUE
WHEN NOT MATCHED THEN INSERT (channel, platform_line_item_id, line_item_id, is_active)
  VALUES (s.channel, s.platform_line_item_id, s.line_item_id, TRUE);`

describe("detector", () => {
  it("flags a MERGE that sets is_active = TRUE with no check after it", () => {
    assert.equal(uncheckedMapWrites(REACTIVATING_MERGE).length, 1)
  })

  it("passes the same MERGE when the duplicate-key check follows", () => {
    assert.deepEqual(uncheckedMapWrites(REACTIVATING_MERGE + CHECK), [])
  })

  it("a check before the write, or in a comment, does not count", () => {
    assert.equal(uncheckedMapWrites(CHECK + REACTIVATING_MERGE).length, 1)
    const commented = CHECK.split("\n").map((l) => `-- ${l}`).join("\n")
    assert.equal(uncheckedMapWrites(REACTIVATING_MERGE + commented).length, 1)
  })

  it("an UPDATE that sets is_active = TRUE is flagged; one that sets FALSE is not", () => {
    const on = "UPDATE MART.LINE_ITEM_LABEL_MAP SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP() WHERE line_item_id = 'a';"
    const off = "UPDATE ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP SET is_active = FALSE WHERE is_active = TRUE AND channel = 'x';"
    assert.equal(uncheckedMapWrites(on).length, 1)
    assert.deepEqual(uncheckedMapWrites(off), [])
  })

  it("a deactivating MERGE with no INSERT branch is not flagged", () => {
    const sql = `MERGE INTO LINE_ITEM_LABEL_MAP t USING s ON t.channel = s.channel
      WHEN MATCHED THEN UPDATE SET is_active = FALSE;`
    assert.deepEqual(uncheckedMapWrites(sql), [])
  })

  it("an INSERT INTO the map is flagged; an INSERT into another table is not", () => {
    assert.equal(
      uncheckedMapWrites("INSERT INTO ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP (channel) VALUES ('x');").length,
      1,
    )
    assert.deepEqual(uncheckedMapWrites("INSERT INTO ASSEMBLEDVIEW.MART.PACING_FACT (channel) VALUES ('x');"), [])
  })

  it("a read of the map is not a write", () => {
    const sql = "SELECT * FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP WHERE is_active = TRUE;"
    assert.deepEqual(uncheckedMapWrites(sql), [])
  })

  it("the app's duplicate-key SQL counts as the check", () => {
    assert.ok(isDuplicateKeyCheck(stripSqlComments(LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL)))
  })

  it("the check printed in sql/snowflake/mart/README.md counts as the check", () => {
    const readme = readFileSync(join(SQL_ROOT, "mart/README.md"), "utf8")
    const block = /## Writing the label map by hand[\s\S]*?```sql\n([\s\S]*?)```/.exec(readme)?.[1]
    assert.ok(block, "README section and sql block")
    assert.ok(isDuplicateKeyCheck(block.replace(/;\s*$/, "")))
  })

  it("the check needs HAVING COUNT(*) > 1 and both keys", () => {
    assert.equal(isDuplicateKeyCheck(CHECK.replace("> 1", "> 2")), false)
    assert.equal(isDuplicateKeyCheck(CHECK.replace("LOWER(TRIM(channel))", "channel")), false)
    assert.equal(isDuplicateKeyCheck(CHECK.replace("is_active = TRUE", "1 = 1")), false)
  })
})

describe("sql/snowflake map writes", () => {
  const files = sqlFiles(SQL_ROOT).map((p) => relative(SQL_ROOT, p).split("\\").join("/"))

  it("scans the migrations folder (sanity)", () => {
    for (const past of PAST_FILES) assert.ok(files.includes(past), `${past} is missing`)
  })

  it("no file outside the past list writes an active map row without the duplicate-key check after it", () => {
    const bad: string[] = []
    for (const f of files) {
      if (PAST_FILES.includes(f)) continue
      const findings = uncheckedMapWrites(readFileSync(join(SQL_ROOT, f), "utf8"))
      for (const x of findings) bad.push(`${f} statement ${x.statement}: ${x.text}`)
    }
    assert.deepEqual(
      bad,
      [],
      "Keep one active row per key: deactivate the key, insert one row, then run the duplicate-key check (sql/snowflake/mart/README.md, C-188).",
    )
  })

  it("the past list is held to hr1, rl90 and DG5, and each still breaks the rule (it can only shrink)", () => {
    assert.deepEqual([...PAST_FILES].sort(), [
      "mart/migrations/2026-10-20_hr1_hartm001_relabels_and_dv360_dupes_ACCOUNTADMIN.sql",
      "mart/migrations/2026-10-20_rl90_relabel_unmapped_90d_ACCOUNTADMIN.sql",
      "mart/migrations/2026-10-21_DG5_pgaaus0061_to_pgaaus006sm1_ACCOUNTADMIN.sql",
    ])
    for (const f of PAST_FILES) {
      assert.ok(uncheckedMapWrites(readFileSync(join(SQL_ROOT, f), "utf8")).length > 0, `${f} no longer breaks the rule: remove it from PAST_FILES`)
    }
  })

  it("each past file starts with the do-not-re-run header", () => {
    for (const f of PAST_FILES) {
      const head = readFileSync(join(SQL_ROOT, f), "utf8").split("\n").slice(0, 3).join("\n")
      assert.match(head, /^-- DO NOT RE-RUN \(see C-188\)\./, f)
    }
  })
})
