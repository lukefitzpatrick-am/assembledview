/**
 * db:drift — live Postgres (DIRECT_URL or DATABASE_URL, read-only) vs Drizzle TS mirrors.
 *
 * db:generate compares db/schema/*.ts to db/drizzle/meta snapshots. It never
 * consults the database. This script is the other half: information_schema /
 * pg_catalog vs getTableConfig() of the TypeScript mirrors.
 *
 * Compared
 *   - columns (presence by table.column; not type / nullability / default).
 *     Mirror-ahead columns (named in db/schema/*.ts, absent from the database)
 *     are a deploy blocker: they print a FATAL banner and fail the check.
 *     That class 500s every db.select() on the table if the mirror ships first.
 *   - foreign keys (by local columns + target table/columns; not constraint name)
 *   - indexes and unique constraints (by table + ordered column list +
 *     per-column ASC/DESC + uniqueness + canonicalised predicate; not name)
 *
 * Predicate canonicalisation (scripts/db/canonicalise.ts): lowercase, strip
 * ::type casts, remove redundant parentheses, collapse whitespace. Compare
 * canonical forms only. Two objects match only when those forms are EQUAL —
 * never treat "appears on both sides" as automatic equivalence.
 *
 * Unique-constraint vs unique-index of the same columns is one identity — a
 * UNIQUE constraint's backing index is not a second finding.
 *
 * When a genuine index/unique difference is reported, both raw definitions
 * are printed so a human can judge without re-querying.
 *
 * Exclusions may only cover how an object is WRITTEN, never what it DOES:
 *   - constraint naming (*_fkey vs *_id_fk, *_key vs *_unique)
 *   - unique-constraint vs unique-index representation of the same columns
 *   - index opclass (int8_ops and friends)
 *   - wrapping parentheses and ::type casts (canonicalised, not ignored)
 *   - index NULLS FIRST / LAST (Postgres DESC defaults NULLS FIRST; Drizzle
 *     index columns default nulls last)
 *   - RLS flags and policies (live has RLS on all public tables; the mirror
 *     does not model these)
 *   - CHECK constraints that exist only in SQL
 *
 * NEVER exclude column order, column direction, or partial predicates —
 * those are semantics and are always drift.
 *
 * Exit 1 on any finding, 0 when clean. Does not write to Postgres.
 */
import fs from "fs"
import path from "path"
import postgres from "postgres"
import { is } from "drizzle-orm"
import { getTableConfig, PgTable } from "drizzle-orm/pg-core"
import * as schema from "../../db/schema"
import { canonicalise } from "./canonicalise"
import {
  findMirrorColumnsMissingFromLive,
  formatMirrorAheadMessage,
} from "./mirrorColumnDrift"

type ColRef = { expr: string; desc: boolean }

type UniqueKey = {
  table: string
  cols: string
  where: string
  raw: string
}

type IndexKey = {
  table: string
  cols: string
  unique: boolean
  where: string
  raw: string
}

type FkKey = {
  table: string
  cols: string
  targetTable: string
  targetCols: string
}

type Side<T extends { table: string }> = Map<string, T & { label: string }>

function loadEnvFile(file: string): void {
  const full = path.resolve(process.cwd(), file)
  if (!fs.existsSync(full)) return
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2]
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}

function stringifySqlish(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map(stringifySqlish).join("")
  if (typeof value !== "object") return ""
  const o = value as Record<string, unknown>
  if (typeof o.name === "string" && !("queryChunks" in o)) return o.name
  if (Array.isArray(o.queryChunks)) return o.queryChunks.map(stringifySqlish).join("")
  if (Array.isArray(o.value)) return o.value.map(stringifySqlish).join("")
  if (typeof o.value === "string") return o.value
  return ""
}

function colIdentity(cols: ColRef[]): string {
  return cols
    .map((c) => `${canonicalise(c.expr)}:${c.desc ? "desc" : "asc"}`)
    .join(",")
}

function displayCols(cols: ColRef[]): string {
  return cols
    .map((c) => (c.desc ? `${c.expr} DESC` : c.expr))
    .join(", ")
}

function uniqueId(k: UniqueKey): string {
  return `${k.table}|u|${k.cols}|w:${k.where}`
}

function indexId(k: IndexKey): string {
  return `${k.table}|i|${k.unique ? "uq" : "idx"}|${k.cols}|w:${k.where}`
}

function fkId(k: FkKey): string {
  return `${k.table}|fk|${k.cols}|${k.targetTable}|${k.targetCols}`
}

function familyId(table: string, cols: string): string {
  return `${table}|${cols.replace(/:(asc|desc)/g, "")}`
}

function add<T extends { table: string }>(
  map: Side<T>,
  id: string,
  row: T,
  label: string,
): void {
  if (!map.has(id)) map.set(id, { ...row, label })
}

function indexLabel(cols: ColRef[], whereRaw: string, unique: boolean): string {
  const pred = whereRaw.trim()
  const head = `${unique ? "UNIQUE " : ""}(${displayCols(cols)})`
  return pred ? `${head} WHERE ${pred}` : head
}

function mirrorTables(): PgTable[] {
  const seen = new Set<string>()
  const tables: PgTable[] = []
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    const name = getTableConfig(value).name
    if (seen.has(name)) continue
    seen.add(name)
    tables.push(value)
  }
  return tables
}

function collectMirror(): {
  tables: Set<string>
  columns: Map<string, { table: string; column: string }>
  fks: Side<FkKey>
  uniques: Side<UniqueKey>
  indexes: Side<IndexKey>
} {
  const tables = new Set<string>()
  const columns = new Map<string, { table: string; column: string }>()
  const fks: Side<FkKey> = new Map()
  const uniques: Side<UniqueKey> = new Map()
  const indexes: Side<IndexKey> = new Map()

  for (const table of mirrorTables()) {
    const cfg = getTableConfig(table)
    const tableName = cfg.name
    tables.add(tableName)

    for (const col of cfg.columns) {
      const column = col.name
      columns.set(`${tableName}.${column}`, { table: tableName, column })
      if (col.primary) {
        const key: UniqueKey = {
          table: tableName,
          cols: colIdentity([{ expr: column, desc: false }]),
          where: "",
          raw: `PRIMARY KEY (${column})`,
        }
        add(uniques, uniqueId(key), key, key.raw)
      }
      if (col.isUnique) {
        const key: UniqueKey = {
          table: tableName,
          cols: colIdentity([{ expr: column, desc: false }]),
          where: "",
          raw: `UNIQUE (${column})`,
        }
        add(uniques, uniqueId(key), key, key.raw)
      }
    }

    for (const pk of cfg.primaryKeys) {
      const cols = pk.columns.map((c) => ({ expr: c.name, desc: false }))
      const raw = `PRIMARY KEY (${displayCols(cols)})`
      const key: UniqueKey = {
        table: tableName,
        cols: colIdentity(cols),
        where: "",
        raw,
      }
      add(uniques, uniqueId(key), key, raw)
    }

    for (const uq of cfg.uniqueConstraints) {
      const cols = uq.columns.map((c) => ({ expr: c.name, desc: false }))
      const raw = `UNIQUE (${displayCols(cols)})`
      const key: UniqueKey = {
        table: tableName,
        cols: colIdentity(cols),
        where: "",
        raw,
      }
      add(uniques, uniqueId(key), key, raw)
    }

    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference()
      const cols = ref.columns.map((c) => c.name)
      const targetCols = ref.foreignColumns.map((c) => c.name)
      const targetTable = getTableConfig(ref.foreignTable).name
      const key: FkKey = {
        table: tableName,
        cols: cols.join(","),
        targetTable,
        targetCols: targetCols.join(","),
      }
      add(
        fks,
        fkId(key),
        key,
        `(${cols.join(", ")}) → ${targetTable}(${targetCols.join(", ")})`,
      )
    }

    for (const idx of cfg.indexes) {
      const cols: ColRef[] = idx.config.columns.map((rawCol) => {
        if (rawCol && typeof rawCol === "object" && "indexConfig" in rawCol) {
          const ic = rawCol as {
            name: string
            indexConfig?: { order?: string }
          }
          return {
            expr: ic.name,
            desc: ic.indexConfig?.order === "desc",
          }
        }
        return { expr: stringifySqlish(rawCol), desc: false }
      })
      const whereRaw = stringifySqlish(idx.config.where)
      const where = canonicalise(whereRaw)
      const colId = colIdentity(cols)
      const unique = Boolean(idx.config.unique)
      const raw = indexLabel(cols, whereRaw, unique)
      if (unique) {
        const key: UniqueKey = { table: tableName, cols: colId, where, raw }
        add(uniques, uniqueId(key), key, raw)
      } else {
        const key: IndexKey = {
          table: tableName,
          cols: colId,
          unique: false,
          where,
          raw,
        }
        add(indexes, indexId(key), key, raw)
      }
    }
  }

  return { tables, columns, fks, uniques, indexes }
}

async function collectLive(sql: postgres.Sql) {
  const tableRows = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY 1
  `
  const tables = new Set(tableRows.map((r) => r.table_name))

  const colRows = await sql<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `
  const columns = new Map<string, { table: string; column: string }>()
  for (const r of colRows) {
    if (!tables.has(r.table_name)) continue
    columns.set(`${r.table_name}.${r.column_name}`, {
      table: r.table_name,
      column: r.column_name,
    })
  }

  const fkRows = await sql<
    {
      table_name: string
      cols: string[]
      target_table: string
      target_cols: string[]
    }[]
  >`
    SELECT
      src.relname AS table_name,
      array_agg(src_att.attname ORDER BY u.ord) AS cols,
      tgt.relname AS target_table,
      array_agg(tgt_att.attname ORDER BY u.ord) AS target_cols
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
    JOIN pg_attribute src_att
      ON src_att.attrelid = src.oid AND src_att.attnum = u.attnum
    JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS f(attnum, ord)
      ON f.ord = u.ord
    JOIN pg_attribute tgt_att
      ON tgt_att.attrelid = tgt.oid AND tgt_att.attnum = f.attnum
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND src.relkind = 'r'
    GROUP BY src.relname, tgt.relname, c.oid
  `
  const fks: Side<FkKey> = new Map()
  for (const r of fkRows) {
    const key: FkKey = {
      table: r.table_name,
      cols: r.cols.join(","),
      targetTable: r.target_table,
      targetCols: r.target_cols.join(","),
    }
    add(
      fks,
      fkId(key),
      key,
      `(${r.cols.join(", ")}) → ${r.target_table}(${r.target_cols.join(", ")})`,
    )
  }

  const uqRows = await sql<
    { table_name: string; cols: string[]; contype: string }[]
  >`
    SELECT
      src.relname AS table_name,
      array_agg(att.attname ORDER BY u.ord) AS cols,
      c.contype::text AS contype
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
    JOIN pg_attribute att
      ON att.attrelid = src.oid AND att.attnum = u.attnum
    WHERE c.contype IN ('p', 'u')
      AND n.nspname = 'public'
      AND src.relkind = 'r'
    GROUP BY src.relname, c.oid, c.contype
  `
  const uniques: Side<UniqueKey> = new Map()
  for (const r of uqRows) {
    const cols = r.cols.map((c) => ({ expr: c, desc: false }))
    const kind = r.contype === "p" ? "PRIMARY KEY" : "UNIQUE"
    const raw = `${kind} (${r.cols.join(", ")})`
    const key: UniqueKey = {
      table: r.table_name,
      cols: colIdentity(cols),
      where: "",
      raw,
    }
    add(uniques, uniqueId(key), key, raw)
  }

  const idxRows = await sql<
    {
      table_name: string
      index_name: string
      is_unique: boolean
      is_primary: boolean
      backs_constraint: boolean
      pred: string | null
      exprs: string[]
      desc_flags: boolean[]
      indexdef: string
    }[]
  >`
    SELECT
      t.relname AS table_name,
      i.relname AS index_name,
      ix.indisunique AS is_unique,
      ix.indisprimary AS is_primary,
      EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conindid = ix.indexrelid
          AND c.contype IN ('p', 'u')
      ) AS backs_constraint,
      pg_get_expr(ix.indpred, ix.indrelid) AS pred,
      array_agg(
        pg_get_indexdef(ix.indexrelid, k.ord::int, true)
        ORDER BY k.ord
      ) AS exprs,
      array_agg((ix.indoption[k.ord - 1] & 1) = 1 ORDER BY k.ord) AS desc_flags,
      pg_get_indexdef(ix.indexrelid) AS indexdef
    FROM pg_index ix
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
    WHERE n.nspname = 'public'
      AND t.relkind = 'r'
      AND NOT ix.indisexclusion
    GROUP BY t.relname, i.relname, ix.indisunique, ix.indisprimary,
             ix.indexrelid, ix.indpred, ix.indrelid
  `

  const indexes: Side<IndexKey> = new Map()
  for (const r of idxRows) {
    if (r.backs_constraint || r.is_primary) continue
    const cols: ColRef[] = r.exprs.map((expr, i) => {
      const stripped = expr.replace(/\s+(DESC|ASC)(\s+NULLS\s+(FIRST|LAST))?$/i, "")
      return { expr: stripped, desc: r.desc_flags[i] === true }
    })
    const whereRaw = r.pred ?? ""
    const where = canonicalise(whereRaw)
    const colId = colIdentity(cols)
    const raw = r.indexdef
    if (r.is_unique) {
      const key: UniqueKey = { table: r.table_name, cols: colId, where, raw }
      add(uniques, uniqueId(key), key, raw)
    } else {
      const key: IndexKey = {
        table: r.table_name,
        cols: colId,
        unique: false,
        where,
        raw,
      }
      add(indexes, indexId(key), key, raw)
    }
  }

  return { tables, columns, fks, uniques, indexes }
}

function diffMaps<T extends { table: string }>(
  live: Side<T>,
  mirror: Side<T>,
): { inDb: Array<T & { label: string }>; inMirror: Array<T & { label: string }> } {
  const inDb: Array<T & { label: string }> = []
  const inMirror: Array<T & { label: string }> = []
  for (const [id, row] of live) {
    if (!mirror.has(id)) inDb.push(row)
  }
  for (const [id, row] of mirror) {
    if (!live.has(id)) inMirror.push(row)
  }
  return { inDb, inMirror }
}

function counterpartRaw(
  row: { table: string; cols: string; raw?: string },
  other: Side<{ table: string; cols: string; raw?: string }>,
): string | undefined {
  const family = familyId(row.table, row.cols)
  const hits = [...other.values()].filter(
    (o) => familyId(o.table, o.cols) === family,
  )
  if (hits.length === 0) return undefined
  const sameCols = hits.filter((o) => o.cols === row.cols)
  const pick = sameCols.length === 1 ? sameCols[0] : hits.length === 1 ? hits[0] : undefined
  if (!pick) {
    return hits.map((h) => h.raw ?? h.label).join(" | ")
  }
  return pick.raw ?? pick.label
}

function indexDetail(
  row: { table: string; cols: string; raw?: string; label: string },
  other: Side<{ table: string; cols: string; raw?: string }>,
  otherSide: "db" | "mirror",
): string {
  const primary = row.raw ?? row.label
  const otherRaw = counterpartRaw(row, other)
  if (!otherRaw || otherRaw === primary) return primary
  return `${primary}\n      ${otherSide}: ${otherRaw}`
}

type Finding = {
  table: string
  kind: "column" | "fk" | "index"
  side: "db" | "mirror"
  detail: string
}

function mainOutput(findings: Finding[]): void {
  const missingCols = findings
    .filter((f) => f.kind === "column" && f.side === "mirror" && !f.detail.startsWith("("))
    .map((f) => ({ table: f.table, column: f.detail }))
  const banner = formatMirrorAheadMessage(missingCols)
  if (banner) {
    console.error(banner)
    console.error("")
  }

  if (findings.length === 0) {
    console.log("db:drift — clean. Live public schema matches the Drizzle mirrors.")
    return
  }

  const byTable = new Map<string, Finding[]>()
  for (const f of findings) {
    const list = byTable.get(f.table) ?? []
    list.push(f)
    byTable.set(f.table, list)
  }

  console.log("db:drift — live Postgres vs Drizzle mirrors")
  console.log("")

  for (const table of [...byTable.keys()].sort()) {
    console.log(`${table}`)
    const rows = byTable.get(table)!
    const groups: Array<[string, Finding[]]> = [
      ["columns in DB missing from mirror", rows.filter((r) => r.kind === "column" && r.side === "db")],
      ["columns in mirror missing from DB", rows.filter((r) => r.kind === "column" && r.side === "mirror")],
      ["foreign keys in DB missing from mirror", rows.filter((r) => r.kind === "fk" && r.side === "db")],
      ["foreign keys in mirror missing from DB", rows.filter((r) => r.kind === "fk" && r.side === "mirror")],
      ["indexes / uniques in DB missing from mirror", rows.filter((r) => r.kind === "index" && r.side === "db")],
      ["indexes / uniques in mirror missing from DB", rows.filter((r) => r.kind === "index" && r.side === "mirror")],
    ]
    for (const [title, items] of groups) {
      if (items.length === 0) continue
      console.log(`  ${title}:`)
      for (const item of items) {
        console.log(`    - ${item.detail}`)
      }
    }
    console.log("")
  }

  console.log(
    `Total: ${findings.length} finding(s) across ${byTable.size} table(s).`,
  )
}

async function main(): Promise<number> {
  loadEnvFile(".env.local")
  loadEnvFile(".env")
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url) {
    console.error(
      "DIRECT_URL or DATABASE_URL is not set — db:drift needs a Postgres URL.",
    )
    return 2
  }

  const sql = postgres(url, { max: 1, prepare: false })
  try {
    await sql`SET default_transaction_read_only = on`
    await sql`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`

    const mirror = collectMirror()
    const live = await collectLive(sql)

    const findings: Finding[] = []

    for (const table of live.tables) {
      if (!mirror.tables.has(table)) {
        findings.push({
          table,
          kind: "column",
          side: "db",
          detail: "(table exists in DB, absent from mirror)",
        })
      }
    }
    for (const table of mirror.tables) {
      if (!live.tables.has(table)) {
        findings.push({
          table,
          kind: "column",
          side: "mirror",
          detail: "(table exists in mirror, absent from DB)",
        })
      }
    }

    for (const [id, col] of live.columns) {
      if (!mirror.columns.has(id)) {
        findings.push({
          table: col.table,
          kind: "column",
          side: "db",
          detail: col.column,
        })
      }
    }
    const missingCols = findMirrorColumnsMissingFromLive(
      mirror.columns.values(),
      live.columns.values(),
    )
    for (const col of missingCols) {
      findings.push({
        table: col.table,
        kind: "column",
        side: "mirror",
        detail: col.column,
      })
    }

    const fkDiff = diffMaps(live.fks, mirror.fks)
    for (const row of fkDiff.inDb) {
      findings.push({ table: row.table, kind: "fk", side: "db", detail: row.label })
    }
    for (const row of fkDiff.inMirror) {
      findings.push({
        table: row.table,
        kind: "fk",
        side: "mirror",
        detail: row.label,
      })
    }

    const uqDiff = diffMaps(live.uniques, mirror.uniques)
    for (const row of uqDiff.inDb) {
      findings.push({
        table: row.table,
        kind: "index",
        side: "db",
        detail: indexDetail(row, mirror.uniques, "mirror"),
      })
    }
    for (const row of uqDiff.inMirror) {
      findings.push({
        table: row.table,
        kind: "index",
        side: "mirror",
        detail: indexDetail(row, live.uniques, "db"),
      })
    }

    const idxDiff = diffMaps(live.indexes, mirror.indexes)
    for (const row of idxDiff.inDb) {
      findings.push({
        table: row.table,
        kind: "index",
        side: "db",
        detail: indexDetail(row, mirror.indexes, "mirror"),
      })
    }
    for (const row of idxDiff.inMirror) {
      findings.push({
        table: row.table,
        kind: "index",
        side: "mirror",
        detail: indexDetail(row, live.indexes, "db"),
      })
    }

    mainOutput(findings)
    return findings.length === 0 ? 0 : 1
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main()
  .then((code) => {
    process.exit(code)
  })
  .catch((err) => {
    console.error(err)
    process.exit(2)
  })
