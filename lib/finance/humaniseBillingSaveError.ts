/**
 * Map C1/C2 billing save API error bodies to human toast / save-status text.
 */

import { formatAUD } from "@/lib/format/money"

export type BillingSaveErrorBody = {
  code?: string
  error?: string
  message?: string
  userMessage?: string
  sumViolations?: Array<{ message?: string }>
  delta?: {
    lines?: Array<{
      lineItemId?: string
      field?: string
      delta?: number
      label?: string
      clientTotal?: number
      serverTotal?: number
    }>
    totalDeltaExGst?: number
  }
}

function humaniseDivergenceLines(
  lines: NonNullable<NonNullable<BillingSaveErrorBody["delta"]>["lines"]>
): string | null {
  const parts: string[] = []
  for (const line of lines) {
    const field = String(line.field ?? "")
    const abs = formatAUD(Math.abs(Number(line.delta) || 0))
    const name = String(line.label ?? line.lineItemId ?? "").trim() || "line"
    if (field === "adserving") {
      parts.push(
        line.lineItemId === "*"
          ? `Ad serving differs from the approved MBA by ${abs}`
          : `Ad serving on line ${name} differs from the approved MBA by ${abs}`
      )
    } else if (field === "production") {
      parts.push(
        line.lineItemId === "*"
          ? `Production differs from the approved MBA by ${abs}`
          : `Production on line ${name} differs from the approved MBA by ${abs}`
      )
    } else if (field === "campaign_total") {
      parts.push(
        `The full billing total (media + fee + ad serving + production) differs from the approved MBA by ${abs}`
      )
    }
  }
  return parts.length > 0 ? parts.join("\n") : null
}

export function humaniseBillingSaveError(
  errorData: BillingSaveErrorBody | null | undefined,
  fallback = "Failed to save"
): string {
  const body = errorData ?? {}
  switch (body.code) {
    case "BILLING_OVERRIDE_SUM_VIOLATION": {
      const lines = (body.sumViolations ?? [])
        .map((v) => String(v.message ?? "").trim())
        .filter(Boolean)
      if (lines.length > 0) return lines.join("\n")
      return body.error || body.message || fallback
    }
    case "BILLING_SCHEDULE_DIVERGENCE": {
      if (body.userMessage) return body.userMessage
      const fromLines = humaniseDivergenceLines(body.delta?.lines ?? [])
      if (fromLines) return fromLines
      return body.error || body.message || fallback
    }
    case "BILLING_RECOMPUTE_MISSING_LINE_ITEMS":
      return "Couldn't recompute billing — reopen MBA & billing and try again."
    case "PLANC_C3_SCHEDULE_REQUIRED":
      return (
        body.userMessage ||
        body.error ||
        "Channel line items exist but no billing schedule was saved"
      )
    default:
      return body.error || body.message || fallback
  }
}

/** True when the PUT failure is a finance gate — create must not fall back to local version create. */
export function isBillingSaveGateError(errorData: BillingSaveErrorBody | null | undefined): boolean {
  const code = errorData?.code
  return (
    code === "BILLING_OVERRIDE_SUM_VIOLATION" ||
    code === "BILLING_SCHEDULE_DIVERGENCE" ||
    code === "BILLING_RECOMPUTE_MISSING_LINE_ITEMS" ||
    code === "PLANC_C3_SCHEDULE_REQUIRED"
  )
}

/** Stamp MBA scope titles onto line items for server-side human error copy. */
export function withMbaScopeLineLabels<T extends { lineItemId: string; label?: string }>(
  lineItems: T[],
  scopeLines: Array<{ lineItemId: string; title: string }>
): Array<T & { label: string }> {
  const byId = new Map(scopeLines.map((s) => [s.lineItemId, s.title]))
  return lineItems.map((line) => ({
    ...line,
    label: byId.get(line.lineItemId) || line.label || line.lineItemId,
  }))
}
