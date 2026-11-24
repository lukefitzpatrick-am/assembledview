import { and, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"
import { getAvaDb, withRowCap, schema } from "@/db/avaClient"
import { billedSentSql } from "@/lib/finance/billedSent"
import { rowsOf } from "@/lib/xero/dbRows"
import { fyToRange } from "./fyToRange"
import { slugifyClientNameForUrl } from "@/lib/clients/slug"
import type AvaTool from "./types"
import {
  asRecord,
  asString,
  asNumber,
  resolveScopedClientSlug,
  resolveScopedMba,
} from "./helpers"
import {
  centsToDollars,
  jsonContent,
  monthKeyFromDate,
  parseZodOrError,
  requireAvaDbOrSoftFail,
} from "./postgresShared"

const {
  mediaPlanMasters,
  mediaPlanVersions,
  scheduleMonths,
  clients,
} = schema

export const queryFinanceSummaryInput = z
  .object({
    mba: z.string().min(1).optional(),
    mbaNumber: z.string().min(1).optional(),
    client: z.string().min(1).optional(),
    fy: z.number().int().min(2000).max(2100).optional(),
  })
  .strict()
  .refine((d) => Boolean(d.mba || d.mbaNumber || d.client), {
    message: "Provide mba or client",
  })

function roundAdd(a: number, b: number): number {
  return Math.round((a + b) * 100) / 100
}

export const queryFinanceSummaryTool: AvaTool = {
  definition: {
    name: "query_finance_summary",
    description:
      "Postgres: billed (sent invoices in finance_billing_records, each Xero invoice once, voided and deleted left out) vs planned (schedule_months billing basis) rollup per month in AUD. Pass mba and/or client; optional fy = Australian FY ENDING year (fy=2026 means Jul 2025 – Jun 2026). Prefer for finance \"billed vs planned\" questions. Full allowlist is Luke's call — note jayco016 + ~47 accepted divergence versions have no schedule rows. Compact monthly rows; capped.",
    input_schema: {
      type: "object",
      properties: {
        mba: { type: "string", description: "MBA number filter." },
        client: {
          type: "string",
          description: "Client name/slug filter (billing records + plan masters).",
        },
        fy: {
          type: "number",
          description:
            "Australian FY ending year. fy=2026 means Jul 2025 – Jun 2026 (use for \"this FY\" / FY26).",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const gate = requireAvaDbOrSoftFail()
    if (!gate.ok) return gate.result

    const args = asRecord(input)
    // Allow page-context defaults before zod refine
    const mbaRaw =
      asString(args.mba) ?? asString(args.mbaNumber) ?? context.mbaNumber
    const clientRaw =
      asString(args.client) ?? asString(args.clientSlug) ?? context.clientSlug
    const fy = asNumber(args.fy)

    const forParse = {
      mba: mbaRaw,
      client: clientRaw,
      fy,
    }
    const parsed = parseZodOrError(queryFinanceSummaryInput, forParse)
    if (!parsed.ok) return { content: parsed.content, isError: true }

    const mba = parsed.data.mba ?? parsed.data.mbaNumber
    const client = parsed.data.client

    if (mba) {
      const scoped = resolveScopedMba(context, mba)
      if (!scoped.ok) return { content: scoped.error, isError: true }
    }
    if (client) {
      const scoped = resolveScopedClientSlug(context, client)
      if (!scoped.ok) return { content: scoped.error, isError: true }
    }

    try {
      const db = getAvaDb()
      const fyRange = fy != null ? fyToRange(fy) : null

      // --- billed: C-399 "billed means sent", summed per month in SQL (no row cap on rows) ---
      const billScope: SQL[] = []
      if (mba) billScope.push(sql`finance_billing_records.mba_number = ${mba}`)
      if (client) billScope.push(sql`finance_billing_records.client_name ILIKE ${`%${client.trim()}%`}`)
      // Months filter the output: a matched invoice counts in its record's month (R1).
      const monthWhere = fyRange
        ? sql`WHERE b.billing_month >= ${fyRange.startMonth} AND b.billing_month < ${fyRange.endMonthExclusive}`
        : sql``
      const billRows = rowsOf<{ billing_month: string; cents: string | number; invoices: string | number }>(
        await db.execute(sql`
          SELECT b.billing_month, sum(b.cents) AS cents, count(*) AS invoices
          FROM (${billedSentSql(billScope.length ? sql.join(billScope, sql` AND `) : sql`true`)}) b
          ${monthWhere}
          GROUP BY b.billing_month`),
      )
      const billedByMonth = new Map<string, number>()
      let billedInvoiceCount = 0
      for (const r of billRows) {
        billedInvoiceCount += Number(r.invoices)
        billedByMonth.set(r.billing_month, centsToDollars(Number(r.cents)))
      }

      // --- planned from schedule_months on published versions ---
      const planConds: SQL[] = [
        eq(scheduleMonths.basis, "billing"),
        eq(mediaPlanMasters.publishedVersionId, mediaPlanVersions.id),
      ]
      if (mba) planConds.push(eq(mediaPlanMasters.mbaNumber, mba))
      if (client) {
        const slug = slugifyClientNameForUrl(client)
        planConds.push(
          or(
            ilike(mediaPlanMasters.mpClientName, `%${client.trim()}%`),
            ilike(clients.mpClientName, `%${client.trim()}%`),
            slug
              ? sql`lower(regexp_replace(coalesce(${mediaPlanMasters.mpClientName}, ''), '[^a-zA-Z0-9]+', '-', 'g')) like ${`%${slug}%`}`
              : sql`false`,
          )!,
        )
      }
      if (fyRange) {
        planConds.push(gte(scheduleMonths.month, fyRange.startDate))
        planConds.push(lt(scheduleMonths.month, fyRange.endDateExclusive))
      }

      const planRaw = await db
        .select({
          month: scheduleMonths.month,
          amountCents: sql<string>`sum(${scheduleMonths.amountCents})`,
        })
        .from(scheduleMonths)
        .innerJoin(
          mediaPlanVersions,
          eq(scheduleMonths.versionId, mediaPlanVersions.id),
        )
        .innerJoin(
          mediaPlanMasters,
          eq(mediaPlanVersions.masterId, mediaPlanMasters.id),
        )
        .leftJoin(clients, eq(mediaPlanMasters.clientId, clients.id))
        .where(and(...planConds))
        .groupBy(scheduleMonths.month)

      const plannedByMonth = new Map<string, number>()
      for (const r of planRaw) {
        const month = monthKeyFromDate(r.month)
        if (!month) continue
        plannedByMonth.set(
          month,
          roundAdd(plannedByMonth.get(month) ?? 0, centsToDollars(Number(r.amountCents))),
        )
      }

      const months = new Set([...billedByMonth.keys(), ...plannedByMonth.keys()])
      const monthly = [...months]
        .sort()
        .map((month) => ({
          month,
          billed_aud: billedByMonth.get(month) ?? 0,
          planned_aud: plannedByMonth.get(month) ?? 0,
        }))

      const { rows, truncated, total } = withRowCap(monthly, 48)

      const billedTotal = rows.reduce((s, m) => roundAdd(s, m.billed_aud), 0)
      const plannedTotal = [...plannedByMonth.values()].reduce(
        (s, v) => roundAdd(s, v),
        0,
      )
      const billedTotalAll = [...billedByMonth.values()].reduce(
        (s, v) => roundAdd(s, v),
        0,
      )

      return {
        content: jsonContent({
          mba: mba ?? null,
          client: client ?? null,
          fy: fy ?? null,
          range: fyRange?.range ?? null,
          currency: "AUD",
          billed_total_aud: billedTotalAll,
          planned_total_aud: plannedTotal,
          billed_invoice_count: billedInvoiceCount,
          total_months: total,
          truncated,
          months: rows,
          months_shown_billed_aud: billedTotal,
          note:
            "jayco016 + ~47 accepted divergence versions have no schedule_months rows — planned may be 0 for those. Full finance allowlist is Luke's call.",
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `query_finance_summary failed: ${message}`, isError: true }
    }
  },
}
