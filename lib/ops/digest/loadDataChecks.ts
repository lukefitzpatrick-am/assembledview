import "server-only"

import { isFeatureOn } from "@/lib/features/server"
import { querySnowflake } from "@/lib/snowflake/query"

import { loadPacingDigestDataChecks, type PacingDigestDataChecks } from "./dataChecks"

/** Each check query stops after this; a timeout is "check not available". */
const DATA_CHECK_TIMEOUT_MS = 60_000

/** The digest's data checks with live wiring (switch `pacing_digest_data_checks`, Snowflake). */
export function loadDigestDataChecks(): Promise<PacingDigestDataChecks | null> {
  return loadPacingDigestDataChecks({
    isOn: () => isFeatureOn("pacing_digest_data_checks"),
    query: (sqlText) =>
      querySnowflake<Record<string, unknown>>(sqlText, [], {
        label: "pacing-digest-data-checks",
        timeoutMs: DATA_CHECK_TIMEOUT_MS,
      }),
  })
}
