/**
 * Map C1/C2 billing save API error bodies to human toast / save-status text.
 */

export type BillingSaveErrorBody = {
  code?: string
  error?: string
  message?: string
  userMessage?: string
  sumViolations?: Array<{ message?: string }>
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
    case "BILLING_SCHEDULE_DIVERGENCE":
      return body.userMessage || body.error || body.message || fallback
    case "BILLING_RECOMPUTE_MISSING_LINE_ITEMS":
      return "Couldn't recompute billing — reopen MBA & billing and try again."
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
    code === "BILLING_RECOMPUTE_MISSING_LINE_ITEMS"
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
