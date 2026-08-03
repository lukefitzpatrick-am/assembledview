/**
 * MB-7 — single resolved view for the MBA & billing modal.
 *
 * Core financials + override rows form the base; an open timing draft layers on
 * top. Both modal halves (left Adjust timing, right schedule table) read this
 * result so they cannot disagree to the cent.
 *
 * Caller supplies override rows already resolved with MB-20/MB-24 precedence:
 * pending (unsaved) > savedBillingOverrideRows (fetch-only) > computed auto.
 * Open draft layers on top for display; provenance is draft > pending > saved.
 */

import {
  draftContradictsSavedAnywhere,
  draftContradictsSavedForLine,
  pendingContradictsSavedAnywhere,
  resolveCampaignBillingTimingProvenance,
  resolveLineBillingTimingProvenance,
  pendingContradictsSavedForLine,
} from "@/lib/billing/manualBillingVocabulary"
import type { BillingMonth } from "@/lib/billing/types"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import { attachOverridesToLineInputs } from "@/lib/finance/billingOverrides"
import type {
  CampaignFinancials,
  FeeLoading,
  LineItemInput,
} from "@/lib/finance/campaignFinancials.types"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import {
  panelIndicatorsFromCampaignFinancials,
  type PanelIndicatorsFromCampaignFinancials,
} from "@/lib/finance/panelIndicatorsFromCampaignFinancials"
import {
  billingOverrideLineIdsMatch,
  extractOverrideMonthsFromSchedule,
  listManualOverrideLineIds,
  toBillingOverrideLineItemId,
  type LineOverrideMeta,
} from "@/lib/finance/manualBillingOverridesUi"
import { formatMoney, parseMoneyInput, roundMoney2 } from "@/lib/format/money"

export type ResolveMbaBillingModalStateArgs = {
  lineItems: LineItemInput[]
  feeLoading: FeeLoading
  campaignStart?: Date
  campaignEnd?: Date
  selectedMonthYears?: string[]
  /** Resolved pending∪saved override rows (or already-resolved effective rows). */
  overrideRows: BillingOverrideRow[]
  /**
   * MB-21/MB-24: raw pending carrier (Applied, unsaved). When set with
   * `tableOverrideRows`, panel indicators get draft/unsaved/saved provenance.
   * Display still uses `overrideRows` (caller applies pending > saved precedence).
   */
  pendingOverrideRows?: BillingOverrideRow[]
  /**
   * MB-24: fetch-only saved table rows for provenance (never optimistic).
   * May differ from overrideRows when pending wins.
   */
  tableOverrideRows?: BillingOverrideRow[]
  /** True while Adjust timing / Advanced draft session is open. */
  draftReady: boolean
  draftMonths: BillingMonth[]
  metaByLine?: Map<string, LineOverrideMeta[]>
  isPartialMBA?: boolean
}

export type ResolveMbaBillingModalStateResult = {
  /**
   * False when draftReady but draft months are empty (stranded session) —
   * both modal halves must render the same empty treatment.
   */
  viewReady: boolean
  /** True when the timing draft session is open (even if stranded). */
  draftSessionActive: boolean
  financials: CampaignFinancials
  panelIndicators: PanelIndicatorsFromCampaignFinancials
  /**
   * Months the left editor reads. Same array as `financials.billingSchedule`
   * when the draft session is healthy (shared reference).
   */
  resolvedMonths: BillingMonth[]
  /** Override rows after draft layering (tests / debugging). */
  effectiveOverrideRows: BillingOverrideRow[]
}

export function emptyCampaignFinancials(): CampaignFinancials {
  return {
    perLine: [],
    deliverySchedule: [],
    billingSchedule: [],
    mbaScopeTotals: {
      grossMedia: 0,
      fee: 0,
      adServing: 0,
      production: 0,
      nettExGst: 0,
      nettIncGst: 0,
    },
    deliveryVsBillingDelta: [],
    validation: { billableEqualsMba: true, deltaExGst: 0 },
    mbaFeeAdjusted: false,
    rebill_needed: false,
  }
}

function findLineMeta(
  metaByLine: Map<string, LineOverrideMeta[]> | undefined,
  lineItemId: string,
  component: "media" | "fee"
): LineOverrideMeta | undefined {
  if (!metaByLine) return undefined
  for (const [key, list] of metaByLine) {
    if (!billingOverrideLineIdsMatch(key, lineItemId)) continue
    const hit = list.find((m) => (m.component ?? "media") === component)
    if (hit) return hit
  }
  return undefined
}

function upsertOverrideRow(
  rows: BillingOverrideRow[],
  lineItemId: string,
  component: "media" | "fee",
  months: { month: string; amount: number }[],
  meta?: LineOverrideMeta
): BillingOverrideRow[] {
  const canon = toBillingOverrideLineItemId(lineItemId)
  const next = rows.filter((r) => {
    const c = String(r.component ?? "media").trim().toLowerCase() === "fee" ? "fee" : "media"
    if (c !== component) return true
    return toBillingOverrideLineItemId(String(r.line_item_id ?? r.lineItemId ?? "")) !== canon
  })
  next.push({
    line_item_id: canon,
    component,
    mode: "manual",
    reason: meta?.reason ?? "manual",
    months,
    date_basis: meta?.dateBasis ?? "",
  })
  return next
}

/**
 * Keep schedule Media/Fee/Total headers aligned with line monthly maps.
 * Draft overlays update line cells; headers can lag (MB-6 rebuild / mid-edit).
 */
export function syncBillingMonthHeadersFromLineItems(months: BillingMonth[]): void {
  for (const m of months) {
    let media = 0
    let feeFromLines = 0
    let sawFeeMap = false
    if (m.lineItems) {
      for (const [mediaKey, items] of Object.entries(m.lineItems)) {
        if (!Array.isArray(items)) continue
        let keyMedia = 0
        for (const line of items) {
          keyMedia += Number(line.monthlyAmounts?.[m.monthYear] ?? 0) || 0
          if (line.feeMonthlyAmounts) {
            sawFeeMap = true
            feeFromLines += Number(line.feeMonthlyAmounts[m.monthYear] ?? 0) || 0
          }
        }
        keyMedia = roundMoney2(keyMedia)
        if (mediaKey !== "production") media += keyMedia
        if (m.mediaCosts && mediaKey in (m.mediaCosts as Record<string, string>)) {
          ;(m.mediaCosts as Record<string, string>)[mediaKey] = formatMoney(keyMedia)
        }
      }
    }
    media = roundMoney2(media)
    const fee = sawFeeMap
      ? roundMoney2(feeFromLines)
      : roundMoney2(parseMoneyInput(m.feeTotal) ?? 0)
    const adserv = roundMoney2(parseMoneyInput(m.adservingTechFees) ?? 0)
    const production = roundMoney2(parseMoneyInput(m.production) ?? 0)
    m.mediaTotal = formatMoney(media)
    if (sawFeeMap) m.feeTotal = formatMoney(fee)
    m.totalAmount = formatMoney(media + fee + adserv + production)
  }
}

/** Replace/upsert override rows for every manual media/fee line in the draft. */
export function layerDraftMonthsOntoOverrideRows(
  baseRows: BillingOverrideRow[],
  draftMonths: BillingMonth[],
  metaByLine?: Map<string, LineOverrideMeta[]>
): BillingOverrideRow[] {
  if (!draftMonths.length) return baseRows
  const { media, fee } = listManualOverrideLineIds(draftMonths)
  let rows = [...baseRows]
  for (const id of media) {
    const months = extractOverrideMonthsFromSchedule(draftMonths, id, "media")
    if (!months.length) continue
    rows = upsertOverrideRow(rows, id, "media", months, findLineMeta(metaByLine, id, "media"))
  }
  for (const id of fee) {
    const months = extractOverrideMonthsFromSchedule(draftMonths, id, "fee")
    if (!months.length) continue
    rows = upsertOverrideRow(rows, id, "fee", months, findLineMeta(metaByLine, id, "fee"))
  }
  return rows
}

/**
 * Resolve one modal view: core + overrides, with open draft layered on top.
 * When the draft session is healthy, `billingSchedule` and `resolvedMonths` are
 * the same array so left inputs and right month columns cannot diverge.
 */
export function resolveMbaBillingModalState(
  args: ResolveMbaBillingModalStateArgs
): ResolveMbaBillingModalStateResult {
  const draftSessionActive = Boolean(args.draftReady)
  const draftMonths = args.draftMonths ?? []

  const pendingRows = args.pendingOverrideRows
  const tableRows = args.tableOverrideRows

  const buildProvenanceOpts = (draftRowsForProvenance?: BillingOverrideRow[]) => {
    if (pendingRows === undefined || tableRows === undefined) return {}
    const draft = draftRowsForProvenance ?? null
    return {
      timingProvenance: resolveCampaignBillingTimingProvenance(
        pendingRows,
        tableRows,
        draft
      ),
      differsFromSaved:
        (draft != null && draftContradictsSavedAnywhere(draft, tableRows)) ||
        pendingContradictsSavedAnywhere(pendingRows, tableRows),
      lineTimingProvenance: (lineItemId: string) =>
        resolveLineBillingTimingProvenance(
          lineItemId,
          pendingRows,
          tableRows,
          draft
        ),
      lineDiffersFromSaved: (lineItemId: string) =>
        (draft != null &&
          draftContradictsSavedForLine(lineItemId, draft, tableRows)) ||
        pendingContradictsSavedForLine(lineItemId, pendingRows, tableRows),
    }
  }

  // Stranded draftReady + empty months — both halves empty (MB-6 failure shape).
  if (draftSessionActive && draftMonths.length === 0) {
    const financials = emptyCampaignFinancials()
    const provenanceOpts = buildProvenanceOpts()
    return {
      viewReady: false,
      draftSessionActive,
      financials,
      panelIndicators: panelIndicatorsFromCampaignFinancials(financials, {
        isPartialMBA: args.isPartialMBA,
        selectedMonthYears: args.selectedMonthYears,
        ...provenanceOpts,
      }),
      resolvedMonths: [],
      effectiveOverrideRows: [...(args.overrideRows ?? [])],
    }
  }

  const effectiveOverrideRows =
    draftSessionActive && draftMonths.length > 0
      ? layerDraftMonthsOntoOverrideRows(
          args.overrideRows ?? [],
          draftMonths,
          args.metaByLine
        )
      : [...(args.overrideRows ?? [])]

  const lineItems = attachOverridesToLineInputs(args.lineItems, effectiveOverrideRows)
  const layered = computeCampaignFinancials(lineItems, { feeLoading: args.feeLoading }, {
    campaignStart: args.campaignStart,
    campaignEnd: args.campaignEnd,
    selectedMonthYears: args.selectedMonthYears,
  })

  // Healthy draft session: right table reads the same BillingMonth[] as the left editor.
  if (draftSessionActive && draftMonths.length > 0) {
    syncBillingMonthHeadersFromLineItems(draftMonths)
  }
  const financials: CampaignFinancials =
    draftSessionActive && draftMonths.length > 0
      ? { ...layered, billingSchedule: draftMonths }
      : layered

  const resolvedMonths = draftSessionActive ? draftMonths : []

  // MB-24: open draft rows feed provenance so Prebill-before-Apply is "not applied",
  // never "saved". Pass the layered draft rows only while the session is healthy.
  const draftRowsForProvenance =
    draftSessionActive && draftMonths.length > 0 ? effectiveOverrideRows : undefined
  const provenanceOpts = buildProvenanceOpts(draftRowsForProvenance)

  return {
    viewReady: true,
    draftSessionActive,
    financials,
    panelIndicators: panelIndicatorsFromCampaignFinancials(financials, {
      isPartialMBA: args.isPartialMBA,
      selectedMonthYears: args.selectedMonthYears,
      ...provenanceOpts,
    }),
    resolvedMonths,
    effectiveOverrideRows,
  }
}

export type MbaBillingModalMonthAgreementPair = {
  monthYear: string
  leftMedia: number
  rightMedia: number
  delta: number
}

/**
 * MB-7 invariant: left-hand line-month media sum vs right-hand schedule Media
 * column, per month. Must agree to the cent whenever both halves display money.
 */
export function collectMbaBillingModalMonthAgreement(
  state: ResolveMbaBillingModalStateResult
): MbaBillingModalMonthAgreementPair[] {
  const schedule = state.financials.billingSchedule
  const leftMonths = state.resolvedMonths

  if (!state.viewReady) {
    // Both empty — single empty pair documents the stranded/unavailable case.
    if (schedule.length === 0 && leftMonths.length === 0) return []
    return [
      {
        monthYear: "(unavailable)",
        leftMedia: leftMonths.reduce(
          (s, m) => s + (parseMoneyInput(m.mediaTotal) ?? 0),
          0
        ),
        rightMedia: schedule.reduce(
          (s, m) => s + (parseMoneyInput(m.mediaTotal) ?? 0),
          0
        ),
        delta: NaN,
      },
    ]
  }

  // Timing session closed: left inputs are not shown — agreement N/A.
  if (!state.draftSessionActive) return []

  // Shared reference → trivial agreement; still compute from headers for the invariant.
  const monthYears = new Set<string>()
  for (const m of schedule) monthYears.add(m.monthYear)
  for (const m of leftMonths) monthYears.add(m.monthYear)

  const pairs: MbaBillingModalMonthAgreementPair[] = []
  for (const monthYear of [...monthYears].sort()) {
    const leftRow = leftMonths.find((m) => m.monthYear === monthYear)
    const rightRow = schedule.find((m) => m.monthYear === monthYear)
    const leftMedia = roundMoney2(parseMoneyInput(leftRow?.mediaTotal) ?? 0)
    const rightMedia = roundMoney2(parseMoneyInput(rightRow?.mediaTotal) ?? 0)
    pairs.push({
      monthYear,
      leftMedia,
      rightMedia,
      delta: roundMoney2(leftMedia - rightMedia),
    })
  }
  return pairs
}

/**
 * MB-10 — months the fee-drift gate AND fee-sum displays must read.
 * Same selection as handleManualBillingSave (never a parallel raw-draft sum).
 */
export function monthsForMbaBillingGates(
  state: Pick<ResolveMbaBillingModalStateResult, "viewReady" | "resolvedMonths">,
  draftFallback: BillingMonth[]
): BillingMonth[] {
  if (!state.viewReady) return []
  return state.resolvedMonths.length > 0 ? state.resolvedMonths : draftFallback
}

/** Assert left/right month Media columns agree within $0.01 (MB-7 invariant). */
export function assertMbaBillingModalMonthsAgree(
  state: ResolveMbaBillingModalStateResult,
  label = "mba billing modal"
): void {
  if (!state.viewReady) {
    if (
      state.financials.billingSchedule.length !== 0 ||
      state.resolvedMonths.length !== 0
    ) {
      throw new Error(
        `${label}: viewReady=false but one half still has schedule/draft months`
      )
    }
    return
  }
  if (!state.draftSessionActive) return

  if (
    state.resolvedMonths.length > 0 &&
    state.financials.billingSchedule !== state.resolvedMonths
  ) {
    throw new Error(
      `${label}: draft session must share billingSchedule and resolvedMonths by reference`
    )
  }

  for (const pair of collectMbaBillingModalMonthAgreement(state)) {
    if (Math.abs(pair.delta) > 0.01) {
      throw new Error(
        `${label}: month ${pair.monthYear} left media ${pair.leftMedia} ≠ right ${pair.rightMedia} (Δ ${pair.delta})`
      )
    }
  }
}
