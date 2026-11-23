import "server-only"

import { isFeatureOn } from "@/lib/features/server"
import { querySnowflake } from "@/lib/snowflake/query"

import { getUnmappedDelivery } from "@/lib/pacing/admin/unmappedDelivery"
import { relabelsHref } from "@/lib/pacing/relabel/shared/relabelPageUrl"

import {
  loadDigestUnmatchedDelivery,
  loadPacingDigestDataChecks,
  type DigestUnmatchedDelivery,
  type PacingDigestDataChecks,
} from "./dataChecks"

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

/** S5: the unmatched delivery count with live wiring (switch `unmatched_delivery_queue`, Snowflake). */
export function loadDigestUnmatched(todayISO: string): Promise<DigestUnmatchedDelivery | null> {
  const base = (process.env.APP_BASE_URL ?? "").trim().replace(/\/$/, "")
  return loadDigestUnmatchedDelivery({
    isOn: () => isFeatureOn("unmatched_delivery_queue"),
    load: () =>
      getUnmappedDelivery((sqlText, binds, options) =>
        querySnowflake<Record<string, unknown>>(sqlText, binds, { ...options, timeoutMs: DATA_CHECK_TIMEOUT_MS }),
      ),
    todayISO,
    // An email needs an absolute link: none when APP_BASE_URL is not set.
    href: base ? `${base}${relabelsHref({ tab: "unmapped" })}` : "",
  })
}
