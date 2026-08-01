/**
 * PC5 orchestrators — run / lock / pre-run (Postgres when flag on/shadow).
 */

import { isFinancePeriodsEnabled } from "@/lib/finance/periods/flag"
import {
  buildMediaCandidates,
  buildRetainerCandidates,
  buildSowCandidates,
} from "@/lib/finance/periods/buildCandidates"
import {
  collectMediaMonthAggs,
  collectRetainerClients,
  collectSowMonthAggs,
} from "@/lib/finance/periods/collectFromPostgres"
import {
  ensurePeriodPg,
  insertNotificationPg,
  listRunItemsPg,
  updatePeriodStatusPg,
  updateRunItemPg,
  upsertRunItemsPg,
} from "@/lib/finance/periods/postgresStore"
import { freezeItemsForLock, buildHeldRollCandidates } from "@/lib/finance/periods/lockPeriod"
import { archiveFinanceSheet } from "@/lib/finance/periods/archiveSheet"
import { addPeriodMonths, toPeriodMonthKey } from "@/lib/finance/periods/monthKey"
import { getSydneyWallClock } from "@/lib/finance/periods/sydneyClock"
import type { ClientSnapshot, RunCandidate } from "@/lib/finance/periods/types"
import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import {
  buildPreRunSweepCard,
  clientMissingBlockers,
  type PreRunBlocker,
} from "@/lib/finance/periods/preRunSweep"

export async function executeFinanceRun(args: {
  periodMonth?: string
  now?: Date
  force?: boolean
}): Promise<{
  ok: boolean
  skipped?: string
  periodMonth: string
  inserted: number
  updated: number
  itemCount: number
}> {
  if (!isFinancePeriodsEnabled() && !args.force) {
    return {
      ok: false,
      skipped: "FINANCE_PERIODS off",
      periodMonth: args.periodMonth ?? "",
      inserted: 0,
      updated: 0,
      itemCount: 0,
    }
  }

  const sydney = getSydneyWallClock(args.now ?? new Date())
  const periodMonth = toPeriodMonthKey(args.periodMonth ?? sydney.periodMonth)

  const [media, retainers, sows] = await Promise.all([
    collectMediaMonthAggs(periodMonth),
    collectRetainerClients(),
    collectSowMonthAggs(periodMonth),
  ])

  // Hard blockers → held (ABN / legal name)
  const blockerByClient = new Map<number, string>()
  const db = getDb()
  const clientRows = await db.execute(sql`
    SELECT id, mp_client_name, abn, legalbusinessname FROM clients
  `)
  const list = (clientRows as { rows?: Record<string, unknown>[] }).rows ?? (clientRows as unknown as Record<string, unknown>[])
  for (const r of Array.isArray(list) ? list : []) {
    const blockers = clientMissingBlockers({
      id: Number(r.id),
      name: String(r.mp_client_name ?? ""),
      abn: r.abn == null ? null : String(r.abn),
      legalBusinessName: r.legalbusinessname == null ? null : String(r.legalbusinessname),
    })
    if (blockers.length) {
      blockerByClient.set(Number(r.id), blockers.map((b) => b.detail).join("; "))
    }
  }

  const mediaCand = buildMediaCandidates(
    periodMonth,
    media.map((m) => ({
      ...m,
      heldReason:
        m.clientId != null && blockerByClient.has(m.clientId)
          ? blockerByClient.get(m.clientId)
          : null,
    }))
  )
  const retCand = buildRetainerCandidates(
    periodMonth,
    retainers.map((c) => ({
      ...c,
      heldReason: blockerByClient.get(c.id) ?? null,
    }))
  )
  const sowCand = buildSowCandidates(
    periodMonth,
    sows.map((s) => ({
      ...s,
      heldReason:
        s.clientId != null && blockerByClient.has(s.clientId)
          ? blockerByClient.get(s.clientId)
          : null,
    }))
  )

  const candidates: RunCandidate[] = [...mediaCand, ...retCand, ...sowCand]
  const period = await ensurePeriodPg(periodMonth)
  const result = await upsertRunItemsPg(period.id, candidates)
  await updatePeriodStatusPg(period.id, {
    status: "review",
    ranAt: (args.now ?? new Date()).toISOString(),
  })

  await insertNotificationPg({
    audience: "finance",
    kind: "finance_period_run",
    payload: {
      periodMonth,
      inserted: result.inserted,
      updated: result.updated,
      itemCount: result.items.length,
    },
  })

  return {
    ok: true,
    periodMonth,
    inserted: result.inserted,
    updated: result.updated,
    itemCount: result.items.length,
  }
}

export async function executeFinanceLock(args: {
  periodMonth?: string
  lockedBy: string
  now?: Date
  force?: boolean
}): Promise<{
  ok: boolean
  skipped?: string
  periodMonth: string
  rolled: number
  sheetPathname: string | null
}> {
  if (!isFinancePeriodsEnabled() && !args.force) {
    return {
      ok: false,
      skipped: "FINANCE_PERIODS off",
      periodMonth: args.periodMonth ?? "",
      rolled: 0,
      sheetPathname: null,
    }
  }

  const sydney = getSydneyWallClock(args.now ?? new Date())
  const periodMonth = toPeriodMonthKey(args.periodMonth ?? sydney.periodMonth)
  const period = await ensurePeriodPg(periodMonth)
  const items = await listRunItemsPg(period.id)

  const db = getDb()
  const clientRows = await db.execute(sql`
    SELECT id, mp_client_name, abn, legalbusinessname, payment_terms, payment_days,
           streetaddress, suburb, state_dropdown, postcode
    FROM clients
  `)
  const list = (clientRows as { rows?: Record<string, unknown>[] }).rows ?? (clientRows as unknown as Record<string, unknown>[])
  const snaps = new Map<number, ClientSnapshot>()
  for (const r of Array.isArray(list) ? list : []) {
    snaps.set(Number(r.id), {
      clientId: Number(r.id),
      clientName: String(r.mp_client_name ?? ""),
      legalBusinessName: String(r.legalbusinessname ?? ""),
      abn: String(r.abn ?? ""),
      paymentTerms: String(r.payment_terms ?? "Net 30"),
      paymentDays: Number(r.payment_days) || 30,
      streetAddress: String(r.streetaddress ?? ""),
      suburb: String(r.suburb ?? ""),
      state: String(r.state_dropdown ?? ""),
      postcode: String(r.postcode ?? ""),
    })
  }

  const { frozen, heldToRoll } = freezeItemsForLock({
    items,
    clientSnapshotsByClientId: snaps,
  })
  for (const item of frozen) {
    await updateRunItemPg(item)
  }

  const archived = await archiveFinanceSheet({
    items: frozen,
    periodMonth,
    sheetVersion: period.sheetVersion || 1,
  })

  await updatePeriodStatusPg(period.id, {
    status: "locked",
    lockedAt: (args.now ?? new Date()).toISOString(),
    lockedBy: args.lockedBy,
    sheetBlobPathname: archived.pathname,
  })

  const nextMonth = addPeriodMonths(periodMonth, 1)
  const nextPeriod = await ensurePeriodPg(nextMonth)
  const roll = buildHeldRollCandidates(heldToRoll)
  if (roll.length) {
    await upsertRunItemsPg(
      nextPeriod.id,
      roll.map((r) => ({
        source: r.source,
        naturalKey: r.naturalKey,
        mbaNumber: r.mbaNumber,
        clientId: r.clientId,
        versionId: r.versionId,
        sowId: r.sowId,
        lineItemsJson: r.lineItemsJson,
        amountCents: r.amountCents,
        invoiceReference: r.invoiceReference,
        heldReason: r.heldReason,
      }))
    )
  }

  await insertNotificationPg({
    audience: "finance",
    kind: "finance_period_locked",
    payload: { periodMonth, rolled: roll.length, sheet: archived.pathname },
  })

  return {
    ok: true,
    periodMonth,
    rolled: roll.length,
    sheetPathname: archived.pathname,
  }
}

export async function executePreRunSweep(args: {
  periodMonth?: string
  now?: Date
  force?: boolean
}): Promise<{ ok: boolean; skipped?: string; card: ReturnType<typeof buildPreRunSweepCard> | null }> {
  if (!isFinancePeriodsEnabled() && !args.force) {
    return { ok: false, skipped: "FINANCE_PERIODS off", card: null }
  }
  const sydney = getSydneyWallClock(args.now ?? new Date())
  const periodMonth = toPeriodMonthKey(args.periodMonth ?? sydney.periodMonth)
  await ensurePeriodPg(periodMonth)
  await updatePeriodStatusPg((await ensurePeriodPg(periodMonth)).id, {
    status: "pre_run_review",
  })

  const db = getDb()
  const clientRows = await db.execute(sql`
    SELECT id, mp_client_name, abn, legalbusinessname FROM clients
    WHERE COALESCE(monthlyretainer, 0) > 0
       OR id IN (SELECT DISTINCT client_id FROM media_plan_masters WHERE client_id IS NOT NULL)
  `)
  const list = (clientRows as { rows?: Record<string, unknown>[] }).rows ?? (clientRows as unknown as Record<string, unknown>[])
  const blockers: PreRunBlocker[] = []
  for (const r of Array.isArray(list) ? list : []) {
    blockers.push(
      ...clientMissingBlockers({
        id: Number(r.id),
        name: String(r.mp_client_name ?? ""),
        abn: r.abn == null ? null : String(r.abn),
        legalBusinessName: r.legalbusinessname == null ? null : String(r.legalbusinessname),
      })
    )
  }
  const card = buildPreRunSweepCard({
    periodMonth,
    blockers,
    referenceHitRate: await loadLastMonthReferenceHitRate(periodMonth),
  })
  await insertNotificationPg({
    audience: "finance",
    kind: "finance_pre_run_sweep",
    payload: card as unknown as Record<string, unknown>,
  })
  return { ok: true, card }
}

async function loadLastMonthReferenceHitRate(
  periodMonth: string
): Promise<number | null> {
  try {
    const { addPeriodMonths, toPeriodMonthDate } = await import(
      "@/lib/finance/periods/monthKey"
    )
    const prev = addPeriodMonths(periodMonth, -1)
    const db = getDb()
    const res = await db.execute(sql`
      SELECT reference_hit_rate
      FROM xero_match_month_metrics
      WHERE period_month = ${toPeriodMonthDate(prev)}::date
      LIMIT 1
    `)
    const rows = (res as { rows?: { reference_hit_rate: number }[] }).rows ?? []
    if (!rows[0]) return null
    return Number(rows[0].reference_hit_rate)
  } catch {
    return null
  }
}
