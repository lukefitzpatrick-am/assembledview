import { and, eq, gte, ilike, lt, lte, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"
import {
  getAvaDb,
  withRowCap,
  AVA_SEARCH_CAP,
  schema,
} from "@/db/avaClient"
import { LINE_CHANNELS, type LineChannel } from "@/db/schema/enums"
import { slugifyClientNameForUrl } from "@/lib/clients/slug"
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
  summariseAttrs,
  summariseBursts,
} from "./postgresShared"

const { mediaPlanMasters, mediaPlanVersions, lineItems, clients } = schema

const channelSet = new Set<string>(LINE_CHANNELS)

export const searchLineItemsInput = z
  .object({
    client: z.string().min(1).optional(),
    channel: z
      .string()
      .refine((v) => channelSet.has(v), { message: "Invalid line_channel" })
      .optional(),
    publisher: z.string().min(1).optional(),
    market: z.string().min(1).optional(),
    fy: z.number().int().min(2000).max(2100).optional(),
    dateRange: z
      .object({
        from: z.string().min(4).optional(),
        to: z.string().min(4).optional(),
      })
      .strict()
      .optional(),
    minBudget: z.number().nonnegative().optional(),
  })
  .strict()

export const searchLineItemsTool: AvaTool = {
  definition: {
    name: "search_line_items",
    description:
      "Postgres: cross-campaign search over line_items joined to versions/masters (and clients). Filter by client, channel, publisher, market, optional fy = Australian FY ENDING year (fy=2026 means Jul 2025 – Jun 2026; campaign overlap), dateRange, minBudget (AUD from bursts). Prefer for \"which campaigns have X lines\" questions across MBAs. Amounts AUD. Hard cap 200 rows.",
    input_schema: {
      type: "object",
      properties: {
        client: {
          type: "string",
          description: "Client name or slug (matches mp_client_name / clients).",
        },
        channel: {
          type: "string",
          description: "line_channel enum value (e.g. prog_video, social, search).",
        },
        publisher: { type: "string", description: "Publisher substring (ilike)." },
        market: { type: "string", description: "Market substring (ilike)." },
        fy: {
          type: "number",
          description:
            "Australian FY ending year. fy=2026 means Jul 2025 – Jun 2026 (use for \"this FY\" / FY26). Campaign must overlap the FY.",
        },
        dateRange: {
          type: "object",
          properties: {
            from: { type: "string", description: "Campaign start on/after YYYY-MM-DD." },
            to: { type: "string", description: "Campaign end on/before YYYY-MM-DD." },
          },
          additionalProperties: false,
        },
        minBudget: {
          type: "number",
          description: "Minimum line burst budget in AUD dollars.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const gate = requireAvaDbOrSoftFail()
    if (!gate.ok) return gate.result

    const parsed = parseZodOrError(searchLineItemsInput, input)
    if (!parsed.ok) return { content: parsed.content, isError: true }

    const args = asRecord(input)
    const clientArg =
      parsed.data.client ?? asString(args.client) ?? context.clientSlug
    if (clientArg) {
      const scoped = resolveScopedClientSlug(context, clientArg)
      if (!scoped.ok) return { content: scoped.error, isError: true }
    }

    const channel = parsed.data.channel ?? asString(args.channel)
    const publisher = parsed.data.publisher ?? asString(args.publisher)
    const market = parsed.data.market ?? asString(args.market)
    const minBudget =
      parsed.data.minBudget ?? asNumber(args.minBudget)
    const fy = parsed.data.fy ?? asNumber(args.fy)
    const fyRange = fy != null ? fyToRange(fy) : null
    const dateRange =
      parsed.data.dateRange ??
      (args.dateRange && typeof args.dateRange === "object"
        ? (args.dateRange as { from?: string; to?: string })
        : undefined)

    try {
      const db = getAvaDb()
      const conditions: SQL[] = []

      // Prefer published version only (join masters.published_version_id)
      conditions.push(
        eq(mediaPlanMasters.publishedVersionId, mediaPlanVersions.id),
      )

      if (channel) {
        conditions.push(eq(lineItems.channel, channel as LineChannel))
      }
      if (publisher) {
        conditions.push(ilike(lineItems.publisher, `%${publisher}%`))
      }
      if (market) {
        conditions.push(ilike(lineItems.market, `%${market}%`))
      }
      if (fyRange) {
        // Campaign overlaps [startDate, endDateExclusive)
        conditions.push(lt(mediaPlanVersions.campaignStartDate, fyRange.endDateExclusive))
        conditions.push(gte(mediaPlanVersions.campaignEndDate, fyRange.startDate))
      }
      if (dateRange?.from) {
        conditions.push(gte(mediaPlanVersions.campaignStartDate, dateRange.from))
      }
      if (dateRange?.to) {
        conditions.push(lte(mediaPlanVersions.campaignEndDate, dateRange.to))
      }
      if (clientArg) {
        const slug = slugifyClientNameForUrl(clientArg)
        const wantLower = clientArg.trim().toLowerCase()
        conditions.push(
          or(
            ilike(mediaPlanMasters.mpClientName, `%${clientArg.trim()}%`),
            ilike(clients.mpClientName, `%${clientArg.trim()}%`),
            slug
              ? sql`lower(regexp_replace(coalesce(${mediaPlanMasters.mpClientName}, ''), '[^a-zA-Z0-9]+', '-', 'g')) like ${`%${slug}%`}`
              : sql`false`,
            sql`lower(coalesce(${clients.mpClientName}, '')) = ${wantLower}`,
          )!,
        )
      }

      const raw = await db
        .select({
          mbaNumber: mediaPlanMasters.mbaNumber,
          campaignName: mediaPlanMasters.campaignName,
          clientName: mediaPlanMasters.mpClientName,
          versionNumber: mediaPlanVersions.versionNumber,
          lineItemId: lineItems.lineItemId,
          channel: lineItems.channel,
          publisher: lineItems.publisher,
          market: lineItems.market,
          bursts: lineItems.bursts,
          attrs: lineItems.attrs,
          campaignStart: mediaPlanVersions.campaignStartDate,
          campaignEnd: mediaPlanVersions.campaignEndDate,
        })
        .from(lineItems)
        .innerJoin(mediaPlanVersions, eq(lineItems.versionId, mediaPlanVersions.id))
        .innerJoin(
          mediaPlanMasters,
          eq(mediaPlanVersions.masterId, mediaPlanMasters.id),
        )
        .leftJoin(clients, eq(mediaPlanMasters.clientId, clients.id))
        .where(and(...conditions))
        .limit(AVA_SEARCH_CAP + 50) // fetch a little extra for minBudget filter

      let mapped = raw.map((row) => {
        const burst = summariseBursts(row.bursts)
        return {
          mba: row.mbaNumber,
          campaign: row.campaignName ?? null,
          client: row.clientName ?? null,
          version_number: row.versionNumber,
          line_item_id: row.lineItemId,
          channel: row.channel,
          publisher: row.publisher ?? null,
          market: row.market ?? null,
          budget_aud: burst.budgetAud,
          campaign_start: row.campaignStart ?? null,
          campaign_end: row.campaignEnd ?? null,
          attrs: summariseAttrs(row.attrs),
        }
      })

      if (minBudget != null) {
        mapped = mapped.filter((r) => r.budget_aud >= minBudget)
      }

      const { rows, truncated, total } = withRowCap(mapped, AVA_SEARCH_CAP)

      return {
        content: jsonContent({
          currency: "AUD",
          fy: fy ?? null,
          range: fyRange?.range ?? null,
          filters: {
            client: clientArg ?? null,
            channel: channel ?? null,
            publisher: publisher ?? null,
            market: market ?? null,
            fy: fy ?? null,
            dateRange: dateRange ?? null,
            minBudget: minBudget ?? null,
          },
          total,
          truncated,
          lines: rows,
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `search_line_items failed: ${message}`, isError: true }
    }
  },
}
