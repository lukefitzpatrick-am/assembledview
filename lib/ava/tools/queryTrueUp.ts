/**
 * query_true_up: AVA reads the saved true-up (migration 0110 grants
 * ava_readonly SELECT on true_up_runs, true_up_actions, true_up_invoice_links).
 * Read only. Admin only (finance admin is the admin role), TRUE_UP on.
 *
 * Source: the newest saved run (cron or "Run now") for the month asked, and
 * the ledger of fixes and notes for the MBAs shown. It is as fresh as that
 * run; the true-up page computes live.
 */
import { desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { getAvaDb, schema } from "@/db/avaClient"
import { isTrueUpEnabled } from "@/lib/finance/trueUp/flag"

import { asRecord, asString, jsonContent } from "./helpers"
import { centsToDollars, parseZodOrError, requireAvaDbOrSoftFail } from "./postgresShared"
import type AvaTool from "./types"
import type { AvaToolContext, AvaToolResult } from "./types"

const { trueUpRuns, trueUpActions } = schema

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
  rows: unknown
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
export function trueUpToolGate(context: Pick<AvaToolContext, "roles">): AvaToolResult | null {
  if (!context.roles.includes("admin")) return { content: "query_true_up is for finance admins only.", isError: true }
  if (!isTrueUpEnabled()) return { content: "The true-up is turned off (TRUE_UP).", isError: true }
  return null
}

const key = (s: unknown) => String(s ?? "").trim().toLowerCase()

/** Model-facing shape: dollars and cents, open gaps first, ledger per MBA. Pure. */
export function shapeTrueUpForModel(
  run: TrueUpRunRecord,
  actions: readonly TrueUpActionRecord[],
  filter: { client?: string; mba?: string; openOnly?: boolean },
) {
  const all = (Array.isArray(run.rows) ? run.rows : []) as TrueUpRunRowJson[]
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
      mbasNeedingAction: run.mbasNeedingAction,
    },
    matched: picked.length,
    truncated: picked.length > MAX_ROWS,
    rows,
    signs: "Plus is a credit due to the client, minus is a charge. Ex GST. Gaps under $1 count as matching.",
    next: "Answer from these rows. For a fix, send the user to Finance > Reports > True-up; AVA does not change schedules here.",
  }
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
    const denied = trueUpToolGate(context)
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
      const preview = shapeTrueUpForModel(run, [], { client, mba, openOnly: parsed.data.openOnly })
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
      return { content: jsonContent(shapeTrueUpForModel(run, actions, { client, mba, openOnly: parsed.data.openOnly })) }
    } catch (err) {
      if (isMissingGrant(err)) {
        return { content: "AVA cannot read the true-up yet: it needs migrations 0109 and 0110 (ava_readonly SELECT).", isError: true }
      }
      console.error("[query_true_up]", err)
      return { content: "Could not read the true-up.", isError: true }
    }
  },
}
