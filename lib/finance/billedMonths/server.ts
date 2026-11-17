/**
 * Billed months at publish (S2 A): the reads, and the gate each publish path
 * calls. Off (`billed_months_choice`): nothing is read and every publish goes
 * on as before.
 */
import "server-only"

import { sql } from "drizzle-orm"

import { rowsOf } from "@/lib/xero/dbRows"

import { billingCellsOf, checkBilledMonths, type BillingCell } from "./billedMonths"
import { decideBilledMonths, type BilledMonthsChoice, type BilledMonthsDecision } from "./choice"
import { loadBilledMonthsBase, type BilledMonthsBase, type BilledMonthsExec } from "./load"

/** What the tip bills: its blob read back, else (no readable blob rows) its stored rows. */
function baseCells(base: BilledMonthsBase): BillingCell[] {
  const fromBlob = billingCellsOf(base.schedule)
  return fromBlob && fromBlob.length > 0 ? fromBlob : base.rows
}

/**
 * The S2 gate for a publish that builds its billing (the plan save). Reads
 * only when `on`. `base` comes back so `keep` can copy the tip's months.
 */
export async function billedMonthsGate(
  exec: BilledMonthsExec,
  args: {
    on: boolean
    mbaNumber: string
    candidateSchedule: unknown
    choice: BilledMonthsChoice | null | undefined
    choiceAllowed: boolean
  },
): Promise<{ decision: BilledMonthsDecision; base: BilledMonthsBase | null }> {
  if (!args.on) return { decision: { kind: "go" }, base: null }
  const { base, invoiced } = await loadBilledMonthsBase(exec, { mbaNumber: args.mbaNumber })
  if (!base) return { decision: { kind: "go" }, base: null }
  const check = checkBilledMonths({
    invoiced,
    base: baseCells(base),
    candidate: billingCellsOf(args.candidateSchedule) ?? [],
  })
  return {
    decision: decideBilledMonths({ on: true, check, choice: args.choice, choiceAllowed: args.choiceAllowed }),
    base,
  }
}

/**
 * The S2 gate for the PATCH publish stamp: the stored version becomes the tip
 * as it is, so it cannot keep. A change to an invoiced month is refused.
 */
export async function billedMonthsGateForStoredVersion(
  exec: BilledMonthsExec,
  args: { on: boolean; mbaNumber: string; versionNumber: number },
): Promise<BilledMonthsDecision> {
  if (!args.on) return { kind: "go" }
  const target = rowsOf<{ schedule?: unknown }>(
    await exec.execute(sql`
      SELECT legacy_schedules -> 'billingSchedule' AS schedule
      FROM media_plan_versions
      WHERE lower(mba_number) = lower(${args.mbaNumber}) AND version_number = ${args.versionNumber}
      LIMIT 1
    `),
  )[0]
  if (!target) return { kind: "go" }
  const { decision } = await billedMonthsGate(exec, {
    on: true,
    mbaNumber: args.mbaNumber,
    candidateSchedule: target.schedule ?? null,
    choice: null,
    choiceAllowed: false,
  })
  return decision
}
