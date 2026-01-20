import "server-only"

import { execWithRetry } from "@/lib/snowflake/pool"

const DEBUG_SNOWFLAKE = process.env.NEXT_PUBLIC_DEBUG_SNOWFLAKE === "true"

export async function querySnowflake<T = any>(sqlText: string, binds: any[] = []) {
  const requestId = Math.random().toString(36).slice(2, 8)
  const start = Date.now()
  if (DEBUG_SNOWFLAKE) {
    console.info("[snowflake][query] start", {
      requestId,
      rows_expected: Array.isArray(binds) ? binds.length : "?",
    })
  }
  const rows = await execWithRetry<T>(sqlText, binds, { requestId })
  if (DEBUG_SNOWFLAKE) {
    console.info("[snowflake][query] done", { requestId, ms: Date.now() - start, rows: rows?.length ?? 0 })
  }
  return rows
}
