import { z } from "zod"

import { parseLayout } from "@/lib/webReport/builder/layout"
import type { WebReportLayoutItem } from "@/lib/webReport/elements"
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/webReport/periods"

const connectionSchema = z.object({
  ga4PropertyRef: z.string().trim().max(120).nullable(),
  gscSiteRef: z.string().trim().max(300).nullable(),
  brandTerms: z.array(z.string().trim().min(1).max(80)).max(40),
  defaultPeriod: z.enum(REPORT_PERIODS),
})

const layoutSchema = z
  .array(
    z.object({
      elementId: z.string(),
      settings: z.unknown(),
      display: z.unknown().optional(),
      width: z.unknown().optional(),
    }),
  )
  .min(1)
  .max(40)

export const saveRequestSchema = connectionSchema.extend({
  action: z.literal("save"),
  layout: layoutSchema,
})

export const restoreRequestSchema = z.object({
  action: z.literal("restore"),
  version: z.number().int().positive(),
})

export const previewRequestSchema = connectionSchema.extend({
  action: z.literal("preview"),
  layout: layoutSchema,
})

type Connection = {
  ga4PropertyRef: string | null
  gscSiteRef: string | null
  brandTerms: string[]
  defaultPeriod: ReportPeriod
  layout: WebReportLayoutItem[]
}

export function parseBuilderRequest(value: unknown):
  | { ok: true; action: "save"; body: Connection }
  | { ok: true; action: "restore"; body: { version: number } }
  | { ok: true; action: "preview"; body: Connection }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || !("action" in value)) {
    return { ok: false, error: "Choose save, restore, or preview" }
  }
  const action = (value as { action?: unknown }).action
  if (action === "restore") {
    const parsed = restoreRequestSchema.safeParse(value)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") }
    }
    return { ok: true, action: "restore", body: { version: parsed.data.version } }
  }
  const schema = action === "save" ? saveRequestSchema : action === "preview" ? previewRequestSchema : null
  if (!schema) return { ok: false, error: "Choose save, restore, or preview" }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") }
  }
  const layout = parseLayout(parsed.data.layout)
  if (!layout.ok) return { ok: false, error: layout.error }
  const body: Connection = {
    ga4PropertyRef: parsed.data.ga4PropertyRef,
    gscSiteRef: parsed.data.gscSiteRef,
    brandTerms: parsed.data.brandTerms,
    defaultPeriod: parsed.data.defaultPeriod,
    layout: layout.layout,
  }
  if (parsed.data.action === "save") return { ok: true, action: "save", body }
  return { ok: true, action: "preview", body }
}
