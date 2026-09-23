import "server-only"

import { getDb } from "@/db"
import {
  insertPacingOrphanFix,
  selectPacingOrphanFixes,
  type PacingOrphanFixDb,
  type PacingOrphanFixInput,
  type PacingOrphanFixRow,
} from "@/lib/pacing/admin/pacingOrphanFixRows"

export type { PacingOrphanFixInput, PacingOrphanFixRow }

function db(): PacingOrphanFixDb {
  return getDb() as unknown as PacingOrphanFixDb
}

/** Audit row on Postgres `pacing_orphan_fixes`. */
export async function createPacingOrphanFix(
  input: PacingOrphanFixInput,
): Promise<PacingOrphanFixRow> {
  return insertPacingOrphanFix(db(), input)
}

export async function readPacingOrphanFixRows(): Promise<Record<string, unknown>[]> {
  return selectPacingOrphanFixes(db())
}
