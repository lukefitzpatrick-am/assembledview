/**
 * The one writer of the Data quality queue (S17, `data_quality_items`, 0123).
 * Every check writes through `recordFindings`.
 *
 * - One open item per rule, plan and line (the partial unique index): a check
 *   that finds the same problem again updates `last_seen_at`, the message,
 *   the fix and the owner.
 * - A dismissed item stays dismissed: the same problem found again writes nothing.
 * - A problem the check no longer finds is resolved by `check`.
 * - The owner is resolved when the item is written (`resolvePlanOwners`).
 *
 * Switch `data_quality_queue` (requires marker 0123): off, `recordFindings`
 * writes nothing and reads nothing. The routes check the switch themselves.
 */
import "server-only"

import { sql } from "drizzle-orm"

import { getDb, type Db } from "@/db"
import { isFeatureOn } from "@/lib/features/server"
import { rowsOf } from "@/lib/xero/dbRows"

import type { DataQualityRuleKey } from "./rules"

type Exec = Pick<Db, "execute">

/** One problem a check found. `mbaNumber` names the plan; `lineItemId` is null for a whole-plan problem. */
export type DataQualityFinding = {
  ruleKey: DataQualityRuleKey
  mbaNumber: string
  lineItemId: string | null
  message: string
  fixLabel: string
  /** In-app path, starting with one `/`. */
  fixHref: string
}

type PlanOwner = { clientId: number | null; ownerEmail: string | null }

const lineKey = (lineItemId: string | null) => lineItemId ?? ""

/**
 * The plan owner (B60 Q1 option A): the client's finance owner, else the
 * published version's last publisher, else unassigned (null). Only active
 * team members count. Keyed by the MBA as given; a plan not found is unassigned.
 */
async function resolvePlanOwners(db: Exec, mbaNumbers: readonly string[]): Promise<Map<string, PlanOwner>> {
  const wanted = [...new Set(mbaNumbers)]
  const out = new Map<string, PlanOwner>(wanted.map((m) => [m, { clientId: null, ownerEmail: null }]))
  if (wanted.length === 0) return out
  const rows = rowsOf<{ mba: string; client_id: number | string | null; finance_owner: string | null; publisher: string | null }>(
    await db.execute(sql`
      SELECT w.mba, m.client_id,
        (SELECT lower(t.email) FROM client_finance_owners f
           JOIN team_members t ON t.id = f.team_member_id AND t.active
          WHERE f.client_id = m.client_id) AS finance_owner,
        (SELECT lower(t.email) FROM media_plan_versions v
           JOIN team_members t ON lower(t.email) = lower(v.published_by) AND t.active
          WHERE v.id = m.published_version_id) AS publisher
      FROM jsonb_array_elements_text(${JSON.stringify(wanted)}::jsonb) AS w(mba)
      JOIN media_plan_masters m ON lower(m.mba_number) = lower(w.mba)
    `),
  )
  for (const r of rows) {
    out.set(r.mba, {
      clientId: r.client_id == null ? null : Number(r.client_id),
      ownerEmail: r.finance_owner ?? r.publisher ?? null,
    })
  }
  return out
}

/**
 * Opens the item, or updates the open one for the same rule, plan and line.
 * Returns false when a dismissed item holds that key (nothing written).
 */
async function upsertDataQualityItem(db: Exec, finding: DataQualityFinding, owner: PlanOwner): Promise<boolean> {
  const rows = rowsOf<{ id: number }>(
    await db.execute(sql`
      INSERT INTO data_quality_items (rule_key, mba_number, line_item_id, client_id, message, fix_label, fix_href, owner_email)
      SELECT ${finding.ruleKey}, ${finding.mbaNumber}, ${finding.lineItemId}::text, ${owner.clientId}::bigint,
        ${finding.message}, ${finding.fixLabel}, ${finding.fixHref}, ${owner.ownerEmail}::text
      WHERE NOT EXISTS (
        SELECT 1 FROM data_quality_items d
        WHERE d.status = 'dismissed' AND d.rule_key = ${finding.ruleKey} AND d.mba_number = ${finding.mbaNumber}
          AND coalesce(d.line_item_id, '') = ${lineKey(finding.lineItemId)}
      )
      ON CONFLICT (rule_key, mba_number, (coalesce(line_item_id, ''))) WHERE status = 'open'
      DO UPDATE SET last_seen_at = now(), message = EXCLUDED.message, fix_label = EXCLUDED.fix_label,
        fix_href = EXCLUDED.fix_href, client_id = EXCLUDED.client_id, owner_email = EXCLUDED.owner_email
      RETURNING id
    `),
  )
  return rows.length > 0
}

/** Resolves (by `check`) every open item of the rule whose plan and line are not in `seen`. Returns how many. */
async function resolveMissingItems(
  db: Exec,
  ruleKey: DataQualityRuleKey,
  seen: readonly { mbaNumber: string; lineItemId: string | null }[],
): Promise<number> {
  const keys = JSON.stringify(seen.map((s) => [s.mbaNumber, lineKey(s.lineItemId)]))
  const rows = rowsOf<{ id: number }>(
    await db.execute(sql`
      UPDATE data_quality_items i
      SET status = 'resolved', resolved_at = now(), resolved_by = 'check'
      WHERE i.status = 'open' AND i.rule_key = ${ruleKey}
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(${keys}::jsonb) AS k
          WHERE k->>0 = i.mba_number AND k->>1 = coalesce(i.line_item_id, '')
        )
      RETURNING i.id
    `),
  )
  return rows.length
}

export type RecordResult = { written: number; dismissed: number; resolved: number }

/**
 * Writes one check's full result: every finding (owner resolved now), then
 * resolves the open items of `ruleKeys` it no longer finds. `ruleKeys` names
 * every rule the check covers, so a rule with no finding resolves all its items.
 * Only call it with a complete result: a partial one would resolve live problems.
 * Null when the switch is off (nothing read or written).
 */
export async function recordFindings(
  ruleKeys: readonly DataQualityRuleKey[],
  findings: readonly DataQualityFinding[],
  db: Exec = getDb(),
): Promise<RecordResult | null> {
  if (!(await isFeatureOn("data_quality_queue"))) return null
  const owners = await resolvePlanOwners(db, findings.map((f) => f.mbaNumber))
  const result: RecordResult = { written: 0, dismissed: 0, resolved: 0 }
  for (const finding of findings) {
    const owner = owners.get(finding.mbaNumber) ?? { clientId: null, ownerEmail: null }
    if (await upsertDataQualityItem(db, finding, owner)) result.written += 1
    else result.dismissed += 1
  }
  for (const ruleKey of ruleKeys) {
    result.resolved += await resolveMissingItems(
      db,
      ruleKey,
      findings.filter((f) => f.ruleKey === ruleKey),
    )
  }
  return result
}
