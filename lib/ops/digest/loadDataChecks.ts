import "server-only"

import { isFeatureOn } from "@/lib/features/server"
import { querySnowflake } from "@/lib/snowflake/query"

import { loadPacingDigestDataChecks, type PacingDigestDataChecks } from "./dataChecks"

/**
 * Each check query stops after this; a timeout is "check not available". The
 * switch read and both checks also sit inside one overall deadline
 * (`DATA_CHECKS_DEADLINE_MS`, 45 s, in `dataChecks.ts`), which comes first.
 */
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
