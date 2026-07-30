import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema"

/**
 * Runtime DB client — uses the Supabase **transaction pooler** URL
 * (`DATABASE_URL`, port 6543). Migrations use `DIRECT_URL` via drizzle-kit.
 *
 * Schema-only in Phase 0/1: no app route may import this module yet.
 */
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set (Supabase transaction pooler, port 6543)",
    )
  }
  return url
}

const globalForDb = globalThis as unknown as {
  __avPostgres?: ReturnType<typeof postgres>
  __avDb?: ReturnType<typeof drizzle<typeof schema>>
}

export function getClient() {
  if (!globalForDb.__avPostgres) {
    globalForDb.__avPostgres = postgres(requireDatabaseUrl(), {
      prepare: false, // required for PgBouncer transaction mode
      max: 10,
    })
  }
  return globalForDb.__avPostgres
}

export function getDb() {
  if (!globalForDb.__avDb) {
    globalForDb.__avDb = drizzle(getClient(), { schema })
  }
  return globalForDb.__avDb
}

/** Lazy proxy so importing `db` does not connect until first query. */
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop, receiver) {
    const instance = getDb()
    const value = Reflect.get(instance, prop, receiver)
    return typeof value === "function" ? value.bind(instance) : value
  },
})

export type Db = ReturnType<typeof getDb>
export { schema }
