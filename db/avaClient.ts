import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema"

/**
 * AVA-only Postgres client — ALWAYS uses `AVA_DATABASE_URL` (role `ava_readonly`).
 * Never falls back to `DATABASE_URL` / owner. Soft-fail when unset so the existing
 * Xano-backed AVA tools keep working.
 *
 * Pool: max 2, prepare:false (Supabase transaction pooler).
 */

export const AVA_ROW_CAP = 500
export const AVA_SEARCH_CAP = 200

export function isAvaDbConfigured(): boolean {
  return Boolean(process.env.AVA_DATABASE_URL?.trim())
}

function requireAvaDatabaseUrl(): string {
  const url = process.env.AVA_DATABASE_URL?.trim()
  if (!url) {
    throw new Error(
      "AVA Postgres is not configured (AVA_DATABASE_URL unset). Use get_campaign_context / get_media_plan_summary instead.",
    )
  }
  return url
}

const globalForAva = globalThis as unknown as {
  __avAvaPostgres?: ReturnType<typeof postgres>
  __avAvaDb?: ReturnType<typeof drizzle<typeof schema>>
  __avAvaDbOverride?: ReturnType<typeof drizzle<typeof schema>> | null
}

/** Test-only: inject a Drizzle instance (or null to clear). */
export function setAvaDbForTests(
  db: ReturnType<typeof drizzle<typeof schema>> | null,
): void {
  globalForAva.__avAvaDbOverride = db
}

export function getAvaClient() {
  if (!globalForAva.__avAvaPostgres) {
    globalForAva.__avAvaPostgres = postgres(requireAvaDatabaseUrl(), {
      prepare: false,
      max: 2,
    })
  }
  return globalForAva.__avAvaPostgres
}

export function getAvaDb() {
  if (globalForAva.__avAvaDbOverride) return globalForAva.__avAvaDbOverride
  if (!globalForAva.__avAvaDb) {
    globalForAva.__avAvaDb = drizzle(getAvaClient(), { schema })
  }
  return globalForAva.__avAvaDb
}

export type AvaDb = ReturnType<typeof getAvaDb>

/**
 * Hard row-cap helper. Returns the trimmed slice plus truncation metadata.
 * Default cap is {@link AVA_ROW_CAP} (500).
 */
export function withRowCap<T>(
  rows: readonly T[],
  cap: number = AVA_ROW_CAP,
): { rows: T[]; truncated: boolean; total: number } {
  const total = rows.length
  if (total <= cap) return { rows: [...rows], truncated: false, total }
  return { rows: rows.slice(0, cap), truncated: true, total }
}

export { schema }
