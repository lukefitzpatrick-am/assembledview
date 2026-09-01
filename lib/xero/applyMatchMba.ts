/**
 * Apply finance/match_mba result to xero_ar_invoices + xero_sync_exceptions.
 * Exception upsert: one open row per xero_invoice_id (no dupes).
 */

import { and, eq, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  xeroArInvoices,
  xeroSyncExceptions,
} from "@/db/schema/ported"

import { rowsOf } from "./dbRows"
import {
  exceptionReasonForMatch,
  matchMbaAgainstMasters,
  type MatchMbaResult,
  type MbaMaster,
  type ScopeOfWorkRef,
} from "./matchMba"

export type MatchMbaInput = {
  arInvoiceId: number
  referenceRaw: string
  xeroInvoiceId: string
  invoiceNumber: string | null
  issueDate: string | null
}

export async function loadMbaMasters(): Promise<MbaMaster[]> {
  const rows = rowsOf<{ id: number; mba_number: string }>(
    await db.execute(sql`
      SELECT id, mba_number FROM media_plan_masters
      WHERE mba_number IS NOT NULL AND btrim(mba_number) <> ''
    `),
  )
  return rows.map((r) => ({
    id: Number(r.id),
    mba_number: String(r.mba_number),
  }))
}

export async function loadScopeOfWorkRefs(): Promise<ScopeOfWorkRef[]> {
  const rows = rowsOf<{ id: number; scope_id: string }>(
    await db.execute(sql`
      SELECT id, scope_id FROM scope_of_work
      WHERE scope_id IS NOT NULL AND btrim(scope_id) <> ''
    `),
  )
  return rows.map((r) => ({
    id: Number(r.id),
    scope_id: String(r.scope_id),
  }))
}

async function upsertOpenException(args: {
  xeroInvoiceId: string
  invoiceNumber: string | null
  reference: string
  reason: string
  issueDate: string | null
  rawJson: unknown
}): Promise<void> {
  const existing = await db
    .select({ id: xeroSyncExceptions.id })
    .from(xeroSyncExceptions)
    .where(
      and(
        eq(xeroSyncExceptions.xeroInvoiceId, args.xeroInvoiceId),
        eq(xeroSyncExceptions.resolved, false),
      ),
    )
    .limit(1)

  const row = {
    xeroInvoiceId: args.xeroInvoiceId,
    invoiceNumber: args.invoiceNumber,
    reference: args.reference,
    reason: args.reason,
    resolved: false as const,
    issueDate: args.issueDate,
    rawJson: args.rawJson,
  }

  if (existing[0]) {
    await db
      .update(xeroSyncExceptions)
      .set(row)
      .where(eq(xeroSyncExceptions.id, existing[0].id))
  } else {
    await db.insert(xeroSyncExceptions).values(row)
  }
}

async function resolveOpenExceptions(
  xeroInvoiceId: string,
  referenceRaw: string,
): Promise<void> {
  await db
    .update(xeroSyncExceptions)
    .set({
      resolved: true,
      reason: `auto-matched (ref: ${referenceRaw})`,
    })
    .where(
      and(
        eq(xeroSyncExceptions.xeroInvoiceId, xeroInvoiceId),
        eq(xeroSyncExceptions.resolved, false),
      ),
    )
}

export async function applyMatchMba(
  input: MatchMbaInput,
  masters: MbaMaster[],
  scopes: ScopeOfWorkRef[] = [],
): Promise<MatchMbaResult> {
  const result = matchMbaAgainstMasters(input.referenceRaw, masters, scopes)

  if (result.matched && result.kind === "mba") {
    await db
      .update(xeroArInvoices)
      .set({
        mbaMatchId: result.id,
        mbaNumber: result.mba_number,
      })
      .where(eq(xeroArInvoices.id, input.arInvoiceId))
    await resolveOpenExceptions(input.xeroInvoiceId, input.referenceRaw)
    return result
  }

  if (result.matched && result.kind === "sow") {
    // Scope invoices are resolved, not unmatched. Do not write mba_number
    // (SOW is not an MBA). Do not touch existing xero_sync_exceptions rows.
    return result
  }

  const reason = exceptionReasonForMatch(input.referenceRaw, result)!
  await upsertOpenException({
    xeroInvoiceId: input.xeroInvoiceId,
    invoiceNumber: input.invoiceNumber,
    reference: input.referenceRaw,
    reason,
    issueDate: input.issueDate,
    rawJson:
      result.reason === "blank"
        ? { reference_raw: input.referenceRaw }
        : result.reason === "ambiguous"
          ? {
              reference_raw: input.referenceRaw,
              matches: result.matches,
              matchKind: result.matchKind,
            }
          : {
              reference_raw: input.referenceRaw,
              tokens: result.tokens,
            },
  })
  return result
}

/** Shared helper for PDF / other exception upserts by xero_invoice_id (no dupes). */
export async function upsertExceptionByInvoiceId(args: {
  xeroInvoiceId: string
  invoiceNumber: string | null
  reference: string | null
  reason: string
  issueDate: string | null
  rawJson: unknown
}): Promise<void> {
  const existing = await db
    .select({ id: xeroSyncExceptions.id })
    .from(xeroSyncExceptions)
    .where(eq(xeroSyncExceptions.xeroInvoiceId, args.xeroInvoiceId))
    .limit(1)

  const row = {
    xeroInvoiceId: args.xeroInvoiceId,
    invoiceNumber: args.invoiceNumber,
    reference: args.reference,
    reason: args.reason,
    resolved: false as const,
    issueDate: args.issueDate,
    rawJson: args.rawJson,
  }

  if (existing[0]) {
    await db
      .update(xeroSyncExceptions)
      .set(row)
      .where(eq(xeroSyncExceptions.id, existing[0].id))
  } else {
    await db.insert(xeroSyncExceptions).values(row)
  }
}
