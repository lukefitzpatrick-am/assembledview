import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

import {
  commitManualBillingDraft,
  resolveManualBillingCancel,
} from "@/lib/billing/manualBillingTransitions"
import { applyBillingLineMode } from "@/lib/billing/applyBillingLineMode"
import {
  MBA_NUMBER_BLANK_BILLING_MESSAGE,
  PLACEHOLDER_LINE_ID_BILLING_MESSAGE,
  manualBillingLineIdBlockReason,
  rekeyCreateManualBillingStateForMba,
  rekeyLineIdForMba,
  rekeyLineInputsForMba,
  rekeyOverrideRowsForMba,
} from "@/lib/billing/rekeyManualBillingForMba"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { attachOverridesToLineInputs } from "@/lib/finance/billingOverrides"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import {
  applyLineFeePrebillToMonths,
  applyLinePrebillToMonths,
  upsertLineOverrideMeta,
  type LineOverrideMeta,
} from "@/lib/finance/manualBillingOverridesUi"
import { buildSavePlanLineItemsFromSnapshots } from "@/lib/mediaplan/buildPostgresSavePayload"

/**
 * B2a fix (1 Nov 2026): create's Cancel is one function; Apply and Prebill are
 * refused while a line id would not reach the save; an MBA number change moves
 * the applied timing to the re-minted line ids (or clears it with a warning).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const MONTHS = ["October 2026", "November 2026", "December 2026"]
const OLD = "abc001"
const NEW = "abc002"

function blankCosts(): BillingMonth["mediaCosts"] {
  const keys = [
    "search", "socialMedia", "television", "radio", "newspaper", "magazines", "ooh",
    "cinema", "digiDisplay", "digiAudio", "digiVideo", "bvod", "integration",
    "progDisplay", "progVideo", "progBvod", "progAudio", "progOoh", "influencers",
    "production",
  ]
  return Object.fromEntries(keys.map((k) => [k, "$0.00"])) as BillingMonth["mediaCosts"]
}

/** Create editor months: search lines SE1 (prebill) and SE2 (typed), auto 4,000 / 400 a month. */
function editorMonths(mba: string): BillingMonth[] {
  const line = (n: number): BillingLineItem => ({
    id: `billing-search::${mba}SE${n}`,
    header1: "Google",
    header2: `Line ${n}`,
    monthlyAmounts: Object.fromEntries(MONTHS.map((m) => [m, 4000])),
    totalAmount: 12000,
    feeMonthlyAmounts: Object.fromEntries(MONTHS.map((m) => [m, 400])),
    totalFeeAmount: 1200,
    billingMode: "auto",
    feeBillingMode: "auto",
  })
  return MONTHS.map(
    (monthYear) =>
      ({
        monthYear,
        mediaTotal: "$0.00",
        feeTotal: "$0.00",
        totalAmount: "$0.00",
        adservingTechFees: "$0.00",
        production: "$0.00",
        mediaCosts: blankCosts(),
        lineItems: { search: [line(1), line(2)] },
      }) as unknown as BillingMonth,
  )
}

/** What the create page does for Prebill "media and fee" on SE1 and typed timing on SE2. */
function createStyleDraft(mba: string): { months: BillingMonth[]; meta: Map<string, LineOverrideMeta[]> } {
  const meta = new Map<string, LineOverrideMeta[]>()
  const se1 = `billing-search::${mba}SE1`
  const se2 = `billing-search::${mba}SE2`
  let months = editorMonths(mba)
  applyLinePrebillToMonths(months, "search", se1, 12000)
  applyLineFeePrebillToMonths(months, "search", se1, 1200)
  months = applyBillingLineMode(months, se1, "manual")
  for (const m of months) {
    for (const li of m.lineItems!.search!) if (li.id === se1) li.feeBillingMode = "manual"
  }
  upsertLineOverrideMeta(meta, se1, { mode: "manual", reason: "prepayment", dateBasis: "", component: "media" })
  upsertLineOverrideMeta(meta, se1, { mode: "manual", reason: "prepayment", dateBasis: "", component: "fee" })
  // Typed timing on SE2: Oct 8,000 / Nov 4,000 / Dec 0.
  const typed: Record<string, number> = { "October 2026": 8000, "November 2026": 4000, "December 2026": 0 }
  for (const m of months) {
    for (const li of m.lineItems!.search!) {
      if (li.id !== se2) continue
      li.monthlyAmounts = { ...typed }
    }
  }
  months = applyBillingLineMode(months, se2, "manual")
  return { months, meta }
}

function lineInput(mba: string, n: number): LineItemInput {
  return {
    lineItemId: `billing-search::${mba}SE${n}`,
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 12000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    bursts: [],
    approval: "approved",
  }
}

function snapshot(mba: string, n: number) {
  return {
    line_item_id: `${mba}SE${n}`,
    line_item: n,
    platform: "Google",
    buy_type: "cpc",
    bursts: [{ startDate: "2026-10-01", endDate: "2026-12-31", budget: "12000", buyAmount: "1" }],
  }
}

function saveLines(snapshotMba: string, lines: LineItemInput[]) {
  return buildSavePlanLineItemsFromSnapshots({
    search: [snapshot(snapshotMba, 1), snapshot(snapshotMba, 2)],
  }, lines)
}

function amounts(months: Array<{ month: string; amount: number }> | undefined) {
  return (months ?? []).map((m) => [m.month, m.amount])
}

describe("B2a fix item 3: Apply and Prebill refused while a line id would not save", () => {
  it("blank MBA number blocks; placeholder new-N blocks; real ids pass", () => {
    assert.equal(manualBillingLineIdBlockReason("", ["billing-search::SESE1"]), MBA_NUMBER_BLANK_BILLING_MESSAGE)
    assert.equal(manualBillingLineIdBlockReason("  ", []), MBA_NUMBER_BLANK_BILLING_MESSAGE)
    assert.equal(
      manualBillingLineIdBlockReason(OLD, ["billing-search::abc001SE1", "billing-search::new-0"]),
      PLACEHOLDER_LINE_ID_BILLING_MESSAGE,
    )
    assert.equal(manualBillingLineIdBlockReason(OLD, ["new-3"]), PLACEHOLDER_LINE_ID_BILLING_MESSAGE)
    assert.equal(manualBillingLineIdBlockReason(OLD, ["billing-search::abc001SE1"]), null)
  })

  it("a placeholder line's timing is dropped by the save (why Apply is refused)", () => {
    const rows = commitManualBillingDraft(
      editorMonths(OLD).map((m) => {
        const c = JSON.parse(JSON.stringify(m)) as BillingMonth
        c.lineItems!.search![0]!.id = "billing-search::new-0"
        c.lineItems!.search![0]!.billingMode = "manual"
        return c
      }),
      new Map(),
    ).pendingRows
    assert.equal(rows.length, 1)
    const lines = attachOverridesToLineInputs(
      [{ ...lineInput(OLD, 1), lineItemId: "billing-search::new-0" }, lineInput(OLD, 2)],
      rows,
    )
    const out = saveLines(OLD, lines)
    assert.ok(out.every((l) => l.billingOverride == null), "no save line carries the placeholder's timing")
  })
})

describe("B2a fix item 3: line ids move from the old MBA number to the new one", () => {
  it("bare, decorated, already moved, placeholder, production code, foreign id", () => {
    assert.equal(rekeyLineIdForMba("abc001SE1", OLD, NEW), "abc002SE1")
    assert.equal(rekeyLineIdForMba("billing-search::abc001SE12", OLD, NEW), "billing-search::abc002SE12")
    assert.equal(rekeyLineIdForMba("billing-search::abc002SE1", OLD, NEW), "billing-search::abc002SE1")
    assert.equal(rekeyLineIdForMba("billing-production::abc001PROD3", OLD, NEW), "billing-production::abc002PROD3")
    assert.equal(rekeyLineIdForMba("billing-search::new-0", OLD, NEW), "billing-search::new-0")
    assert.equal(rekeyLineIdForMba("xyz009SE1", OLD, NEW), null, "another plan's id")
    assert.equal(rekeyLineIdForMba("abc001ZZ1", OLD, NEW), null, "unknown media code")
    assert.equal(rekeyLineIdForMba("abc001SE1", OLD, ""), null)
  })

  it("override rows: all move, or null so the page clears and warns", () => {
    const rows = [
      { line_item_id: "abc001SE1", component: "media" },
      { lineItemId: "billing-search::abc001SE2", component: "fee" },
    ]
    assert.deepEqual(rekeyOverrideRowsForMba(rows, OLD, NEW), [
      { line_item_id: "abc002SE1", component: "media" },
      { lineItemId: "billing-search::abc002SE2", component: "fee" },
    ])
    assert.equal(rekeyOverrideRowsForMba([...rows, { line_item_id: "zzz1" }], OLD, NEW), null)
  })
})

describe("B2a fix item 4: create-style Apply rows reach the matching save line", () => {
  const draft = createStyleDraft(OLD)
  const committed = commitManualBillingDraft(draft.months, draft.meta)

  it("Prebill media and fee gives billingOverride and feeOverride; typed timing gives billingOverride", () => {
    const lines = attachOverridesToLineInputs([lineInput(OLD, 1), lineInput(OLD, 2)], committed.pendingRows)
    const out = saveLines(OLD, lines)
    const se1 = out.find((l) => l.lineItemId === "abc001SE1")!
    const se2 = out.find((l) => l.lineItemId === "abc001SE2")!
    assert.equal(se1.billingOverride?.reason, "prepayment")
    assert.deepEqual(amounts(se1.billingOverride?.months), [["2026-10", 12000], ["2026-11", 0], ["2026-12", 0]])
    assert.ok(se1.feeOverride, "fee timing rides the save line")
    assert.deepEqual(amounts(se1.feeOverride?.months), [["2026-10", 1200], ["2026-11", 0], ["2026-12", 0]])
    assert.deepEqual(amounts(se2.billingOverride?.months), [["2026-10", 8000], ["2026-11", 4000], ["2026-12", 0]])
    assert.equal(se2.feeOverride, undefined)
  })

  it("without a re-key a renamed MBA drops every override (the bug)", () => {
    const lines = attachOverridesToLineInputs([lineInput(NEW, 1), lineInput(NEW, 2)], committed.pendingRows)
    const out = saveLines(NEW, lines)
    assert.ok(out.every((l) => !l.billingOverride && !l.feeOverride))
  })

  it("state re-key: renamed MBA keeps media and fee timing on the re-minted lines", () => {
    const moved = rekeyCreateManualBillingStateForMba(
      {
        pendingRows: committed.pendingRows,
        draftMonths: committed.appliedMonths,
        meta: draft.meta,
        applied: { months: committed.appliedMonths, meta: committed.metaSnapshot },
        autoReferenceMonths: editorMonths(OLD),
      },
      OLD,
      NEW,
    )
    assert.ok(moved)
    const lines = attachOverridesToLineInputs([lineInput(NEW, 1), lineInput(NEW, 2)], moved!.pendingRows)
    const out = saveLines(NEW, lines)
    const se1 = out.find((l) => l.lineItemId === "abc002SE1")!
    const se2 = out.find((l) => l.lineItemId === "abc002SE2")!
    assert.deepEqual(amounts(se1.billingOverride?.months), [["2026-10", 12000], ["2026-11", 0], ["2026-12", 0]])
    assert.deepEqual(amounts(se1.feeOverride?.months), [["2026-10", 1200], ["2026-11", 0], ["2026-12", 0]])
    assert.deepEqual(amounts(se2.billingOverride?.months), [["2026-10", 8000], ["2026-11", 4000], ["2026-12", 0]])
    // Every carrier moved, and a fresh Apply on the moved draft gives the same rows.
    assert.ok([...moved!.meta.keys()].every((k) => k.includes(NEW)))
    assert.ok([...moved!.applied!.meta.keys()].every((k) => k.includes(NEW)))
    const reapplied = commitManualBillingDraft(moved!.draftMonths, moved!.meta).pendingRows
    assert.deepEqual(reapplied, moved!.pendingRows)
    assert.ok(
      moved!.autoReferenceMonths.every((m) => m.lineItems!.search!.every((li) => li.id.includes(NEW))),
    )
  })

  it("save-time re-key: the retry closure's stale lines land on the new save lines", () => {
    const stale = attachOverridesToLineInputs([lineInput(OLD, 1), lineInput(OLD, 2)], committed.pendingRows)
    const moved = rekeyLineInputsForMba(stale, OLD, NEW)
    assert.ok(moved)
    const out = saveLines(NEW, moved!)
    assert.equal(out.find((l) => l.lineItemId === "abc002SE1")!.billingOverride?.reason, "prepayment")
    assert.ok(out.find((l) => l.lineItemId === "abc002SE1")!.feeOverride)
    assert.ok(out.find((l) => l.lineItemId === "abc002SE2")!.billingOverride)
    // Idempotent once the page has re-rendered with the new ids.
    assert.deepEqual(rekeyLineInputsForMba(moved!, OLD, NEW), moved)
  })
})

describe("B2a fix item 1: create Cancel", () => {
  it("module: pending + applied restores a copy of the last Apply; nothing applied discards", () => {
    const meta = new Map<string, LineOverrideMeta[]>([
      ["abc001SE1", [{ mode: "manual", reason: "prepayment", dateBasis: "", component: "media" }]],
    ])
    const applied = { months: editorMonths(OLD), meta }
    const out = resolveManualBillingCancel(true, applied)
    assert.equal(out.kind, "restore_applied")
    if (out.kind !== "restore_applied") return
    assert.deepEqual(out.months, applied.months)
    assert.notEqual(out.months, applied.months)
    out.meta.get("abc001SE1")![0]!.reason = "manual"
    assert.equal(meta.get("abc001SE1")![0]!.reason, "prepayment", "meta is a copy")
    assert.deepEqual(resolveManualBillingCancel(false, applied), { kind: "discard_draft" })
    assert.deepEqual(resolveManualBillingCancel(false, null), { kind: "discard_draft" })
    assert.deepEqual(resolveManualBillingCancel(true, null), { kind: "keep" })
  })

  const create = readFileSync(join(ROOT, "app/mediaplans/create/page.tsx"), "utf8")
  const modalStart = create.indexOf("<MbaBillingModal")
  const modal = create.slice(modalStart, create.indexOf("</ManualBillingSpreadsheetProvider>", modalStart) + 2000)

  it("footer Cancel and the dialog close both go through cancelMbaBilling", () => {
    assert.match(modal, /onOpenChange=\{\(open\) => \{\s*if \(open\) setIsMbaBillingModalOpen\(true\)\s*else cancelMbaBilling\(\)/)
    assert.match(modal, /onClick=\{cancelMbaBilling\}>\s*Cancel\s*<\/Button>/)
    assert.doesNotMatch(modal, /onClick=\{\(\) => setIsMbaBillingModalOpen\(false\)\}/)
    const fn = create.slice(create.indexOf("function cancelMbaBilling("), create.indexOf("function handleManualBillingApply("))
    assert.match(fn, /resolveManualBillingCancel\(/)
    assert.match(fn, /setIsMbaBillingModalOpen\(false\)/)
  })
})

describe("B2a fix wiring: create page", () => {
  const create = readFileSync(join(ROOT, "app/mediaplans/create/page.tsx"), "utf8")
  const between = (a: string, b: string) => create.slice(create.indexOf(a), create.indexOf(b, create.indexOf(a)))

  it("Apply and both Prebill entries check the line ids first", () => {
    const apply = between("function handleManualBillingApply(", "function handlePartialMBAMonthsChange(")
    assert.ok(apply.indexOf("manualBillingLineIdBlockReason(") < apply.indexOf("commitManualBillingDraft("))
    assert.match(between("function handleManualBillingLineItemPrebill(", "function applyManualBillingPrebillScope("), /manualBillingLineIdBlockReason\(mbaNumber, \[lineItemId\]\)/)
    assert.match(between("function applyManualBillingPrebillScope(", "function handleManualBillingLineItemPreBillToggle("), /manualBillingLineIdBlockReason\(mbaNumber, \[lineItemId\]\)/)
  })

  it("an MBA number change re-keys on the retry and otherwise clears with a warning", () => {
    const effect = between("const from = appliedUnderMbaNumberRef.current", "handleResetBillingScheduleToAuto,\n  ])")
    assert.match(effect, /rekeyCreateManualBillingStateForMba\(/)
    assert.match(effect, /handleResetBillingScheduleToAuto\(\)/)
    assert.match(effect, /title: "Billing timing cleared"/)
    const retry = between("mbaNumberTakenRetriedRef.current = true", "return await handleSaveMediaPlan()")
    assert.ok(retry.indexOf("mbaNumberRenameRef.current =") < retry.indexOf('form.setValue("mba_number"'))
  })

  it("both version-save paths send the re-keyed lines", () => {
    const save = between("const handleSaveMediaPlanVersion = async (", "const omitModeBody = () =>")
    assert.match(save, /billingLineInputsForMbaNumber\(\s*billingSaveInputs\.lineItems,\s*mbaNum\s*\)/)
    assert.match(save, /buildSavePlanLineItemsFromSnapshots\(\s*snapshots,\s*billingLinesForSave,/)
    assert.match(create, /withMbaScopeLineLabels\(billingLinesForSave, mbaBillingScopeLines\)/)
  })

  it("item 5: the dead auto line snapshot ref is gone; item 6: zero rows says auto is kept", () => {
    assert.doesNotMatch(create, /manualBillingAutoLineItemSnapshotRef/)
    assert.match(create, /title: "Auto billing kept"/)
  })
})
