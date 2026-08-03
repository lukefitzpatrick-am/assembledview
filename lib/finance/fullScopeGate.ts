/**
 * PC2 — widened C1 full-scope gate: Σ billing schedule_months (media+fee+adserving)
 * + production must equal approved_slice.totalCents ± 1 cent.
 *
 * Flag: SAVE_GATE_FULL_SCOPE=off|log|enforce (default off).
 */

import type { ApprovedSlice } from "@/lib/finance/approvedSlice"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import type { ScheduleMonthInsert } from "@/scripts/migration/_scheduleTransform"

export type SaveGateFullScopeMode = "off" | "log" | "enforce"

export type FullScopeComponent =
  | "media"
  | "fee"
  | "adserving"
  | "production"
  | "total"

export type FullScopeDrift = {
  component: FullScopeComponent
  lineItemId: string | null
  scheduleCents: number
  sliceCents: number
  deltaCents: number
}

export type FullScopeGateResult = {
  ok: boolean
  mode: SaveGateFullScopeMode
  scheduleTotalCents: number
  sliceTotalCents: number
  deltaCents: number
  drifts: FullScopeDrift[]
  /** Humanised message naming the worst component/line. */
  message: string
}

const TOLERANCE_CENTS = 1

export function getSaveGateFullScopeMode(): SaveGateFullScopeMode {
  const v = (process.env.SAVE_GATE_FULL_SCOPE ?? "off").trim().toLowerCase()
  if (v === "log" || v === "enforce") return v
  return "off"
}

function isBillingBasis(row: ScheduleMonthInsert): boolean {
  return row.basis === "billing"
}

/**
 * Sum billing-basis schedule_months for full-scope compare.
 * Production = media component on production line ids OR __service__production.
 * Adserving = component 'adserving' OR legacy __service__adserving (fee).
 */
export function sumBillingScheduleFullScopeCents(
  rows: ScheduleMonthInsert[]
): {
  totalCents: number
  byLine: Map<
    string,
    { media: number; fee: number; adserving: number; production: number }
  >
  mediaCents: number
  feeCents: number
  adservingCents: number
  productionCents: number
} {
  const byLine = new Map<
    string,
    { media: number; fee: number; adserving: number; production: number }
  >()
  let mediaCents = 0
  let feeCents = 0
  let adservingCents = 0
  let productionCents = 0

  const ensure = (id: string) => {
    let row = byLine.get(id)
    if (!row) {
      row = { media: 0, fee: 0, adserving: 0, production: 0 }
      byLine.set(id, row)
    }
    return row
  }

  for (const r of rows) {
    if (!isBillingBasis(r)) continue
    const rawId = String(r.lineItemId ?? "").trim()
    // Keep __service__* keys as-is; canonicalize real line ids (MB-11).
    const id = rawId.startsWith("__service__")
      ? rawId
      : toBillingOverrideLineItemId(rawId)
    const cents = Number(r.amountCents) || 0
    if (!id || cents === 0) continue

    if (id === "__service__adserving" || r.component === "adserving") {
      adservingCents += cents
      ensure(id).adserving += cents
      continue
    }
    if (id === "__service__production") {
      productionCents += cents
      ensure(id).production += cents
      continue
    }
    if (id === "__service__fees") {
      feeCents += cents
      ensure(id).fee += cents
      continue
    }
    if (id === "__service__media_total") {
      mediaCents += cents
      ensure(id).media += cents
      continue
    }

    const isProductionLine =
      id.includes("-production::") ||
      id.startsWith("billing-production::") ||
      /production/i.test(id.split("::")[0] ?? "")

    if (r.component === "fee") {
      feeCents += cents
      ensure(id).fee += cents
    } else if (r.component === "media" && isProductionLine) {
      productionCents += cents
      ensure(id).production += cents
    } else if (r.component === "media") {
      mediaCents += cents
      ensure(id).media += cents
    } else if (r.component === "adserving") {
      adservingCents += cents
      ensure(id).adserving += cents
    }
  }

  return {
    totalCents: mediaCents + feeCents + adservingCents + productionCents,
    byLine,
    mediaCents,
    feeCents,
    adservingCents,
    productionCents,
  }
}

function sliceByLine(slice: ApprovedSlice) {
  const byLine = new Map<
    string,
    { media: number; fee: number; adserving: number; production: number }
  >()
  for (const l of slice.lines) {
    byLine.set(toBillingOverrideLineItemId(l.lineItemId), {
      media: l.mediaCents,
      fee: l.feeCents,
      adserving: l.adservingCents,
      production: l.productionCents,
    })
  }
  return byLine
}

/**
 * Compare schedule_months billing full-scope to approved_slice.
 * Returns drifts (per component / line) when |delta| > 1 cent.
 */
export function evaluateFullScopeGate(args: {
  scheduleRows: ScheduleMonthInsert[]
  approvedSlice: ApprovedSlice
  mode?: SaveGateFullScopeMode
}): FullScopeGateResult {
  const mode = args.mode ?? getSaveGateFullScopeMode()
  const schedule = sumBillingScheduleFullScopeCents(args.scheduleRows)
  const sliceTotal = args.approvedSlice.totalCents
  const deltaCents = schedule.totalCents - sliceTotal
  const drifts: FullScopeDrift[] = []

  if (Math.abs(deltaCents) > TOLERANCE_CENTS) {
    drifts.push({
      component: "total",
      lineItemId: null,
      scheduleCents: schedule.totalCents,
      sliceCents: sliceTotal,
      deltaCents,
    })
  }

  const sliceLines = sliceByLine(args.approvedSlice)
  const allIds = new Set([...schedule.byLine.keys(), ...sliceLines.keys()])
  for (const id of allIds) {
    if (id.startsWith("__service__")) continue
    const s = schedule.byLine.get(id) ?? {
      media: 0,
      fee: 0,
      adserving: 0,
      production: 0,
    }
    const t = sliceLines.get(id) ?? {
      media: 0,
      fee: 0,
      adserving: 0,
      production: 0,
    }
    for (const component of [
      "media",
      "fee",
      "adserving",
      "production",
    ] as const) {
      const sc = s[component]
      const tc = t[component]
      const d = sc - tc
      if (Math.abs(d) > TOLERANCE_CENTS) {
        drifts.push({
          component,
          lineItemId: id,
          scheduleCents: sc,
          sliceCents: tc,
          deltaCents: d,
        })
      }
    }
  }

  const worst =
    drifts.find((d) => d.component !== "total") ?? drifts.find((d) => d.component === "total")
  let message = "Billing schedule matches approved slice."
  if (worst) {
    const lineBit = worst.lineItemId ? ` on line ${worst.lineItemId}` : ""
    const dollars = (cents: number) => (cents / 100).toFixed(2)
    message = `Full-scope C1 drift: ${worst.component}${lineBit} — schedule $${dollars(
      worst.scheduleCents
    )} vs approved slice $${dollars(worst.sliceCents)} (Δ $${dollars(worst.deltaCents)}).`
  }

  const ok = Math.abs(deltaCents) <= TOLERANCE_CENTS
  return {
    ok,
    mode,
    scheduleTotalCents: schedule.totalCents,
    sliceTotalCents: sliceTotal,
    deltaCents,
    drifts,
    message,
  }
}
