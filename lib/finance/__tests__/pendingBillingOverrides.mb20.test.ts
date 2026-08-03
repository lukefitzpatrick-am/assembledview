import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import {
  buildPendingBillingOverrideRows,
  cloneLineOverrideMetaMap,
  mergePendingOverSavedOverrideRows,
  removeLineFromPendingBillingOverrideRows,
  resolveBillingOverrideRowsForModal,
} from "../pendingBillingOverrides.js"
import {
  assertMbaBillingModalMonthsAgree,
  collectMbaBillingModalMonthAgreement,
  resolveMbaBillingModalState,
} from "../resolveMbaBillingModalState.js"
import type { LineOverrideMeta } from "../manualBillingOverridesUi.js"

function searchLine(overrides?: Partial<LineItemInput>): LineItemInput {
  return {
    lineItemId: "supabase001PB1",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 20_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 25,
    bursts: [
      {
        startDate: "2026-08-01",
        endDate: "2026-09-30",
        budget: 20_000,
      },
    ],
    approval: "approved",
    ...overrides,
  }
}

function prebillDraftMonths(): BillingMonth[] {
  return [
    {
      monthYear: "August 2026",
      mediaTotal: "$20,000.00",
      feeTotal: "$5,000.00",
      totalAmount: "$25,000.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: { search: "$20,000.00" } as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "billing-search::supabase001PB1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "August 2026": 20_000, "September 2026": 0 },
            feeMonthlyAmounts: { "August 2026": 5000, "September 2026": 0 },
            totalAmount: 20_000,
            billingMode: "manual",
            preBill: true,
          },
        ],
      },
    },
    {
      monthYear: "September 2026",
      mediaTotal: "$0.00",
      feeTotal: "$0.00",
      totalAmount: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: { search: "$0.00" } as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "billing-search::supabase001PB1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "August 2026": 20_000, "September 2026": 0 },
            feeMonthlyAmounts: { "August 2026": 5000, "September 2026": 0 },
            totalAmount: 20_000,
            billingMode: "manual",
            preBill: true,
          },
        ],
      },
    },
  ]
}

type Session = {
  pendingBillingOverrideRows: ReturnType<typeof buildPendingBillingOverrideRows>
  pendingMeta: Map<string, LineOverrideMeta[]>
  draftReady: boolean
  draftMonths: BillingMonth[]
  /** DB / optimistic table rows — intentionally empty in reopen tests. */
  billingOverrideRowsForPanels: ReturnType<typeof buildPendingBillingOverrideRows>
}

function emptySession(): Session {
  return {
    pendingBillingOverrideRows: [],
    pendingMeta: new Map(),
    draftReady: false,
    draftMonths: [],
    billingOverrideRowsForPanels: [],
  }
}

/** Apply: promote draft → pending (layerDraftMonthsOntoOverrideRows) + keep working months aside. */
function applyPending(session: Session, draft: BillingMonth[], meta: Map<string, LineOverrideMeta[]>): Session {
  return {
    ...session,
    pendingBillingOverrideRows: buildPendingBillingOverrideRows(draft, meta),
    pendingMeta: cloneLineOverrideMetaMap(meta),
    draftReady: true,
    draftMonths: draft,
  }
}

/**
 * Done (timing): tear down draft session, keep pending.
 * Distinct from Cancel — pending survives so reopen does not need a refetch.
 */
function closeTimingDraftKeepingPending(session: Session): Session {
  return {
    ...session,
    draftReady: false,
    draftMonths: [],
  }
}

/** Cancel / X / Escape: discard draft + pending — nothing retained. */
function cancelBillingSession(session: Session): Session {
  return {
    ...session,
    pendingBillingOverrideRows: [],
    pendingMeta: new Map(),
    draftReady: false,
    draftMonths: [],
  }
}

/** Reopen timing: draft closed; resolve reads pending via precedence helper (no refetch). */
function resolveFromSession(session: Session) {
  const overrideRows = resolveBillingOverrideRowsForModal(
    session.pendingBillingOverrideRows,
    session.billingOverrideRowsForPanels
  )
  return resolveMbaBillingModalState({
    lineItems: [searchLine()],
    feeLoading: { feesearch: 25 },
    overrideRows,
    draftReady: session.draftReady,
    draftMonths: session.draftMonths,
    metaByLine: session.pendingMeta,
    campaignStart: new Date("2026-08-01"),
    campaignEnd: new Date("2026-09-30"),
  })
}

test("MB-20: precedence — pending (unsaved) > table (saved) > computed auto", () => {
  const pending = buildPendingBillingOverrideRows(prebillDraftMonths())
  assert.ok(pending.length > 0)

  const table = [
    {
      line_item_id: "supabase001PB1",
      component: "media" as const,
      mode: "manual" as const,
      reason: "manual" as const,
      date_basis: "table",
      months: [
        { month: "2026-08", amount: 1 },
        { month: "2026-09", amount: 19_999 },
      ],
    },
  ]

  const fromPending = resolveBillingOverrideRowsForModal(pending, table)
  assert.equal(fromPending, pending)
  const firstMonth = fromPending[0]!.months![0]
  assert.ok(typeof firstMonth === "object" && firstMonth !== null)
  assert.equal((firstMonth as { amount: number }).amount, 20_000)

  const fromTable = resolveBillingOverrideRowsForModal([], table)
  assert.equal(fromTable, table)

  const fromEmpty = resolveBillingOverrideRowsForModal([], [])
  assert.deepEqual(fromEmpty, [])
})

test("MB-20: Apply then close then reopen — months come from pending, not table refetch", () => {
  const draft = prebillDraftMonths()
  const meta = new Map<string, LineOverrideMeta[]>([
    [
      "supabase001PB1",
      [{ mode: "manual", reason: "prepayment", dateBasis: "basis", component: "media" }],
    ],
  ])

  let session = emptySession()
  session = applyPending(session, draft, meta)
  assert.ok(session.pendingBillingOverrideRows.length > 0)

  // Done: draft gone; pending retained. Table stays empty (no refetch).
  session = closeTimingDraftKeepingPending(session)
  assert.equal(session.draftReady, false)
  assert.equal(session.draftMonths.length, 0)
  assert.ok(session.pendingBillingOverrideRows.length > 0)
  assert.equal(session.billingOverrideRowsForPanels.length, 0)

  const state = resolveFromSession(session)
  assert.equal(state.viewReady, true)
  assert.equal(state.draftSessionActive, false)
  // Schedule driven by pending override rows (zero DB rows).
  assert.ok(state.financials.billingSchedule.length > 0)
  const aug = state.financials.billingSchedule.find((m) => m.monthYear === "August 2026")
  const sep = state.financials.billingSchedule.find((m) => m.monthYear === "September 2026")
  assert.ok(aug)
  assert.ok(sep)
  // Prebill shape: all media in August.
  const augMedia = Number(String(aug!.mediaTotal).replace(/[^0-9.-]/g, "")) || 0
  const sepMedia = Number(String(sep!.mediaTotal).replace(/[^0-9.-]/g, "")) || 0
  assert.ok(augMedia > 15_000, `expected prepaid August media, got ${augMedia}`)
  assert.ok(sepMedia < 5_000, `expected near-zero September media, got ${sepMedia}`)

  // Prove source was pending, not table.
  assert.equal(
    resolveBillingOverrideRowsForModal(
      session.pendingBillingOverrideRows,
      session.billingOverrideRowsForPanels
    ),
    session.pendingBillingOverrideRows
  )
})

test("MB-20: Cancel — nothing retained in pending or draft", () => {
  const draft = prebillDraftMonths()
  const meta = new Map<string, LineOverrideMeta[]>([
    [
      "supabase001PB1",
      [{ mode: "manual", reason: "prepayment", dateBasis: "basis", component: "media" }],
    ],
  ])

  let session = applyPending(emptySession(), draft, meta)
  session = cancelBillingSession(session)

  assert.equal(session.pendingBillingOverrideRows.length, 0)
  assert.equal(session.pendingMeta.size, 0)
  assert.equal(session.draftReady, false)
  assert.equal(session.draftMonths.length, 0)

  const state = resolveFromSession(session)
  // No pending, no table → computed auto (split across months), not prepaid.
  assert.equal(state.viewReady, true)
  const aug = state.financials.billingSchedule.find((m) => m.monthYear === "August 2026")
  const sep = state.financials.billingSchedule.find((m) => m.monthYear === "September 2026")
  const augMedia = Number(String(aug?.mediaTotal ?? "0").replace(/[^0-9.-]/g, "")) || 0
  const sepMedia = Number(String(sep?.mediaTotal ?? "0").replace(/[^0-9.-]/g, "")) || 0
  assert.ok(augMedia > 0 && sepMedia > 0, "auto delivery splits across both months")
})

test("MB-20: MB-7 left/right agreement holds with pending rows and zero DB rows", () => {
  const draft = prebillDraftMonths()
  const pending = buildPendingBillingOverrideRows(draft)
  assert.ok(pending.length > 0)

  const state = resolveMbaBillingModalState({
    lineItems: [searchLine()],
    feeLoading: { feesearch: 25 },
    overrideRows: resolveBillingOverrideRowsForModal(pending, []),
    draftReady: true,
    draftMonths: draft,
    campaignStart: new Date("2026-08-01"),
    campaignEnd: new Date("2026-09-30"),
  })

  assert.doesNotThrow(() => assertMbaBillingModalMonthsAgree(state, "MB-20 pending"))
  for (const pair of collectMbaBillingModalMonthAgreement(state)) {
    assert.ok(
      Math.abs(pair.delta) <= 0.01,
      `${pair.monthYear}: left ${pair.leftMedia} ≠ right ${pair.rightMedia}`
    )
  }
  assert.equal(state.financials.billingSchedule, state.resolvedMonths)
})

test("MB-20: Reset to auto removes line from pending carrier", () => {
  const pending = buildPendingBillingOverrideRows(prebillDraftMonths())
  assert.ok(pending.some((r) => String(r.line_item_id).includes("supabase001PB1")))
  const next = removeLineFromPendingBillingOverrideRows(pending, "billing-search::supabase001PB1")
  assert.equal(
    next.filter((r) => String(r.line_item_id ?? "").includes("supabase001PB1")).length,
    0
  )
})

test("MB-22: mergePendingOverSavedOverrideRows — pending replaces line, keeps other saved", () => {
  const saved = [
    {
      line_item_id: "LINE-A",
      component: "media" as const,
      mode: "manual",
      months: [{ month: "2026-05", amount: 100 }],
      date_basis: "saved-a",
    },
    {
      line_item_id: "LINE-B",
      component: "media" as const,
      mode: "manual",
      months: [{ month: "2026-05", amount: 500 }],
      date_basis: "saved-b",
    },
  ]
  const pending = [
    {
      line_item_id: "LINE-A",
      component: "media" as const,
      mode: "manual",
      months: [{ month: "2026-05", amount: 100 }],
      date_basis: "pending-a",
    },
  ]
  const merged = mergePendingOverSavedOverrideRows(pending, saved)
  assert.equal(merged.length, 2)
  const a = merged.find((r) => r.line_item_id === "LINE-A")
  const b = merged.find((r) => r.line_item_id === "LINE-B")
  assert.equal(a?.date_basis, "pending-a")
  assert.equal(b?.date_basis, "saved-b")
  assert.deepEqual(mergePendingOverSavedOverrideRows([], saved), saved)
})
