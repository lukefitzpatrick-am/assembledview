import { and, eq, gte, lt, type SQL } from "drizzle-orm"
import { z } from "zod"
import { getAvaDb, withRowCap, AVA_ROW_CAP, schema } from "@/db/avaClient"
import { fyToRange } from "./fyToRange"
import type AvaTool from "./types"
import {
  asRecord,
  asString,
  asNumber,
  resolveScopedMba,
} from "./helpers"
import {
  centsToDollars,
  jsonContent,
  monthKeyFromDate,
  parseZodOrError,
  requireAvaDbOrSoftFail,
} from "./postgresShared"

const { mediaPlanMasters, mediaPlanVersions, scheduleMonths } = schema

const componentEnum = z.enum(["media", "fee"])
const basisEnum = z.enum(["billing", "delivery"])

export const queryScheduleMonthsInput = z
  .object({
    mba: z.string().min(1).optional(),
    mbaNumber: z.string().min(1).optional(),
    fy: z.number().int().min(2000).max(2100).optional(),
    component: componentEnum.optional(),
    basis: basisEnum.optional(),
    version: z.number().int().positive().optional(),
  })
  .strict()

async function resolvePublishedVersionId(
  mba: string,
  version?: number,
): Promise<
  | { ok: true; versionId: number; versionNumber: number }
  | { ok: false; error: string }
> {
  const db = getAvaDb()
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
    if (!ver) return { ok: false, error: `Version ${version} not found for MBA "${mba}".` }
    return { ok: true, versionId: ver.id, versionNumber: ver.versionNumber }
  }

  const [master] = await db
    .select({ publishedVersionId: mediaPlanMasters.publishedVersionId })
    .from(mediaPlanMasters)
    .where(eq(mediaPlanMasters.mbaNumber, mba))
    .limit(1)

  if (!master?.publishedVersionId) {
    return {
      ok: false,
      error: `MBA "${mba}" has no published version. Pass version explicitly.`,
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
    return { ok: false, error: `Published version missing for MBA "${mba}".` }
  }
  return { ok: true, versionId: pub.id, versionNumber: pub.versionNumber }
}

export const queryScheduleMonthsTool: AvaTool = {
  definition: {
    name: "query_schedule_months",
    description:
      "Postgres: planned schedule_months for an MBA — amounts in AUD dollars (converted from cents). Aggregates per month and per line. Optional fy = Australian FY ENDING year (fy=2026 means Jul 2025 – Jun 2026), component (media|fee), basis (billing|delivery). Prefer over get_media_plan_summary for monthly planned spend. Note: jayco016 and ~47 accepted divergence versions have no schedule rows. Capped at 500 line-month rows.",
    input_schema: {
      type: "object",
      properties: {
        mba: {
          type: "string",
          description: "MBA number. Defaults to page context mbaNumber.",
        },
        fy: {
          type: "number",
          description:
            "Australian FY ending year. fy=2026 means Jul 2025 – Jun 2026 (use for \"this FY\" / FY26).",
        },
        component: {
          type: "string",
          enum: ["media", "fee"],
          description: "Filter schedule component. Default: all.",
        },
        basis: {
          type: "string",
          enum: ["billing", "delivery"],
          description: "Filter schedule basis. Default: billing.",
        },
        version: {
          type: "number",
          description: "Optional version_number; default published.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const gate = requireAvaDbOrSoftFail()
    if (!gate.ok) return gate.result

    const parsed = parseZodOrError(queryScheduleMonthsInput, input)
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

    const basis = parsed.data.basis ?? "billing"
    const component = parsed.data.component
    const versionArg =
      parsed.data.version ?? asNumber(args.version) ?? context.versionNumber
    const fy = parsed.data.fy ?? asNumber(args.fy)

    try {
      const resolved = await resolvePublishedVersionId(mba, versionArg)
      if (!resolved.ok) return { content: resolved.error, isError: true }

      const conditions: SQL[] = [
        eq(scheduleMonths.versionId, resolved.versionId),
        eq(scheduleMonths.basis, basis),
      ]
      if (component) conditions.push(eq(scheduleMonths.component, component))
      const fyRange = fy != null ? fyToRange(fy) : null
      if (fyRange) {
        conditions.push(gte(scheduleMonths.month, fyRange.startDate))
        conditions.push(lt(scheduleMonths.month, fyRange.endDateExclusive))
      }

      const db = getAvaDb()
      const raw = await db
        .select({
          lineItemId: scheduleMonths.lineItemId,
          component: scheduleMonths.component,
          basis: scheduleMonths.basis,
          month: scheduleMonths.month,
          amountCents: scheduleMonths.amountCents,
        })
        .from(scheduleMonths)
        .where(and(...conditions))
        .orderBy(scheduleMonths.month, scheduleMonths.lineItemId)
        .limit(AVA_ROW_CAP + 1)

      const byMonth = new Map<string, number>()
      const lineRows = raw.map((r) => {
        const month = monthKeyFromDate(r.month) ?? String(r.month)
        const aud = centsToDollars(r.amountCents)
        byMonth.set(month, roundAdd(byMonth.get(month) ?? 0, aud))
        return {
          line_item_id: r.lineItemId,
          month,
          component: r.component,
          basis: r.basis,
          amount_aud: aud,
        }
      })

      const { rows, truncated, total } = withRowCap(lineRows, AVA_ROW_CAP)
      const perMonth = [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount_aud]) => ({ month, amount_aud }))

      const totalAud = perMonth.reduce((s, m) => roundAdd(s, m.amount_aud), 0)

      return {
        content: jsonContent({
          mba,
          version_number: resolved.versionNumber,
          basis,
          component: component ?? "all",
          fy: fy ?? null,
          range: fyRange?.range ?? null,
          currency: "AUD",
          total_planned_aud: totalAud,
          per_month: perMonth,
          total_line_rows: total,
          truncated,
          note:
            total === 0
              ? "No schedule_months rows (possible accepted divergence — e.g. jayco016 / ~47 versions with empty schedules)."
              : undefined,
          lines: rows,
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `query_schedule_months failed: ${message}`, isError: true }
    }
  },
}

function roundAdd(a: number, b: number): number {
  return Math.round((a + b) * 100) / 100
}
