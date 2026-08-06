import "server-only"

import { eq } from "drizzle-orm"
import { db, schema, type Db } from "@/db"

const { clients } = schema

/**
 * App-level clients.id existence check for Codex writes.
 * Not a DB FK — that waits for T6 after the clients ETL settles (DI-12).
 */
export async function codexClientExists(
  clientId: number,
  database: Db = db
): Promise<boolean> {
  if (!Number.isFinite(clientId) || clientId < 1) return false
  const [row] = await database
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1)
  return row != null
}
