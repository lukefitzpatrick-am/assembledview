import { formatAUD, roundMoney2 } from "@/lib/format/money"

export type ValidateBillableEqualsMbaInput = {
  mbaTotalExGst: number
  billingScheduleTotalExGst: number
  /** Dollar tolerance (despite the name). Defaults to 0.01 (one cent). */
  toleranceCents?: number
}

export type ValidateBillableEqualsMbaResult = {
  ok: boolean
  deltaExGst: number
  message?: string
}

const DEFAULT_TOLERANCE = 0.01

/**
 * Ensures the billing-schedule total (ex GST) matches the MBA total within tolerance.
 * Not wired into save/billing paths yet — Phase 0 validator only.
 */
export function validateBillableEqualsMba(
  input: ValidateBillableEqualsMbaInput
): ValidateBillableEqualsMbaResult {
  const tolerance = input.toleranceCents ?? DEFAULT_TOLERANCE
  const deltaExGst = roundMoney2(
    input.billingScheduleTotalExGst - input.mbaTotalExGst
  )
  const ok = Math.abs(deltaExGst) <= tolerance

  if (ok) {
    return { ok: true, deltaExGst }
  }

  const billingFmt = formatAUD(input.billingScheduleTotalExGst)
  const mbaFmt = formatAUD(input.mbaTotalExGst)
  const deltaFmt = formatAUD(Math.abs(deltaExGst))

  return {
    ok: false,
    deltaExGst,
    message: `Billing schedule total (${billingFmt}) does not match the MBA total (${mbaFmt}) — off by ${deltaFmt}. Rebuild the billing schedule (Edit Billing → reset to auto) or correct the plan before saving/billing.`,
  }
}
