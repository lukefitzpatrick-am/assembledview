import "server-only"

import type snowflake from "snowflake-sdk"

import { isFeatureOn } from "@/lib/features/server"
import { sessionExecuteRows, sessionExecuteVoid } from "@/lib/snowflake/snowflakeSession"
import type { LabelMapSql } from "./labelMapActive"

/** `LabelMapSql` over an open Snowflake session (the caller's transaction). */
export function labelMapSqlForSession(session: snowflake.Connection): LabelMapSql {
  return {
    rows: <T = Record<string, unknown>>(sqlText: string, binds: unknown[]) =>
      sessionExecuteRows<T>(session, sqlText, binds),
    exec: (sqlText: string, binds: unknown[]) => sessionExecuteVoid(session, sqlText, binds),
  }
}

/** Switch `relabel_map_one_active_guard`. A failed read counts as off (today's behaviour). */
export async function readRelabelMapOneActiveGuard(): Promise<boolean> {
  try {
    return await isFeatureOn("relabel_map_one_active_guard")
  } catch (err) {
    console.warn("[relabel] relabel_map_one_active_guard read failed; treating as off", err)
    return false
  }
}
