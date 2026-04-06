import * as z from "zod"

/** Xano `publisher_kpi` table row. */
export interface PublisherKpi {
  id: number
  created_at: number
  publisher: string
  bid_strategy: string
  ctr: number
  cpv: number
  conversion_rate: number
  vtr: number
  frequency: number
  media_type: string
}

export type PublisherKpiInput = Omit<PublisherKpi, "id" | "created_at">

const kpiMetric = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return 0
    const n = typeof v === "number" ? v : Number(String(v).trim())
    return Number.isFinite(n) ? n : 0
  })

const nonEmptyStr = z.string().trim().min(1, "Required")

export const publisherKpiCreateBodySchema = z.object({
  publisher: nonEmptyStr,
  media_type: nonEmptyStr,
  bid_strategy: nonEmptyStr,
  ctr: kpiMetric,
  cpv: kpiMetric,
  conversion_rate: kpiMetric,
  vtr: kpiMetric,
  frequency: kpiMetric,
})

export const publisherKpiPatchBodySchema = z
  .object({
    id: z.coerce.number(),
    publisher: z.string().trim().min(1).optional(),
    media_type: z.string().trim().min(1).optional(),
    bid_strategy: z.string().trim().min(1).optional(),
    ctr: kpiMetric.optional(),
    cpv: kpiMetric.optional(),
    conversion_rate: kpiMetric.optional(),
    vtr: kpiMetric.optional(),
    frequency: kpiMetric.optional(),
  })
  .refine(
    (o) =>
      o.publisher !== undefined ||
      o.media_type !== undefined ||
      o.bid_strategy !== undefined ||
      o.ctr !== undefined ||
      o.cpv !== undefined ||
      o.conversion_rate !== undefined ||
      o.vtr !== undefined ||
      o.frequency !== undefined,
    { message: "At least one field to update is required" },
  )

export type PublisherKpiCreateBody = z.infer<typeof publisherKpiCreateBodySchema>
export type PublisherKpiPatchBody = z.infer<typeof publisherKpiPatchBodySchema>
