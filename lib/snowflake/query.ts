import "server-only"

import { execWithRetry } from "@/lib/snowflake/pool"

export async function querySnowflake<T = any>(sqlText: string, binds: any[] = []) {
  return execWithRetry<T>(sqlText, binds)
}
