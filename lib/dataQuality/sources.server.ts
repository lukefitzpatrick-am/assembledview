/**
 * The Data quality queue's stage 1 sources (S17, B60 Q2 option A). Each turns
 * a check's full result into findings and writes them through `recordFindings`.
 *
 * - Publish validation (S1) on every published version
 *   (`media_plan_masters.published_version_id`): the refuse list, one item
 *   per rule, plan and line. Plans of test and internal clients
 *   (`clients.is_test_client`) are skipped, as the finance checks skip them.
 *   It runs whether or not `publish_validation` is on: that switch decides
 *   whether publish refuses, and the plan pages list the same problems either
 *   way. The queue is the list to clear before it goes on.
 * - Relabel drift: an applied relabel whose label map row is missing or points
 *   elsewhere. Legacy map rows (no relabel) are not problems and write nothing.
 *
 * The B34 Snowflake checks (CM360 drift, label map duplicates) are not
 * sources yet: they read a sample, not every row, and a sample would resolve
 * items still broken. Stage 2.
 *
 * Runs once a day from the relabel-drift cron (07:15 Melbourne).
 */
import "server-only"

import { sql } from "drizzle-orm"

import { getDb, type Db } from "@/db"
import { isFeatureOn } from "@/lib/features/server"
import { publishPlanFromRows, type VersionLineRow } from "@/lib/mediaplan/publishValidation.server"
import { validatePlanForPublish } from "@/lib/mediaplan/publishValidation"
import type { RelabelDriftFinding } from "@/lib/pacing/relabel/drift"
import { relabelsHref } from "@/lib/pacing/relabel/shared/relabelPageUrl"
import { rowsOf } from "@/lib/xero/dbRows"

import { recordFindings, type DataQualityFinding, type RecordResult } from "./items.server"
import { PUBLISH_RULES, type DataQualityRuleKey } from "./rules"

type Exec = Pick<Db, "execute">

const PUBLISH_RULE_KEYS = PUBLISH_RULES.map((r) => `publish.${r}` as const)

function planEditHref(mbaNumber: string): string {
  return `/mediaplans/mba/${encodeURIComponent(mbaNumber)}/edit`
}

/** Findings for one published plan: its refusals grouped by rule and line, messages joined in line order. */
function publishFindingsForPlan(mbaNumber: string, rows: readonly VersionLineRow[]): DataQualityFinding[] {
  const byKey = new Map<string, DataQualityFinding>()
  for (const problem of validatePlanForPublish(publishPlanFromRows(rows)).refuse) {
    const ruleKey = `publish.${problem.rule}` as DataQualityRuleKey
    if (!(PUBLISH_RULE_KEYS as readonly string[]).includes(ruleKey)) continue
    const lineItemId = problem.lineItemId || null
    const key = `${ruleKey}|${lineItemId ?? ""}`
    const found = byKey.get(key)
    if (found) {
      found.message = `${found.message} ${problem.message}`.slice(0, 2000)
      continue
    }
    byKey.set(key, {
      ruleKey,
      mbaNumber,
      lineItemId,
      message: problem.message.slice(0, 2000),
      fixLabel: "Open the plan",
      fixHref: planEditHref(mbaNumber),
    })
  }
  return [...byKey.values()]
}

/** Every published version's refusals, read in one query. */
async function publishValidationFindings(db: Exec): Promise<DataQualityFinding[]> {
  const rows = rowsOf<VersionLineRow & { mba_number: string }>(
    await db.execute(sql`
      SELECT m.mba_number, v.campaign_start_date::text AS campaign_start_date, v.campaign_end_date::text AS campaign_end_date,
        li.line_item_id, li.channel::text AS channel, li.buy_type, li.publisher, li.platform, li.attrs, li.bursts
      FROM media_plan_masters m
      JOIN media_plan_versions v ON v.id = m.published_version_id
      LEFT JOIN clients c ON c.id = m.client_id
      LEFT JOIN line_items li ON li.version_id = v.id
      WHERE NOT coalesce(c.is_test_client, false)
      ORDER BY m.mba_number, li.position
    `),
  )
  const byPlan = new Map<string, VersionLineRow[]>()
  for (const row of rows) {
    const list = byPlan.get(row.mba_number) ?? []
    list.push(row)
    byPlan.set(row.mba_number, list)
  }
  return [...byPlan].flatMap(([mba, planRows]) => publishFindingsForPlan(mba, planRows))
}

/** Drift findings with a plan; one per plan and target line (two entities on one line share an item). */
function relabelDriftFindings(drift: readonly RelabelDriftFinding[]): DataQualityFinding[] {
  const byKey = new Map<string, DataQualityFinding>()
  for (const d of drift) {
    const mbaNumber = d.mbaNumber?.trim()
    if (d.kind !== "drift" || !mbaNumber) continue
    const lineItemId = d.relabelLineItemId || null
    const key = `${mbaNumber}|${lineItemId ?? ""}`
    const found = byKey.get(key)
    if (found) {
      found.message = `${found.message} ${d.message}`.slice(0, 2000)
      continue
    }
    byKey.set(key, {
      ruleKey: "relabel.drift",
      mbaNumber,
      lineItemId,
      message: d.message.slice(0, 2000),
      fixLabel: "Open the relabel log",
      fixHref: relabelsHref({ tab: "log", mba: mbaNumber, id: d.relabelId ?? null }),
    })
  }
  return [...byKey.values()]
}

export type SweepResult = { publish: RecordResult | null; relabelDrift: RecordResult | null }

/**
 * The daily sweep. Null when `data_quality_queue` is off (nothing read or
 * written). `relabelDrift` is the full drift report's findings, or null when
 * the drift check failed: then relabel items are left as they are.
 *
 * One transaction under an advisory lock: a second sweep waits for the first
 * to commit, then reads afresh, so it never resolves an item the other has
 * just found again.
 */
export async function runDataQualitySweep(
  relabelDrift: readonly RelabelDriftFinding[] | null,
  db: Pick<Db, "transaction"> = getDb(),
): Promise<SweepResult | null> {
  if (!(await isFeatureOn("data_quality_queue"))) return null
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('data_quality_sweep'))`)
    const publish = await recordFindings(PUBLISH_RULE_KEYS, await publishValidationFindings(tx), tx)
    const drift = relabelDrift ? await recordFindings(["relabel.drift"], relabelDriftFindings(relabelDrift), tx) : null
    return { publish, relabelDrift: drift }
  })
}
