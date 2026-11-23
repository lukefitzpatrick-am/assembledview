/**
 * query_data: Ava runs her own read-only SELECT on Supabase or Snowflake.
 * Admin only, switch ava_data_query (off by default).
 *
 * The database role is the boundary, not the text check:
 * - Supabase runs on AVA_DATABASE_URL as ava_readonly (0003): read-only
 *   transactions, a 5 s statement timeout, SELECT only on the granted tables,
 *   ava_read RLS policies. Each query runs in a read-only transaction that
 *   always rolls back, so a set_config() can't outlive it on a pooled backend.
 * - Snowflake runs on its own connection as role AVA_READONLY with no
 *   secondary roles (SELECT on ASSEMBLEDVIEW.MART only, sql/snowflake/roles).
 * The text check only gives Ava a plain refusal before a round trip.
 */
import "server-only"

import { z } from "zod"

import { getAvaClient } from "@/db/avaClient"
import { BUSINESS_TZ } from "@/lib/dates/melbourne"
import { destroyConnection, executeWithTimeout, getServerlessConnection } from "@/lib/snowflake/pool"

import { jsonContent } from "./helpers"
import { parseZodOrError, requireAvaDbOrSoftFail } from "./postgresShared"
import type AvaTool from "./types"
import type { AvaToolContext, AvaToolResult } from "./types"

const SNOWFLAKE_AVA_ROLE = "AVA_READONLY"
export const QUERY_DATA_ROW_CAP = 200
const CELL_CAP = 500
const CONTENT_CAP = 60_000
const SNOWFLAKE_TIMEOUT_S = 30

const queryDataInput = z.object({
  source: z.enum(["supabase", "snowflake"]),
  sql: z.string().trim().min(1).max(8000).optional(),
  table: z.string().trim().regex(/^[A-Za-z0-9_]+$/).optional(),
})

/** One SELECT or WITH statement, a trailing semicolon allowed. Null refuses. */
export function readOnlySql(raw: string): string | null {
  const sql = raw.trim().replace(/;\s*$/, "")
  return /^(select|with)\b/i.test(sql) && !sql.includes(";") ? sql : null
}

/** Caps rows at the database (one extra row tells us it was cut). */
export function wrapWithLimit(sql: string, cap = QUERY_DATA_ROW_CAP): string {
  return `select * from (\n${sql}\n) ava_q limit ${cap + 1}`
}

function describeSql(source: "supabase" | "snowflake", table: string | undefined): { sql: string; binds: string[] } {
  const schema = source === "supabase" ? "public" : "MART"
  const cols = source === "supabase" ? "information_schema.columns" : "ASSEMBLEDVIEW.information_schema.columns"
  if (table) {
    return {
      sql: `select column_name, data_type, is_nullable from ${cols} where table_schema = ${source === "supabase" ? "$1" : "?"} and lower(table_name) = lower(${source === "supabase" ? "$2" : "?"}) order by ordinal_position`,
      binds: [schema, table],
    }
  }
  return {
    sql: `select table_name, count(*) as columns from ${cols} where table_schema = ${source === "supabase" ? "$1" : "?"} group by table_name order by table_name`,
    binds: [schema],
  }
}

function cell(v: unknown): unknown {
  if (typeof v === "string" && v.length > CELL_CAP) return `${v.slice(0, CELL_CAP)}…`
  if (typeof v === "bigint") return v.toString()
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const s = JSON.stringify(v)
    return s.length > CELL_CAP ? `${s.slice(0, CELL_CAP)}…` : v
  }
  return v
}

/** Rows to the model: capped rows, capped cells, capped size. */
export function shapeRows(source: string, rows: Record<string, unknown>[], cap = QUERY_DATA_ROW_CAP) {
  const kept = rows.slice(0, cap).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cell(v)])))
  let truncated = rows.length > cap
  let content = jsonContent({ source, rowCount: kept.length, truncated, rows: kept })
  while (content.length > CONTENT_CAP && kept.length > 1) {
    kept.length = Math.floor(kept.length / 2)
    truncated = true
    content = jsonContent({ source, rowCount: kept.length, truncated, rows: kept })
  }
  return content
}

const ROLLBACK = new Error("query_data rollback")

async function runSupabase(sql: string, binds: string[]): Promise<Record<string, unknown>[]> {
  let rows: Record<string, unknown>[] = []
  await getAvaClient()
    .begin("read only", async (tx) => {
      rows = Array.from(await tx.unsafe(sql, binds)) as Record<string, unknown>[]
      throw ROLLBACK
    })
    .catch((err) => {
      if (err !== ROLLBACK) throw err
    })
  return rows
}

async function runSnowflake(sql: string, binds: string[]): Promise<Record<string, unknown>[]> {
  const id = `ava-${Math.random().toString(36).slice(2, 8)}`
  const conn = await getServerlessConnection(id, undefined, SNOWFLAKE_AVA_ROLE)
  try {
    for (const s of [
      "USE SECONDARY ROLES NONE",
      `ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = ${SNOWFLAKE_TIMEOUT_S}`,
      `ALTER SESSION SET TIMEZONE = '${BUSINESS_TZ}'`,
      "ALTER SESSION SET QUERY_TAG = 'ava_query_data'",
    ]) {
      await executeWithTimeout(conn, s, [], 10_000, "ava_session", id)
    }
    return await executeWithTimeout(conn, sql, binds, (SNOWFLAKE_TIMEOUT_S + 5) * 1000, "ava_query_data", id)
  } finally {
    destroyConnection(conn)
  }
}

export async function queryDataGate(context: Pick<AvaToolContext, "roles">): Promise<AvaToolResult | null> {
  return context.roles.includes("admin") ? null : { content: "query_data is for admins only.", isError: true }
}

export const queryDataTool: AvaTool = {
  definition: {
    name: "query_data",
    description: [
      "Read-only SQL on AssembledView data, for questions the other tools can't answer.",
      "Prefer the purpose-built tools first: they apply the money and pacing rules.",
      "source supabase: the app's system of record (Postgres, schema public, only the tables Ava is granted).",
      "source snowflake: ASSEMBLEDVIEW.MART delivery and pacing facts (Snowflake SQL).",
      "Leave out sql to list tables; pass table (no sql) to list its columns. Look before you query.",
      "sql: one SELECT or WITH statement, no semicolons inside. At most 200 rows come back; aggregate in SQL.",
      "For a ranked or top-n answer put your own ORDER BY and LIMIT (200 or less) inside the query.",
      "Rules: plan money columns in Postgres are integer cents (divide by 100 for dollars).",
      "The published version is media_plan_masters.published_version_id, never max(version_number).",
      "Never compute a media/fee split yourself; say the figure is raw and point to the plan page.",
    ].join(" "),
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["supabase", "snowflake"] },
        sql: { type: "string", description: "One SELECT or WITH statement." },
        table: { type: "string", description: "Table name, to list its columns (used when sql is absent)." },
      },
      required: ["source"],
    },
  },
  async execute(input: unknown, context: AvaToolContext): Promise<AvaToolResult> {
    const gate = await queryDataGate(context)
    if (gate) return gate
    const parsed = parseZodOrError(queryDataInput, input)
    if (!parsed.ok) return { content: parsed.content, isError: true }
    const { source, sql: raw, table } = parsed.data
    if (source === "supabase") {
      const db = requireAvaDbOrSoftFail()
      if (!db.ok) return db.result
    }
    let sql: string
    let binds: string[] = []
    if (raw) {
      const ok = readOnlySql(raw)
      if (!ok) return { content: "query_data runs one SELECT or WITH statement only, with no semicolons inside.", isError: true }
      sql = wrapWithLimit(ok)
    } else {
      ;({ sql, binds } = describeSql(source, table))
    }
    const start = Date.now()
    try {
      const rows = source === "supabase" ? await runSupabase(sql, binds) : await runSnowflake(sql, binds)
      console.info("[query_data]", { source, describe: !raw, rows: rows.length, ms: Date.now() - start })
      return { content: shapeRows(source, rows) }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn("[query_data] failed", { source, ms: Date.now() - start, message })
      return { content: `The ${source} query failed: ${message.slice(0, 300)}`, isError: true }
    }
  },
}
