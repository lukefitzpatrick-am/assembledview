/**
 * Applied true-up schedule fixes for an MBA, as reset-guard locks.
 * Marker gated (0109): before the migration there are no locks.
 */
import "server-only"

import { sql, type SQL } from "drizzle-orm"

import { getDb } from "@/db"
import { rowsOf } from "@/lib/xero/dbRows"

import { isTrueUpMigrationApplied } from "./marker"
import { parseTrueUpLocks, type TrueUpLock } from "./resetGuard"

export type LockExecutor = { execute: (q: SQL) => Promise<unknown> }

export function trueUpLocksSql(mbaNumber: string): SQL {
  return sql`
    SELECT id, component, months, to_char(as_of_month, 'YYYY-MM') AS as_of_month
    FROM true_up_actions
    WHERE action = 'schedule'
      AND status = 'applied'
      AND lower(btrim(mba_number)) = lower(btrim(${mbaNumber}))
    ORDER BY id
  `
}

export async function loadTrueUpLocks(
  mbaNumber: string,
  deps: { exec?: LockExecutor; migrationApplied?: () => Promise<boolean> } = {},
): Promise<TrueUpLock[]> {
  const mba = String(mbaNumber ?? "").trim()
  if (!mba) return []
  if (!(await (deps.migrationApplied ?? (() => isTrueUpMigrationApplied()))())) return []
  const exec = deps.exec ?? getDb()
  return parseTrueUpLocks(rowsOf<Record<string, unknown>>(await exec.execute(trueUpLocksSql(mba))))
}
