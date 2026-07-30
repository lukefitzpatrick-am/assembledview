import { z } from "zod"
import { parseMoneyInput, roundMoney2 } from "@/lib/format/money"
import { isAvaDbConfigured } from "@/db/avaClient"
import { jsonContent } from "./helpers"

/** Clear soft-fail when AVA_DATABASE_URL is unset — existing Xano tools still work. */
export const AVA_DB_NOT_CONFIGURED =
  "AVA Postgres is not configured (AVA_DATABASE_URL unset). Prefer get_campaign_context / get_media_plan_summary for this turn."

export function avaDbNotConfiguredResult() {
  return { content: AVA_DB_NOT_CONFIGURED, isError: false as const }
}

export function requireAvaDbOrSoftFail():
  | { ok: true }
  | { ok: false; result: ReturnType<typeof avaDbNotConfiguredResult> } {
  if (!isAvaDbConfigured()) return { ok: false, result: avaDbNotConfiguredResult() }
  return { ok: true }
}

/** Convert integer cents → AUD dollars at 2dp (AVA speaks dollars). */
export function centsToDollars(cents: number | null | undefined): number {
  if (cents == null || !Number.isFinite(cents)) return 0
  return roundMoney2(cents / 100)
}

/** Sum planned burst budget from line_items.bursts jsonb (dollars, not cents). */
export function burstBudgetDollars(bursts: unknown): number {
  if (!Array.isArray(bursts)) return 0
  let s = 0
  for (const b of bursts) {
    if (!b || typeof b !== "object") continue
    const row = b as Record<string, unknown>
    if (row.budget != null) {
      s += parseMoneyInput(row.budget as string | number) ?? 0
    } else if (row.cost != null) {
      const cost = parseMoneyInput(row.cost as string | number) ?? 0
      const amount =
        row.amount != null ? (parseMoneyInput(row.amount as string | number) ?? 1) : 1
      s += cost * (amount || 1)
    }
  }
  return roundMoney2(s)
}

const ATTR_KEYS = [
  "placement",
  "creative",
  "network",
  "station",
  "title",
  "size",
  "format",
  "daypart",
  "type",
] as const

/** Flatten key attrs only — never return raw jsonb blobs. */
export function summariseAttrs(attrs: unknown): Record<string, string> {
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return {}
  const src = attrs as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const key of ATTR_KEYS) {
    const v = src[key]
    if (v == null || v === "") continue
    const s = String(v).trim()
    if (s) out[key] = s.length > 80 ? `${s.slice(0, 79)}…` : s
  }
  return out
}

export function summariseBursts(bursts: unknown): {
  burstCount: number
  budgetAud: number
  startDate: string | null
  endDate: string | null
} {
  if (!Array.isArray(bursts) || bursts.length === 0) {
    return { burstCount: 0, budgetAud: 0, startDate: null, endDate: null }
  }
  let startDate: string | null = null
  let endDate: string | null = null
  for (const b of bursts) {
    if (!b || typeof b !== "object") continue
    const row = b as Record<string, unknown>
    const s = row.startDate != null ? String(row.startDate).trim() : ""
    const e = row.endDate != null ? String(row.endDate).trim() : ""
    if (s && (!startDate || s < startDate)) startDate = s
    if (e && (!endDate || e > endDate)) endDate = e
  }
  return {
    burstCount: bursts.length,
    budgetAud: burstBudgetDollars(bursts),
    startDate,
    endDate,
  }
}

export function monthKeyFromDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null
  const s = typeof value === "string" ? value : value.toISOString()
  const m = /^(\d{4}-\d{2})/.exec(s)
  return m ? m[1]! : null
}

export function parseZodOrError<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; content: string } {
  const parsed = schema.safeParse(input ?? {})
  if (!parsed.success) {
    return {
      ok: false,
      content: jsonContent({
        error: "Invalid tool input",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      }),
    }
  }
  return { ok: true, data: parsed.data }
}

export { jsonContent }
