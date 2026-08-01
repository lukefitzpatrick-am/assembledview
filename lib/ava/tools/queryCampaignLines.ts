import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { getAvaDb, withRowCap, AVA_ROW_CAP, schema } from "@/db/avaClient"
import type AvaTool from "./types"
import { fyToRange } from "./fyToRange"
import {
  asRecord,
  asString,
  asNumber,
  resolveScopedMba,
} from "./helpers"
import {
  jsonContent,
  parseZodOrError,
  requireAvaDbOrSoftFail,
  summariseAttrs,
  summariseBursts,
} from "./postgresShared"

const { mediaPlanMasters, mediaPlanVersions, lineItems } = schema

export const queryCampaignLinesInput = z
  .object({
    mba: z.string().min(1).optional(),
    mbaNumber: z.string().min(1).optional(),
    version: z.number().int().positive().optional(),
    fy: z.number().int().min(2000).max(2100).optional(),
  })
  .strict()

async function resolveVersionId(
  mba: string,
  version?: number,
): Promise<
  | { ok: true; versionId: number; versionNumber: number; published: boolean }
  | { ok: false; error: string }
> {
  const db = getAvaDb()
  const [master] = await db
    .select({
      id: mediaPlanMasters.id,
      publishedVersionId: mediaPlanMasters.publishedVersionId,
    })
    .from(mediaPlanMasters)
    .where(eq(mediaPlanMasters.mbaNumber, mba))
    .limit(1)

  if (!master) return { ok: false, error: `No media plan master for MBA "${mba}".` }

  if (version != null) {
    const [ver] = await db
      .select({
        id: mediaPlanVersions.id,
        versionNumber: mediaPlanVersions.versionNumber,
      })
      .from(mediaPlanVersions)
      .where(
        and(
          eq(mediaPlanVersions.mbaNumber, mba),
          eq(mediaPlanVersions.versionNumber, version),
        ),
      )
      .limit(1)
    if (!ver) {
      return { ok: false, error: `Version ${version} not found for MBA "${mba}".` }
    }
    return {
      ok: true,
      versionId: ver.id,
      versionNumber: ver.versionNumber,
      published: master.publishedVersionId === ver.id,
    }
  }

  if (master.publishedVersionId == null) {
    return {
      ok: false,
      error: `MBA "${mba}" has no published version (published_version_id is null). Pass version explicitly.`,
    }
  }

  const [pub] = await db
    .select({
      id: mediaPlanVersions.id,
      versionNumber: mediaPlanVersions.versionNumber,
    })
    .from(mediaPlanVersions)
    .where(eq(mediaPlanVersions.id, master.publishedVersionId))
    .limit(1)

  if (!pub) {
    return {
      ok: false,
      error: `Published version id ${master.publishedVersionId} missing for MBA "${mba}".`,
    }
  }

  return {
    ok: true,
    versionId: pub.id,
    versionNumber: pub.versionNumber,
    published: true,
  }
}

export const queryCampaignLinesTool: AvaTool = {
  definition: {
    name: "query_campaign_lines",
    description:
      "Postgres: list line items for an MBA (channel, publisher, market, burst budget AUD, key attrs). Uses the published version unless version is passed. Optional fy = Australian FY ENDING year (fy=2026 means Jul 2025 – Jun 2026) filters lines whose bursts overlap that FY. Prefer this over get_media_plan_summary / get_campaign_context for \"how much / list lines\" questions. Amounts are AUD. Capped at 500 rows.",
    input_schema: {
      type: "object",
      properties: {
        mba: {
          type: "string",
          description: "MBA number. Defaults to page context mbaNumber.",
        },
        version: {
          type: "number",
          description:
            "Optional version_number. Defaults to the master's published version (not max version).",
        },
        fy: {
          type: "number",
          description:
            "Australian FY ending year. fy=2026 means Jul 2025 – Jun 2026 (use for \"this FY\" / FY26). Keeps lines whose bursts overlap the FY.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const gate = requireAvaDbOrSoftFail()
    if (!gate.ok) return gate.result

    const parsed = parseZodOrError(queryCampaignLinesInput, input)
    if (!parsed.ok) return { content: parsed.content, isError: true }

    const args = asRecord(input)
    const scopedMba = resolveScopedMba(
      context,
      parsed.data.mba ?? parsed.data.mbaNumber ?? asString(args.mba) ?? context.mbaNumber,
    )
    if (!scopedMba.ok) return { content: scopedMba.error, isError: true }
    const mba = scopedMba.mba
    if (!mba) {
      return {
        content: "mba is required (pass it or open a media plan page).",
        isError: true,
      }
    }

    const versionArg =
      parsed.data.version ?? asNumber(args.version) ?? context.versionNumber
    const fy = parsed.data.fy ?? asNumber(args.fy)
    const fyRange = fy != null ? fyToRange(fy) : null

    try {
      const resolved = await resolveVersionId(mba, versionArg)
      if (!resolved.ok) return { content: resolved.error, isError: true }

      const db = getAvaDb()
      const raw = await db
        .select({
          lineItemId: lineItems.lineItemId,
          channel: lineItems.channel,
          publisher: lineItems.publisher,
          platform: lineItems.platform,
          market: lineItems.market,
          buyType: lineItems.buyType,
          buyingDemo: lineItems.buyingDemo,
          position: lineItems.position,
          bursts: lineItems.bursts,
          attrs: lineItems.attrs,
        })
        .from(lineItems)
        .where(eq(lineItems.versionId, resolved.versionId))
        .limit(AVA_ROW_CAP + 1)

      let mapped = raw.map((row) => {
        const burst = summariseBursts(row.bursts)
        return {
          line_item_id: row.lineItemId,
          channel: row.channel,
          publisher: row.publisher ?? null,
          platform: row.platform ?? null,
          market: row.market ?? null,
          buy_type: row.buyType ?? null,
          buying_demo: row.buyingDemo ?? null,
          position: row.position ?? null,
          budget_aud: burst.budgetAud,
          burst_count: burst.burstCount,
          start_date: burst.startDate,
          end_date: burst.endDate,
          attrs: summariseAttrs(row.attrs),
        }
      })

      if (fyRange) {
        mapped = mapped.filter((row) => {
          const start = row.start_date
          const end = row.end_date
          if (!start && !end) return false
          const s = start ?? end!
          const e = end ?? start!
          return s < fyRange.endDateExclusive && e >= fyRange.startDate
        })
      }

      const { rows, truncated, total } = withRowCap(mapped, AVA_ROW_CAP)

      return {
        content: jsonContent({
          mba,
          version_number: resolved.versionNumber,
          published: resolved.published,
          fy: fy ?? null,
          range: fyRange?.range ?? null,
          currency: "AUD",
          total,
          truncated,
          lines: rows,
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `query_campaign_lines failed: ${message}`, isError: true }
    }
  },
}
