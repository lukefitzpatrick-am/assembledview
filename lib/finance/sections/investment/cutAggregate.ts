/**
 * Pure Investment cut aggregation — same semantics as cutQuery SQL.
 * Used by fixture tests (no DB). Cents only.
 */

import { classifyBillingAgency } from "@/lib/finance/billingAgency"
import {
  CAMPAIGN_LEVEL_NO_LINE_DETAIL,
  isServiceLineItemId,
  LINE_DETAIL_COVERAGE_NOTE,
} from "@/lib/finance/sections/serviceLineBucket"
import { channelGroupFor } from "./channelGroups"
import {
  FEE_COVERAGE_CAVEAT,
  INVESTMENT_CUT_MEASURES,
  INVESTMENT_CUT_ROW_CAP,
  UNMATCHED_PUBLISHER,
  type InvestmentCutDim,
  type InvestmentCutMeasure,
  type InvestmentCutNormalized,
  type InvestmentCutResponse,
  type InvestmentCutRow,
} from "./cutTypes"

/** One schedule_months cell after joins (fixture / in-memory shape). */
export type InvestmentCutFact = {
  amountCents: number
  component: "media" | "fee" | "adserving"
  basis: "billing" | "delivery"
  month: string // YYYY-MM-01 or YYYY-MM
  fy: number
  clientId: number | null
  clientName: string
  campaignName: string
  mbaNumber: string
  lineItemId: string // bare or schedule key (search matches both)
  channel: string | null
  market: string | null
  buyType: string | null
  clientPaysForMedia: boolean
  /** FN0 identity; null/empty → Unmatched */
  publisherIdentity: string | null
  /** Raw publishers.billingagency for the identity join (null → AM). */
  publisherBillingAgencyRaw?: string | null
}

function monthKey(month: string): string {
  return month.length >= 7 ? month.slice(0, 7) : month
}

function publisherLabel(identity: string | null | undefined): string {
  const t = String(identity ?? "").trim()
  return t || UNMATCHED_PUBLISHER
}

function billingAgencyOf(fact: InvestmentCutFact): "AA" | "AM" {
  return classifyBillingAgency(fact.publisherBillingAgencyRaw)
}

function dimValue(fact: InvestmentCutFact, dim: InvestmentCutDim): string | number | null {
  const serviceLine = isServiceLineItemId(fact.lineItemId)
  switch (dim) {
    case "client":
      return fact.clientName || "Unknown"
    case "channelGroup":
      return serviceLine ? CAMPAIGN_LEVEL_NO_LINE_DETAIL : channelGroupFor(fact.channel)
    case "channel":
      return serviceLine ? CAMPAIGN_LEVEL_NO_LINE_DETAIL : (fact.channel ?? "Unknown")
    case "publisher":
      return serviceLine ? CAMPAIGN_LEVEL_NO_LINE_DETAIL : publisherLabel(fact.publisherIdentity)
    case "buyType":
      return serviceLine
        ? CAMPAIGN_LEVEL_NO_LINE_DETAIL
        : (fact.buyType && fact.buyType.trim()) || "Unspecified"
    case "market":
      return serviceLine
        ? CAMPAIGN_LEVEL_NO_LINE_DETAIL
        : (fact.market && fact.market.trim()) || "Unspecified"
    case "month":
      return monthKey(fact.month)
    case "fy":
      return fact.fy
    case "billingAgency":
      return serviceLine ? CAMPAIGN_LEVEL_NO_LINE_DETAIL : billingAgencyOf(fact)
    default:
      return null
  }
}

function passesFilters(fact: InvestmentCutFact, q: InvestmentCutNormalized): boolean {
  const f = q.filters
  if (f.clients.length && (fact.clientId == null || !f.clients.includes(fact.clientId))) {
    return false
  }
  if (f.channels.length) {
    if (!fact.channel || !f.channels.includes(fact.channel)) return false
  }
  if (f.channelGroups.length) {
    if (!f.channelGroups.includes(channelGroupFor(fact.channel))) return false
  }
  if (f.publishers.length) {
    const pub = publisherLabel(fact.publisherIdentity).toLowerCase()
    if (!f.publishers.some((p) => pub.includes(p.toLowerCase()))) return false
  }
  if (f.buyTypes.length) {
    const bt = (fact.buyType ?? "").toLowerCase()
    if (!f.buyTypes.some((b) => bt === b.toLowerCase())) return false
  }
  if (f.markets.length) {
    const mk = (fact.market ?? "").toLowerCase()
    if (!f.markets.some((m) => mk === m.toLowerCase())) return false
  }
  if (f.billingAgency.length) {
    if (!f.billingAgency.includes(billingAgencyOf(fact))) return false
  }
  if (f.search) {
    const s = f.search.toLowerCase()
    const hay = [
      fact.clientName,
      fact.campaignName,
      fact.mbaNumber,
      fact.lineItemId,
      publisherLabel(fact.publisherIdentity),
    ]
      .join("\n")
      .toLowerCase()
    if (!hay.includes(s)) return false
  }
  return true
}

function contributesToBasis(fact: InvestmentCutFact, basis: "billing" | "delivery"): boolean {
  if (fact.basis !== basis) return false
  if (basis === "delivery" && fact.component === "media" && fact.clientPaysForMedia) {
    return false
  }
  return true
}

function emptyTotals(measures: InvestmentCutMeasure[]): Record<InvestmentCutMeasure, number> {
  const t = {} as Record<InvestmentCutMeasure, number>
  for (const m of INVESTMENT_CUT_MEASURES) t[m] = 0
  for (const m of measures) t[m] = 0
  return t
}

function addMeasures(
  target: Partial<Record<InvestmentCutMeasure, number>>,
  fact: InvestmentCutFact,
  measures: InvestmentCutMeasure[]
) {
  const media = fact.component === "media" ? fact.amountCents : 0
  const fee = fact.component === "fee" ? fact.amountCents : 0
  const adserving = fact.component === "adserving" ? fact.amountCents : 0
  const billable = media + fee + adserving
  const values: Partial<Record<InvestmentCutMeasure, number>> = {
    media_cents: media,
    fee_cents: fee,
    adserving_cents: adserving,
    billable_cents: billable,
  }
  for (const m of measures) {
    target[m] = (target[m] ?? 0) + (values[m] ?? 0)
  }
}

function rowKey(dims: InvestmentCutDim[], fact: InvestmentCutFact): string {
  return dims.map((d) => `${d}=${JSON.stringify(dimValue(fact, d))}`).join("|")
}

function compareRows(
  a: InvestmentCutRow,
  b: InvestmentCutRow,
  dimensions: InvestmentCutDim[]
): number {
  for (const d of dimensions) {
    const av = a.dims[d]
    const bv = b.dims[d]
    if (av == null && bv == null) continue
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === "number" && typeof bv === "number") {
      if (av !== bv) return av - bv
      continue
    }
    const cmp = String(av).localeCompare(String(bv), "en")
    if (cmp !== 0) return cmp
  }
  const ab = a.measures.billable_cents ?? 0
  const bb = b.measures.billable_cents ?? 0
  if (ab !== bb) return bb - ab
  return 0
}

function feeCoverageFromFacts(
  facts: InvestmentCutFact[],
  q: InvestmentCutNormalized
): InvestmentCutResponse["coverage"]["fee"] {
  const mediaKeys = new Set<string>()
  const feeKeys = new Set<string>()
  for (const fact of facts) {
    if (fact.basis !== q.basis) continue
    if (!passesFilters(fact, q)) continue
    const mk = `${fact.mbaNumber}|${fact.lineItemId}|${monthKey(fact.month)}`
    if (fact.component === "media") mediaKeys.add(mk)
    if (fact.component === "fee") feeKeys.add(mk)
  }
  const mediaLineMonths = mediaKeys.size
  let feeLineMonths = 0
  for (const k of feeKeys) {
    if (mediaKeys.has(k)) feeLineMonths++
  }
  // Also count fee-only months toward feeLineMonths numerator? Spec: coverage of fee
  // relative to media months. Use intersection / media.
  const coveragePct =
    mediaLineMonths === 0 ? 100 : Math.round((feeLineMonths / mediaLineMonths) * 1000) / 10
  return {
    mediaLineMonths,
    feeLineMonths,
    coveragePct,
    caveat: FEE_COVERAGE_CAVEAT,
  }
}

/**
 * Aggregate fixture facts with cut semantics (single basis; never mixes).
 */
export function aggregateInvestmentCut(
  facts: InvestmentCutFact[],
  q: InvestmentCutNormalized,
  opts?: { rowCap?: number }
): InvestmentCutResponse {
  const rowCap = opts?.rowCap ?? INVESTMENT_CUT_ROW_CAP
  const measures = q.measures.length ? q.measures : [...INVESTMENT_CUT_MEASURES]
  const dimensions = q.dimensions
  const totals = emptyTotals(measures)
  const bucket = new Map<string, InvestmentCutRow>()

  let billableTotal = 0
  let billableMatched = 0
  let lineDetailCents = 0
  let campaignLevelCents = 0

  for (const fact of facts) {
    if (!contributesToBasis(fact, q.basis)) continue
    if (!passesFilters(fact, q)) continue

    addMeasures(totals, fact, measures)

    const media = fact.component === "media" ? fact.amountCents : 0
    const fee = fact.component === "fee" ? fact.amountCents : 0
    const adserving = fact.component === "adserving" ? fact.amountCents : 0
    const billable = media + fee + adserving
    billableTotal += billable
    if (String(fact.publisherIdentity ?? "").trim()) billableMatched += billable
    if (isServiceLineItemId(fact.lineItemId)) campaignLevelCents += billable
    else lineDetailCents += billable

    const key = rowKey(dimensions, fact)
    let row = bucket.get(key)
    if (!row) {
      const dims: InvestmentCutRow["dims"] = {}
      for (const d of dimensions) dims[d] = dimValue(fact, d)
      row = { dims, measures: {} }
      bucket.set(key, row)
    }
    addMeasures(row.measures, fact, measures)
  }

  const sorted = [...bucket.values()].sort((a, b) => compareRows(a, b, dimensions))
  const truncated = sorted.length > rowCap
  const rows = truncated ? sorted.slice(0, rowCap) : sorted

  const wantsFeeMeta =
    measures.includes("fee_cents") || measures.includes("billable_cents")

  const scope = `FY${q.fy} · ${q.from}→${q.to} · basis=${q.basis}${
    q.filters.clients.length ? ` · ${q.filters.clients.length} clients` : " · all clients"
  }`

  return {
    scope: {
      fy: q.fy,
      from: q.from,
      to: q.to,
      basis: q.basis,
      dimensions,
      measures,
      filters: q.filters,
    },
    rows,
    totals,
    coverage: {
      publisherMatchedPct:
        billableTotal === 0
          ? 100
          : Math.round((billableMatched / billableTotal) * 1000) / 10,
      lineDetailPct:
        billableTotal === 0
          ? 100
          : Math.round((lineDetailCents / billableTotal) * 1000) / 10,
      lineDetailCents,
      campaignLevelCents,
      lineDetailNote: LINE_DETAIL_COVERAGE_NOTE,
      rowCount: rows.length,
      scope,
      basis: q.basis,
      ...(wantsFeeMeta ? { fee: feeCoverageFromFacts(facts, q) } : {}),
    },
    truncated,
    rowCap,
  }
}

/** FN3a single-number summary from the same facts (recon helper). */
export function fn3aBillableTotalCents(
  facts: InvestmentCutFact[],
  basis: "billing" | "delivery"
): number {
  let sum = 0
  for (const fact of facts) {
    if (!contributesToBasis(fact, basis)) continue
    sum += fact.amountCents
  }
  return sum
}
