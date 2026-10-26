import { z } from "zod"

import { parseLayout } from "@/lib/webReport/builder/layout"
import type { WebReportLayoutItem } from "@/lib/webReport/elements"
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/webReport/periods"

/** GA4 and Search Console come from client_platform_accounts; refs in a request are ignored. */
const connectionSchema = z.object({
  ga4PropertyRef: z.unknown().optional(),
  gscSiteRef: z.unknown().optional(),
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

export const accountsRequestSchema = z.object({ action: z.literal("accounts") })

export const linkRequestSchema = z.object({
  action: z.literal("link"),
  platform: z.enum(["ga4", "gsc"]),
  ref: z.string().trim().min(1).max(300).nullable(),
  label: z.string().trim().max(200).nullable().optional(),
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** A custom range previews the report only. The saved default stays a preset. */
export const previewRequestSchema = connectionSchema.extend({
  action: z.literal("preview"),
  layout: layoutSchema,
  from: isoDate.optional(),
  to: isoDate.optional(),
})

type Connection = {
  brandTerms: string[]
  defaultPeriod: ReportPeriod
  layout: WebReportLayoutItem[]
  /** Preview only. Both or neither. */
  range?: { from: string; to: string }
}

export function parseBuilderRequest(value: unknown):
  | { ok: true; action: "save"; body: Connection }
  | { ok: true; action: "restore"; body: { version: number } }
  | { ok: true; action: "preview"; body: Connection }
  | { ok: true; action: "accounts" }
  | { ok: true; action: "link"; body: { platform: "ga4" | "gsc"; ref: string | null; label: string | null } }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || !("action" in value)) {
    return { ok: false, error: "Choose save, restore, preview, accounts or link" }
  }
  const action = (value as { action?: unknown }).action
  if (action === "restore") {
    const parsed = restoreRequestSchema.safeParse(value)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") }
    }
    return { ok: true, action: "restore", body: { version: parsed.data.version } }
  }
  if (action === "accounts") return { ok: true, action: "accounts" }
  if (action === "link") {
    const parsed = linkRequestSchema.safeParse(value)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") }
    }
    return {
      ok: true,
      action: "link",
      body: { platform: parsed.data.platform, ref: parsed.data.ref, label: parsed.data.label ?? null },
    }
  }
  const schema = action === "save" ? saveRequestSchema : action === "preview" ? previewRequestSchema : null
  if (!schema) return { ok: false, error: "Choose save, restore, preview, accounts or link" }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") }
  }
  const layout = parseLayout(parsed.data.layout)
  if (!layout.ok) return { ok: false, error: layout.error }
  const body: Connection = {
    brandTerms: parsed.data.brandTerms,
    defaultPeriod: parsed.data.defaultPeriod,
    layout: layout.layout,
  }
  if (parsed.data.action === "save") return { ok: true, action: "save", body }
  const { from, to } = parsed.data as { from?: string; to?: string }
  if (Boolean(from) !== Boolean(to)) return { ok: false, error: "A custom range needs a start and an end date" }
  if (from && to) body.range = { from, to }
  return { ok: true, action: "preview", body }
}
