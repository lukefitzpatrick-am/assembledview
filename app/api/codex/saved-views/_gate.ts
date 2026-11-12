/** Saved views route helpers (F8). The gates themselves stay inline in each handler. */
import type { NextResponse } from "next/server"
import { SavedViewsLimitError, SavedViewsUnavailableError } from "@/lib/codex/savedViewsRepo"
import { jsonError } from "../_shared"

/** 503 before migration 0117, 409 at the per-person limit, else 500 without detail. */
export function savedViewsErrorResponse(error: unknown, action: string): NextResponse {
  if (error instanceof SavedViewsUnavailableError) {
    return jsonError(503, "saved_views_unavailable", error.message)
  }
  if (error instanceof SavedViewsLimitError) {
    return jsonError(409, "saved_views_limit", error.message)
  }
  console.error(`Codex saved views ${action} failed:`, error)
  return jsonError(500, "saved_views_failed", "Saved views failed. Try again.")
}

/** A positive whole number id from the route segment, else null. */
export function savedViewId(raw: string): number | null {
  return /^[1-9]\d{0,15}$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null
}
