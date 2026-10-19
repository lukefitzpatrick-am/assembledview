import { z } from "zod"

import { GA4_KPI_METRICS, GSC_KPI_METRICS, WEB_KPI_SOURCES } from "./types"

const kpiId = z.string().uuid()

const upsertBody = z.object({
  action: z.literal("upsert"),
  kpi: z.object({
    id: kpiId.optional(),
    label: z.string().trim().min(1).max(80),
    source: z.enum(WEB_KPI_SOURCES),
    eventNames: z.array(z.string().trim().min(1).max(80)).max(20).nullable().optional(),
    metric: z.enum([...GA4_KPI_METRICS, ...GSC_KPI_METRICS]).nullable().optional(),
    sortOrder: z.number().int().optional(),
  }),
})

const targetsBody = z.object({
  action: z.literal("targets"),
  kpiId,
  targets: z
    .array(z.object({ month: z.string(), target: z.number() }))
    .max(48),
})

const deactivateBody = z.object({
  action: z.literal("deactivate"),
  kpiId,
})

const kpiRequest = z.discriminatedUnion("action", [upsertBody, targetsBody, deactivateBody])

export type KpiRequest = z.infer<typeof kpiRequest>

/** Body of POST /api/dashboard/[slug]/web-kpis. The client id never comes from the body. */
export function parseKpiRequest(payload: unknown): { ok: true; body: KpiRequest } | { ok: false; error: string } {
  const parsed = kpiRequest.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") }
  }
  return { ok: true, body: parsed.data }
}
