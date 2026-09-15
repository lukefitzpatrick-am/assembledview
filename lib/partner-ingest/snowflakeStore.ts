import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
import {
  sessionExecuteVoid,
  withSnowflakeSession,
} from "@/lib/snowflake/snowflakeSession"

import { createPartnerSnowflakeWriter } from "./snowflakeWriter"
import type { PartnerSnowflakePort } from "./runPartnerIngest"

export function createPartnerSnowflakePort(): PartnerSnowflakePort {
  return createPartnerSnowflakeWriter({
    query: (sqlText, binds = []) => querySnowflake(sqlText, binds),
    withSession: withSnowflakeSession,
    executeVoid: sessionExecuteVoid,
  })
}
