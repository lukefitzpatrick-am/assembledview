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
 * - Unmatched delivery (S5b, C-387; also needs `unmatched_delivery_queue`):
 *   the Relabels > Unmapped queue read (30 days of the three pacing facts),
 *   one item per plan and line where the suggestion names them, else per
 *   campaign. The plan's owner owns it; with no plan, the ops list (Luke).
 *   Test-client plans are skipped. The read stops at 60 s (a failed read).
 *   A failed read leaves the open items as they are: no data is not "fixed".
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
import { getOpsEmailRecipients } from "@/lib/email/sendHtmlEmail"
import { isFeatureOn } from "@/lib/features/server"
import { publishPlanFromRows, type VersionLineRow } from "@/lib/mediaplan/publishValidation.server"
import { validatePlanForPublish } from "@/lib/mediaplan/publishValidation"
import { formatMoney } from "@/lib/format/money"
import { getUnmappedDelivery, type UnmappedDeliveryRow } from "@/lib/pacing/admin/unmappedDelivery"
import type { UnmappedPlacementQueryFn } from "@/lib/pacing/admin/unmappedPlacements"
import type { RelabelDriftFinding } from "@/lib/pacing/relabel/drift"
import { relabelsHref } from "@/lib/pacing/relabel/shared/relabelPageUrl"
import { querySnowflake } from "@/lib/snowflake/query"
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

/** The plan column of an unmatched delivery item whose suggestion names no plan. */
const NO_PLAN = "No plan"

/**
 * S5b: one finding per plan and line where the queue's suggestion names them
 * (a client stem from a campaign prefix is not a plan), else per campaign.
 * Entities that share a key share an item, messages joined.
 */
function unmatchedDeliveryFindings(
  rows: readonly UnmappedDeliveryRow[],
  noPlanOwner: string | null,
  testClientMbas: ReadonlySet<string>,
): DataQualityFinding[] {
  const byKey = new Map<string, DataQualityFinding>()
  for (const row of rows) {
    const plan = row.suggestion.kind === "rename" ? null : row.suggestion.mba
    if (plan && testClientMbas.has(plan.toLowerCase())) continue // as the publish source skips them
    const campaign = row.campaignName.trim() || `${row.channel} ${row.platformEntityId}`
    const lineItemId = (plan && row.suggestion.lineItemId) || `Campaign: ${campaign}`.slice(0, 200)
    const mbaNumber = plan ?? NO_PLAN
    const message = `${row.channel} ${row.name} (${row.platformEntityId}): ${formatMoney(row.spend)} from ${row.firstDate} to ${row.lastDate} on no plan line. ${row.suggestion.action}`
    const key = `${mbaNumber}|${lineItemId}`
    const found = byKey.get(key)
    if (found) {
      found.message = `${found.message} ${message}`.slice(0, 2000)
      continue
    }
    byKey.set(key, {
      ruleKey: "delivery.unmatched",
      mbaNumber,
      lineItemId,
      message: message.slice(0, 2000),
      fixLabel: "Open the unmatched queue",
      fixHref: relabelsHref({ tab: "unmapped", mba: plan }),
      ...(plan ? {} : { ownerEmail: noPlanOwner }),
    })
  }
  return [...byKey.values()]
}

/** S5b: MBAs of test and internal clients' plans, lower case. */
async function testClientMbas(db: Exec): Promise<Set<string>> {
  const rows = rowsOf<{ mba: string }>(
    await db.execute(sql`
      SELECT lower(m.mba_number) AS mba FROM media_plan_masters m JOIN clients c ON c.id = m.client_id
      WHERE c.is_test_client
    `),
  )
  return new Set(rows.map((r) => r.mba))
}

/** S5b: the whole unmatched read stops here, as the digest's does, so the cron keeps its 300 s. */
const UNMATCHED_READ_DEADLINE_MS = 60_000

/** The live warehouse read, each query capped like the digest's (`loadDigestUnmatched`). */
const liveQuery: UnmappedPlacementQueryFn = (sqlText, binds, options) =>
  querySnowflake<Record<string, unknown>>(sqlText, binds, { ...options, timeoutMs: UNMATCHED_READ_DEADLINE_MS })

/** S5b: the queue's rows, or null when `unmatched_delivery_queue` is off, the read fails or passes the deadline. */
async function readUnmatchedDelivery(query: UnmappedPlacementQueryFn, deadlineMs: number): Promise<UnmappedDeliveryRow[] | null> {
  if (!(await isFeatureOn("unmatched_delivery_queue"))) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`unmatched delivery read passed ${deadlineMs} ms`)), deadlineMs)
    })
    return (await Promise.race([getUnmappedDelivery(query), deadline])).rows
  } catch (err) {
    console.warn("[data-quality] unmatched delivery not available; its open items are left as they are", err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export type SweepResult = {
  publish: RecordResult | null
  relabelDrift: RecordResult | null
  /** S5b: absent when `unmatched_delivery_queue` is off or the queue read failed. */
  unmatchedDelivery?: RecordResult
}

/**
 * The daily sweep. Null when `data_quality_queue` is off (nothing read or
 * written). `relabelDrift` is the full drift report's findings, or null when
 * the drift check failed: then relabel items are left as they are. The
 * unmatched delivery queue is read (Snowflake) before the transaction opens.
 *
 * One transaction under an advisory lock: a second sweep waits for the first
 * to commit, then reads afresh, so it never resolves an item the other has
 * just found again.
 */
export async function runDataQualitySweep(
  relabelDrift: readonly RelabelDriftFinding[] | null,
  db: Pick<Db, "transaction"> = getDb(),
  query: UnmappedPlacementQueryFn = liveQuery,
  unmatchedDeadlineMs: number = UNMATCHED_READ_DEADLINE_MS,
): Promise<SweepResult | null> {
  if (!(await isFeatureOn("data_quality_queue"))) return null
  const unmatched = await readUnmatchedDelivery(query, unmatchedDeadlineMs)
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('data_quality_sweep'))`)
    const publish = await recordFindings(PUBLISH_RULE_KEYS, await publishValidationFindings(tx), tx)
    const drift = relabelDrift ? await recordFindings(["relabel.drift"], relabelDriftFindings(relabelDrift), tx) : null
    const delivery = unmatched
      ? await recordFindings(
          ["delivery.unmatched"],
          unmatchedDeliveryFindings(unmatched, getOpsEmailRecipients()[0]?.trim().toLowerCase() || null, await testClientMbas(tx)),
          tx,
        )
      : null
    return { publish, relabelDrift: drift, ...(delivery ? { unmatchedDelivery: delivery } : {}) }
  })
}
