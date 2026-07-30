import { and, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"
import { getAvaDb, withRowCap, AVA_ROW_CAP, schema } from "@/db/avaClient"
import { fyMonthRange } from "@/lib/finance/months"
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
  financeBillingRecords,
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
      "Postgres: billed (finance_billing_records) vs planned (schedule_months billing basis) rollup per month in AUD. Pass mba and/or client; optional fy (AU FY start year). Prefer for finance \"billed vs planned\" questions. Full allowlist is Luke's call — note jayco016 + ~47 accepted divergence versions have no schedule rows. Compact monthly rows; capped.",
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
          description: "Australian FY start year (Jul–Jun).",
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
      const fyRange = fy != null ? fyMonthRange(fy) : null

      // --- billed from finance_billing_records ---
      const billConds: SQL[] = []
      if (mba) billConds.push(eq(financeBillingRecords.mbaNumber, mba))
      if (client) {
        billConds.push(ilike(financeBillingRecords.clientName, `%${client.trim()}%`))
      }
      if (fyRange) {
        billConds.push(gte(financeBillingRecords.billingMonth, fyRange.from))
        billConds.push(lte(financeBillingRecords.billingMonth, fyRange.to))
      }

      const billRows = await db
        .select({
          billingMonth: financeBillingRecords.billingMonth,
          total: financeBillingRecords.total,
          billedAmountCents: financeBillingRecords.billedAmountCents,
          status: financeBillingRecords.status,
          mbaNumber: financeBillingRecords.mbaNumber,
          billed: financeBillingRecords.billed,
        })
        .from(financeBillingRecords)
        .where(billConds.length ? and(...billConds) : undefined)
        .limit(AVA_ROW_CAP)

      const billedByMonth = new Map<string, number>()
      for (const r of billRows) {
        const month = (r.billingMonth ?? "").trim()
        if (!month) continue
        let aud = 0
        if (r.billedAmountCents != null) {
          aud = centsToDollars(r.billedAmountCents)
        } else if (r.total != null) {
          const n = Number(r.total)
          if (Number.isFinite(n)) aud = Math.round(n * 100) / 100
        }
        billedByMonth.set(month, roundAdd(billedByMonth.get(month) ?? 0, aud))
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
        planConds.push(gte(scheduleMonths.month, `${fyRange.from}-01`))
        planConds.push(lte(scheduleMonths.month, `${fyRange.to}-01`))
      }

      const planRaw = await db
        .select({
          month: scheduleMonths.month,
          amountCents: scheduleMonths.amountCents,
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
        .limit(AVA_ROW_CAP + 1)

      const plannedByMonth = new Map<string, number>()
      for (const r of planRaw) {
        const month = monthKeyFromDate(r.month)
        if (!month) continue
        plannedByMonth.set(
          month,
          roundAdd(plannedByMonth.get(month) ?? 0, centsToDollars(r.amountCents)),
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
          currency: "AUD",
          billed_total_aud: billedTotalAll,
          planned_total_aud: plannedTotal,
          billing_record_count: billRows.length,
          schedule_row_count: planRaw.length,
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
