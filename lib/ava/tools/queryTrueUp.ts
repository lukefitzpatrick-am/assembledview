/**
 * query_true_up: AVA reads the saved true-up (migration 0110 grants
 * ava_readonly SELECT on true_up_runs, true_up_actions, true_up_invoice_links).
 * Read only. Admin only (finance admin is the admin role), TRUE_UP on.
 *
 * Source: the newest saved run (cron or "Run now") for the month asked, and
 * the ledger of fixes and notes for the MBAs shown. It is as fresh as that
 * run; the true-up page computes live.
 *
 * Test and internal clients (clients.is_test_client, 0112) and plans with no
 * client are left out, as on the page. Runs saved before 0112 still hold their
 * rows (history is not rewritten), so the tool drops them by looking up each
 * MBA's client; plans with no client are listed as skipped, never hidden.
 */
import { desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { getAvaDb, schema } from "@/db/avaClient"
import { isTrueUpEnabled } from "@/lib/finance/trueUp/flag"

import { asRecord, asString, jsonContent } from "./helpers"
import { centsToDollars, parseZodOrError, requireAvaDbOrSoftFail } from "./postgresShared"
import type AvaTool from "./types"
import type { AvaToolContext, AvaToolResult } from "./types"

const { trueUpRuns, trueUpActions, mediaPlanMasters, clients } = schema

const ACTION_STATUSES = new Set(["gap", "ended", "no_invoice", "schedule_incomplete"])
const MAX_ROWS = 60
const MAX_ACTIONS = 80

export const queryTrueUpInput = z.object({
  client: z.string().trim().min(1).optional(),
  mba: z.string().trim().min(1).optional(),
  asOf: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  openOnly: z.boolean().optional(),
})

export type TrueUpRunRowJson = {
  mbaNumber?: string
  clientName?: string
  campaignName?: string
  versionNumber?: number | null
  status?: string
  components?: Record<string, { status?: string; gap?: number; uncoveredGap?: number }>
}

export type TrueUpRunRecord = {
  id: number
  createdAt: string
  asOfMonth: string
  fromMonth: string
  source: string
  xeroSyncedAt: string | null
  provisionalInvoices: number
  mbasNeedingAction: number
  /** report.totals at save time; from 0112 it carries `skipped`. */
  totals?: unknown
  rows: unknown
}

/** MBAs (lower case) whose client is a test client, or that have no client. */
export type TrueUpRunExclusions = {
  testMbas: ReadonlySet<string>
  noClientMbas: ReadonlySet<string>
}

type SkippedRef = { mbaNumber?: string }

function savedSkipped(totals: unknown): { testClients: SkippedRef[]; noClient: SkippedRef[] } {
  const skipped = (asRecord(totals).skipped ?? {}) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? (v as SkippedRef[]) : [])
  return { testClients: list(skipped.testClients), noClient: list(skipped.noClient) }
}

export type TrueUpActionRecord = {
  id: number
  createdAt: string
  mbaNumber: string
  component: string
  action: string
  strategy: string | null
  months: string[]
  asOfMonth: string
  gapCents: number
  amountCents: number
  billingRevisionId: number | null
  reasonCode: string | null
  note: string | null
  status: string
  createdByName: string | null
  undoneAt: string | null
}

/** Defence in depth: the chat route is admin only already. */
export async function trueUpToolGate(context: Pick<AvaToolContext, "roles">): Promise<AvaToolResult | null> {
  if (!context.roles.includes("admin")) return { content: "query_true_up is for finance admins only.", isError: true }
  if (!(await isTrueUpEnabled())) return { content: "The true-up is turned off (Admin > Features, True-up report).", isError: true }
  return null
}

const key = (s: unknown) => String(s ?? "").trim().toLowerCase()

/** Model-facing shape: dollars and cents, open gaps first, ledger per MBA. Pure. */
export function shapeTrueUpForModel(
  run: TrueUpRunRecord,
  actions: readonly TrueUpActionRecord[],
  filter: { client?: string; mba?: string; openOnly?: boolean },
  exclude: TrueUpRunExclusions = { testMbas: new Set(), noClientMbas: new Set() },
) {
  const saved = (Array.isArray(run.rows) ? run.rows : []) as TrueUpRunRowJson[]
  // Older runs still hold test-client and no-client rows: drop them here.
  const skippedTest = new Set(savedSkipped(run.totals).testClients.map((s) => key(s.mbaNumber)).filter(Boolean))
  const skippedNone = new Set(savedSkipped(run.totals).noClient.map((s) => key(s.mbaNumber)).filter(Boolean))
  const all = saved.filter((r) => {
    const k = key(r.mbaNumber)
    if (exclude.noClientMbas.has(k)) {
      skippedNone.add(k)
      return false
    }
    if (exclude.testMbas.has(k)) {
      skippedTest.add(k)
      return false
    }
    return true
  })
  const client = key(filter.client)
  const mba = key(filter.mba)
  const picked = all.filter((r) => {
    if (mba && key(r.mbaNumber) !== mba) return false
    if (client && !key(r.clientName).includes(client)) return false
    if (filter.openOnly !== false && !mba && !ACTION_STATUSES.has(String(r.status ?? ""))) return false
    return true
  })
  const byMba = new Map<string, TrueUpActionRecord[]>()
  for (const a of actions) {
    const list = byMba.get(key(a.mbaNumber)) ?? []
    list.push(a)
    byMba.set(key(a.mbaNumber), list)
  }
  const rows = picked.slice(0, MAX_ROWS).map((r) => ({
    mba: r.mbaNumber ?? null,
    client: r.clientName ?? null,
    campaign: r.campaignName ?? null,
    version: r.versionNumber ?? null,
    status: r.status ?? null,
    needsAction: ACTION_STATUSES.has(String(r.status ?? "")),
    gaps: Object.entries(r.components ?? {})
      .filter(([, c]) => (c.status ?? "matches") !== "matches")
      .map(([component, c]) => ({
        component,
        status: c.status ?? null,
        gapCents: Number(c.gap ?? 0),
        gap: centsToDollars(Number(c.gap ?? 0)),
        uncoveredGapCents: Number(c.uncoveredGap ?? 0),
        uncoveredGap: centsToDollars(Number(c.uncoveredGap ?? 0)),
      })),
    actions: (byMba.get(key(r.mbaNumber)) ?? []).slice(0, 20).map((a) => ({
      id: a.id,
      at: a.createdAt,
      component: a.component,
      action: a.action,
      strategy: a.strategy,
      months: a.months,
      gapCents: a.gapCents,
      amountCents: a.amountCents,
      amount: centsToDollars(a.amountCents),
      billingRevisionId: a.billingRevisionId,
      reason: a.reasonCode,
      note: a.note,
      status: a.status,
      by: a.createdByName,
      undoneAt: a.undoneAt,
    })),
  }))
  return {
    ok: true,
    source: "saved true-up run (not live)",
    run: {
      id: run.id,
      savedAt: run.createdAt,
      asOf: run.asOfMonth.slice(0, 7),
      from: run.fromMonth.slice(0, 7),
      source: run.source,
      xeroSyncedAt: run.xeroSyncedAt,
      provisionalInvoices: run.provisionalInvoices,
      // Counted again without the skipped plans (older runs counted them).
      mbasNeedingAction: all.filter((r) => ACTION_STATUSES.has(String(r.status ?? ""))).length,
    },
    skipped: {
      testOrInternalClients: skippedTest.size,
      noClient: { count: skippedNone.size, mbas: [...skippedNone].sort() },
    },
    matched: picked.length,
    truncated: picked.length > MAX_ROWS,
    rows,
    signs: "Plus is a credit due to the client, minus is a charge. Ex GST. Gaps under $1 count as matching.",
    next: "Answer from these rows. For a fix, send the user to Finance > Reports > True-up; AVA does not change schedules here.",
  }
}

/** Which run MBAs to leave out. An MBA with no master row is kept (nothing to go on). Pure. */
export function trueUpExclusionsFromOwners(
  owners: ReadonlyArray<{ mbaNumber: string | null; clientId: number | null; isTestClient: boolean | null }>,
): TrueUpRunExclusions {
  const testMbas = new Set<string>()
  const noClientMbas = new Set<string>()
  for (const o of owners) {
    const k = key(o.mbaNumber)
    if (!k) continue
    if (o.clientId == null) noClientMbas.add(k)
    else if (o.isTestClient === true) testMbas.add(k)
  }
  return { testMbas, noClientMbas }
}

function isMissingGrant(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code
  const msg = err instanceof Error ? err.message : String(err)
  return code === "42501" || code === "42P01" || /permission denied|does not exist/i.test(msg)
}

export const queryTrueUpTool: AvaTool = {
  definition: {
    name: "query_true_up",
    description:
      "Finance admins only. Read the saved monthly true-up (Xero invoiced vs each plan's billing schedule): open gaps by client or MBA, per component (fee, ad serving, production, media), and the actions finance took (schedule fixes, explained, one-offs, credit notes, undos). Read only. From the newest saved run for the month (default the newest run). Never changes anything.",
    input_schema: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client name or part of it." },
        mba: { type: "string", description: "MBA number. Defaults to the page MBA when no client is given." },
        asOf: { type: "string", description: "YYYY-MM, the month the run was to the end of. Default: the newest run." },
        openOnly: { type: "boolean", description: "Default true: only plans that need action (ignored when an MBA is given)." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const denied = await trueUpToolGate(context)
    if (denied) return denied
    const gate = requireAvaDbOrSoftFail()
    if (!gate.ok) return gate.result
    const parsed = parseZodOrError(queryTrueUpInput, input)
    if (!parsed.ok) return { content: parsed.content, isError: true }
    const args = asRecord(input)
    const client = parsed.data.client ?? asString(args.client)
    const mba = parsed.data.mba ?? (client ? undefined : context.mbaNumber)

    try {
      const db = getAvaDb()
      const runRows = await db
        .select({
          id: trueUpRuns.id,
          createdAt: trueUpRuns.createdAt,
          asOfMonth: trueUpRuns.asOfMonth,
          fromMonth: trueUpRuns.fromMonth,
          source: trueUpRuns.source,
          xeroSyncedAt: trueUpRuns.xeroSyncedAt,
          provisionalInvoices: trueUpRuns.provisionalInvoices,
          mbasNeedingAction: trueUpRuns.mbasNeedingAction,
          totals: trueUpRuns.totals,
          rows: trueUpRuns.rows,
        })
        .from(trueUpRuns)
        .where(parsed.data.asOf ? eq(trueUpRuns.asOfMonth, `${parsed.data.asOf}-01`) : sql`true`)
        .orderBy(desc(trueUpRuns.createdAt))
        .limit(1)
      const run = runRows[0] as TrueUpRunRecord | undefined
      if (!run) {
        return {
          content: jsonContent({
            ok: true,
            rows: [],
            message: parsed.data.asOf
              ? `No saved true-up run to the end of ${parsed.data.asOf}. Run it from Finance > Reports > True-up.`
              : "No saved true-up run yet. Run it from Finance > Reports > True-up.",
          }),
        }
      }
      const runMbas = [
        ...new Set(
          ((Array.isArray(run.rows) ? run.rows : []) as TrueUpRunRowJson[])
            .map((r) => key(r.mbaNumber))
            .filter(Boolean),
        ),
      ]
      const owners = runMbas.length
        ? await db
            .select({
              mbaNumber: mediaPlanMasters.mbaNumber,
              clientId: mediaPlanMasters.clientId,
              isTestClient: clients.isTestClient,
            })
            .from(mediaPlanMasters)
            .leftJoin(clients, eq(clients.id, mediaPlanMasters.clientId))
            .where(inArray(sql`lower(${mediaPlanMasters.mbaNumber})`, runMbas))
        : []
      const exclude = trueUpExclusionsFromOwners(owners)
      const preview = shapeTrueUpForModel(run, [], { client, mba, openOnly: parsed.data.openOnly }, exclude)
      const mbas = preview.rows.map((r) => r.mba).filter((m): m is string => Boolean(m))
      const actions = mbas.length
        ? ((await db
            .select({
              id: trueUpActions.id,
              createdAt: trueUpActions.createdAt,
              mbaNumber: trueUpActions.mbaNumber,
              component: trueUpActions.component,
              action: trueUpActions.action,
              strategy: trueUpActions.strategy,
              months: trueUpActions.months,
              asOfMonth: trueUpActions.asOfMonth,
              gapCents: trueUpActions.gapCents,
              amountCents: trueUpActions.amountCents,
              billingRevisionId: trueUpActions.billingRevisionId,
              reasonCode: trueUpActions.reasonCode,
              note: trueUpActions.note,
              status: trueUpActions.status,
              createdByName: trueUpActions.createdByName,
              undoneAt: trueUpActions.undoneAt,
            })
            .from(trueUpActions)
            .where(inArray(sql`lower(${trueUpActions.mbaNumber})`, mbas.map((m) => m.toLowerCase())))
            .orderBy(desc(trueUpActions.createdAt))
            .limit(MAX_ACTIONS)) as TrueUpActionRecord[])
        : []
      return {
        content: jsonContent(
          shapeTrueUpForModel(run, actions, { client, mba, openOnly: parsed.data.openOnly }, exclude),
        ),
      }
    } catch (err) {
      if (isMissingGrant(err)) {
        return { content: "AVA cannot read the true-up yet: it needs migrations 0109, 0110 (ava_readonly SELECT) and 0112 (clients.is_test_client).", isError: true }
      }
      console.error("[query_true_up]", err)
      return { content: "Could not read the true-up.", isError: true }
    }
  },
}
