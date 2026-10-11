import "server-only"

import { sql } from "drizzle-orm"
import { getDb, type Db } from "@/db"

/** Select surface shared by the pool client and a transaction handle. */
type Selectable = Pick<Db, "select">

/**
 * One short transaction on the transaction pooler.
 * `SET LOCAL` dies with COMMIT, so the 5s / 15s caps do not leak to the next
 * client that reuses the server connection. The select must run on `tx`.
 */
export async function withPgReadLimits<T>(run: (tx: Selectable) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '5s'`)
    await tx.execute(sql`set local statement_timeout = '15s'`)
    return run(tx)
  })
}

/** `readLimits` wraps the select. Unset keeps the shared autocommit client. */
export async function pgRead<T>(
  readLimits: boolean | undefined,
  run: (db: Selectable) => Promise<T>,
): Promise<T> {
  if (!readLimits) return run(getDb())
  return withPgReadLimits(run)
}
