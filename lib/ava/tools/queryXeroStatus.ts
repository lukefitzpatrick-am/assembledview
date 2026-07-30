import { and, eq, gte, gt, ilike, inArray, isNotNull, lt, ne, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"
import { getAvaDb, schema } from "@/db/avaClient"
import type AvaTool from "./types"
import { fyToRange } from "./fyToRange"
import {
  asRecord,
  asString,
  asNumber,
  resolveScopedClientSlug,
} from "./helpers"
import {
  jsonContent,
  parseZodOrError,
  requireAvaDbOrSoftFail,
} from "./postgresShared"

const { xeroArInvoices, mediaPlanMasters, clients } = schema

export const queryXeroStatusInput = z
  .object({
    client: z.string().min(1).optional(),
    overdueOnly: z.boolean().optional(),
    fy: z.number().int().min(2000).max(2100).optional(),
  })
  .strict()

function num(v: unknown): number {
  if (v == null) return 0
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

export const queryXeroStatusTool: AvaTool = {
  definition: {
    name: "query_xero_status",
    description:
      "Postgres: compact xero_ar_invoices summary — invoice counts, totals AUD, amount due, oldest overdue. Optional client filter (via MBA→client join or invoice reference), overdueOnly, and fy = Australian FY ENDING year (fy=2026 means Jul 2025 – Jun 2026; filters on issue_date). Prefer for AR / overdue questions. Keep answers compact.",
    input_schema: {
      type: "object",
      properties: {
        client: {
          type: "string",
          description: "Client name/slug to scope invoices (MBA match + contact name heuristic).",
        },
        overdueOnly: {
          type: "boolean",
          description: "If true, only invoices with amount_due > 0 and due_date before today.",
        },
        fy: {
          type: "number",
          description:
            "Australian FY ending year. fy=2026 means Jul 2025 – Jun 2026 (use for \"this FY\" / FY26). Filters issue_date into that FY.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const gate = requireAvaDbOrSoftFail()
    if (!gate.ok) return gate.result

    const parsed = parseZodOrError(queryXeroStatusInput, input)
    if (!parsed.ok) return { content: parsed.content, isError: true }

    const args = asRecord(input)
    const clientArg =
      parsed.data.client ?? asString(args.client) ?? context.clientSlug
    if (clientArg) {
      const scoped = resolveScopedClientSlug(context, clientArg)
      if (!scoped.ok) return { content: scoped.error, isError: true }
    }
    const overdueOnly =
      parsed.data.overdueOnly === true || args.overdueOnly === true
    const fy = parsed.data.fy ?? asNumber(args.fy)
    const fyRange = fy != null ? fyToRange(fy) : null

    try {
      const db = getAvaDb()
      const today = new Date().toISOString().slice(0, 10)

      const conditions: SQL[] = [
        // exclude voided/deleted-ish
        or(
          sql`${xeroArInvoices.status} is null`,
          and(
            ne(xeroArInvoices.status, "VOIDED"),
            ne(xeroArInvoices.status, "DELETED"),
          ),
        )!,
      ]

      if (fyRange) {
        conditions.push(gte(xeroArInvoices.issueDate, fyRange.startDate))
        conditions.push(lt(xeroArInvoices.issueDate, fyRange.endDateExclusive))
      }

      if (overdueOnly) {
        conditions.push(gt(sql`coalesce(${xeroArInvoices.amountDue}::numeric, 0)`, 0))
        conditions.push(isNotNull(xeroArInvoices.dueDate))
        conditions.push(lt(xeroArInvoices.dueDate, today))
        conditions.push(
          or(
            sql`${xeroArInvoices.status} is null`,
            and(
              ne(xeroArInvoices.status, "PAID"),
              ne(xeroArInvoices.status, "VOIDED"),
            ),
          )!,
        )
      }

      // Client scope: MBAs for that client, then invoices with matching mba_number
      let mbaSet: string[] | null = null
      if (clientArg) {
        const clientRows = await db
          .select({ mbaNumber: mediaPlanMasters.mbaNumber })
          .from(mediaPlanMasters)
          .leftJoin(clients, eq(mediaPlanMasters.clientId, clients.id))
          .where(
            or(
              ilike(mediaPlanMasters.mpClientName, `%${clientArg.trim()}%`),
              ilike(clients.mpClientName, `%${clientArg.trim()}%`),
            ),
          )
          .limit(200)
        mbaSet = [
          ...new Set(
            clientRows.map((r) => r.mbaNumber).filter((m): m is string => Boolean(m)),
          ),
        ]
        if (mbaSet.length === 0) {
          return {
            content: jsonContent({
              client: clientArg,
              overdueOnly,
              fy: fy ?? null,
              range: fyRange?.range ?? null,
              currency: "AUD",
              invoice_count: 0,
              total_aud: 0,
              amount_due_aud: 0,
              overdue_count: 0,
              oldest_overdue: null,
              message: "No MBAs found for that client; no AR rows scoped.",
            }),
            isError: false,
          }
        }
        conditions.push(inArray(xeroArInvoices.mbaNumber, mbaSet))
      }

      const rows = await db
        .select({
          status: xeroArInvoices.status,
          total: xeroArInvoices.total,
          amountDue: xeroArInvoices.amountDue,
          dueDate: xeroArInvoices.dueDate,
          invoiceNumber: xeroArInvoices.invoiceNumber,
          mbaNumber: xeroArInvoices.mbaNumber,
          currency: xeroArInvoices.currency,
        })
        .from(xeroArInvoices)
        .where(and(...conditions))
        .limit(500)

      let totalAud = 0
      let amountDueAud = 0
      let overdueCount = 0
      let oldestOverdue: {
        invoice_number: string | null
        mba: string | null
        due_date: string
        amount_due_aud: number
      } | null = null

      const byStatus: Record<string, number> = {}

      for (const r of rows) {
        const st = (r.status ?? "UNKNOWN").toUpperCase()
        byStatus[st] = (byStatus[st] ?? 0) + 1
        totalAud = Math.round((totalAud + num(r.total)) * 100) / 100
        const due = num(r.amountDue)
        amountDueAud = Math.round((amountDueAud + due) * 100) / 100
        const dueDate = r.dueDate
        if (due > 0 && dueDate && dueDate < today && st !== "PAID" && st !== "VOIDED") {
          overdueCount++
          if (!oldestOverdue || dueDate < oldestOverdue.due_date) {
            oldestOverdue = {
              invoice_number: r.invoiceNumber ?? null,
              mba: r.mbaNumber ?? null,
              due_date: dueDate,
              amount_due_aud: due,
            }
          }
        }
      }

      return {
        content: jsonContent({
          client: clientArg ?? null,
          overdueOnly,
          fy: fy ?? null,
          range: fyRange?.range ?? null,
          currency: "AUD",
          invoice_count: rows.length,
          truncated: rows.length >= 500,
          total: rows.length >= 500 ? rows.length : undefined,
          total_aud: totalAud,
          amount_due_aud: amountDueAud,
          overdue_count: overdueCount,
          status_counts: byStatus,
          oldest_overdue: oldestOverdue,
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `query_xero_status failed: ${message}`, isError: true }
    }
  },
}
