/**
 * Parse a billing revision request from a route body or an Ava tool input.
 * Pure. Dollars in, integer cents out. Restore is never built from user
 * input: only from a stored revision (undo).
 */
import { toCents } from "@/lib/money"

import { isMonthKey } from "./planBillingRevision"
import type { RevisionOptions, RevisionRequest, UnderspendNoRemainingChoice } from "./types"

export type ParsedRevisionParams = {
  mbaNumber: string
  request: Exclude<RevisionRequest, { mode: "restore" }>
  options: RevisionOptions
  reason: string
}

export type ParseRevisionResult = { ok: true; value: ParsedRevisionParams } | { ok: false; message: string }

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function monthOr(v: unknown, fallback: string): string {
  const s = str(v)
  return s || fallback
}

function dollarsToCents(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : NaN
  if (!Number.isFinite(n)) return null
  return toCents(n)
}

function monthList(v: unknown): string[] | null {
  if (v == null) return []
  if (!Array.isArray(v)) return null
  const out = v.map(str)
  return out.every(isMonthKey) ? [...new Set(out)].sort() : null
}

export function parseRevisionParams(
  raw: unknown,
  defaults: { currentMonth: string; mbaNumber?: string | null },
): ParseRevisionResult {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Expected an object." }
  const b = raw as Record<string, unknown>
  const mbaNumber = str(b.mbaNumber) || str(b.mba_number) || str(defaults.mbaNumber)
  if (!mbaNumber) return { ok: false, message: "mbaNumber is required." }
  const reason = str(b.reason)
  if (!reason) return { ok: false, message: "A reason is required." }
  if (reason.length > 500) return { ok: false, message: "Keep the reason under 500 characters." }

  const unlock = monthList(b.unlockApprovedMonths)
  if (unlock == null) return { ok: false, message: "unlockApprovedMonths must be YYYY-MM months." }
  const feeMode = str(b.feeMode) || "follow"
  if (feeMode !== "follow" && feeMode !== "keep") return { ok: false, message: "feeMode is follow or keep." }
  const options: RevisionOptions = {
    unlockApprovedMonths: unlock,
    includeProduction: b.includeProduction === true,
    feeMode,
    adservingMode: "keep",
  }
  if (Array.isArray(b.lineFilter)) options.lineFilter = b.lineFilter.map(str).filter(Boolean)

  const mode = str(b.mode)
  let request: ParsedRevisionParams["request"]
  switch (mode) {
    case "bill_amount": {
      const intoMonth = monthOr(b.intoMonth, defaults.currentMonth)
      const cents =
        typeof b.amountCents === "number" && Number.isInteger(b.amountCents)
          ? b.amountCents
          : dollarsToCents(b.amount)
      if (cents == null) return { ok: false, message: "Enter an amount in dollars." }
      const strategy = str(b.strategy) || "earliest_first"
      if (strategy !== "earliest_first" && strategy !== "proportional") {
        return { ok: false, message: "strategy is earliest_first or proportional." }
      }
      request = { mode, intoMonth, amountCents: cents, strategy }
      break
    }
    case "bill_remainder":
      request = { mode, intoMonth: monthOr(b.intoMonth, defaults.currentMonth) }
      break
    case "pull_month": {
      const fromMonth = str(b.fromMonth)
      if (!isMonthKey(fromMonth)) return { ok: false, message: "fromMonth must be YYYY-MM." }
      request = { mode, fromMonth, intoMonth: monthOr(b.intoMonth, defaults.currentMonth) }
      break
    }
    case "underspend": {
      const month = str(b.underspendMonth) || str(b.month)
      if (!isMonthKey(month)) return { ok: false, message: "underspendMonth must be YYYY-MM." }
      const actualByLine: Record<string, number> = {}
      if (!Array.isArray(b.actuals) || b.actuals.length === 0) {
        return { ok: false, message: "Enter at least one actual." }
      }
      for (const a of b.actuals) {
        const row = (a ?? {}) as Record<string, unknown>
        const id = str(row.lineItemId)
        const cents =
          typeof row.amountCents === "number" && Number.isInteger(row.amountCents)
            ? row.amountCents
            : dollarsToCents(row.amount)
        if (!id || cents == null) return { ok: false, message: "Each actual needs a lineItemId and an amount." }
        actualByLine[id] = cents
      }
      const noRemaining: Record<string, UnderspendNoRemainingChoice> = {}
      const rawChoices = b.noRemaining
      const entries: Array<[string, unknown]> = Array.isArray(rawChoices)
        ? rawChoices.map((c) => [str((c as Record<string, unknown>)?.lineItemId), (c as Record<string, unknown>)?.choice])
        : rawChoices && typeof rawChoices === "object"
          ? Object.entries(rawChoices as Record<string, unknown>)
          : []
      for (const [id, choice] of entries) {
        if (!id) continue
        if (choice !== "last_month" && choice !== "credit") {
          return { ok: false, message: "noRemaining choices are last_month or credit." }
        }
        noRemaining[id] = choice
      }
      request = { mode, month, actualByLine, ...(Object.keys(noRemaining).length > 0 ? { noRemaining } : {}) }
      break
    }
    default:
      return { ok: false, message: "mode is bill_amount, bill_remainder, pull_month or underspend." }
  }
  if ("intoMonth" in request && !isMonthKey(request.intoMonth)) {
    return { ok: false, message: "intoMonth must be YYYY-MM." }
  }
  return { ok: true, value: { mbaNumber, request, options, reason } }
}
