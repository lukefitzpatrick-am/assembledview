import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

import {
  commitManualBillingDraft,
  resetLineToAutoTemplate,
} from "@/lib/billing/manualBillingTransitions"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { saveAndDownloadAllMode } from "@/lib/mediaplan/saveAndDownloadAllMode"
import type { LineOverrideMeta } from "@/lib/finance/manualBillingOverridesUi"

/**
 * B2a (1 Nov 2026): the create page runs edit's manual billing steps.
 * M1 Apply then Save keeps typed timing; M4 line reset resets fee timing too;
 * M5 full reset drops Prebill rows; M7 a cancelled Prebill is not saved;
 * Q7 Save and download all saves first unless the plan is unchanged.
 * The wiring block reads both page sources: it fails on the pre-B2a create page.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const LINE = "billing-search::abc001SE1"
const MONTHS = ["October 2026", "November 2026", "December 2026"]
const fmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })

function blankCosts(): BillingMonth["mediaCosts"] {
  return {
    search: "$0.00",
    socialMedia: "$0.00",
    television: "$0.00",
    radio: "$0.00",
    newspaper: "$0.00",
    magazines: "$0.00",
    ooh: "$0.00",
    cinema: "$0.00",
    digiDisplay: "$0.00",
    digiAudio: "$0.00",
    digiVideo: "$0.00",
    bvod: "$0.00",
    integration: "$0.00",
    progDisplay: "$0.00",
    progVideo: "$0.00",
    progBvod: "$0.00",
    progAudio: "$0.00",
    progOoh: "$0.00",
    influencers: "$0.00",
    production: "$0.00",
  } as BillingMonth["mediaCosts"]
}

function months(line: Partial<BillingLineItem>): BillingMonth[] {
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
        lineItems: {
          search: [
            {
              id: LINE,
              header1: "Google",
              header2: "Max conversions",
              monthlyAmounts: {},
              totalAmount: 0,
              ...line,
            } as BillingLineItem,
          ],
        },
      }) as unknown as BillingMonth,
  )
}

const auto = (n: number) => Object.fromEntries(MONTHS.map((m) => [m, n]))

function lineIn(ms: BillingMonth[]): BillingLineItem {
  return (ms[0]!.lineItems as Record<string, BillingLineItem[]>).search![0]!
}

describe("B2a M1: Apply turns typed timing into the pending rows the save sends", () => {
  it("typed Oct 8,000 / Nov 4,000 / Dec 0 becomes a media override row", () => {
    const draft = months({
      monthlyAmounts: { "October 2026": 8000, "November 2026": 4000, "December 2026": 0 },
      totalAmount: 12000,
      billingMode: "manual",
    })
    const out = commitManualBillingDraft(draft, new Map())
    assert.equal(out.pendingRows.length, 1)
    const row = out.pendingRows[0]!
    assert.equal(row.line_item_id, "abc001SE1")
    assert.equal(row.component, "media")
    const rowMonths = row.months as Array<{ month: string; amount: number }>
    assert.deepEqual(
      rowMonths.map((m) => [m.month, m.amount]),
      [
        ["2026-10", 8000],
        ["2026-11", 4000],
        ["2026-12", 0],
      ],
    )
  })

  it("carries Prebill meta into the row and snapshots without mutating inputs", () => {
    const draft = months({
      monthlyAmounts: { "October 2026": 12000, "November 2026": 0, "December 2026": 0 },
      totalAmount: 12000,
      billingMode: "manual",
    })
    const meta = new Map<string, LineOverrideMeta[]>([
      ["abc001SE1", [{ mode: "manual", reason: "prepayment", dateBasis: "", component: "media" }]],
    ])
    const before = JSON.stringify(draft)
    const out = commitManualBillingDraft(draft, meta)
    assert.equal(out.pendingRows[0]!.reason, "prepayment")
    assert.equal(JSON.stringify(draft), before, "draft months not mutated")
    assert.notEqual(out.appliedMonths, draft)
    meta.get("abc001SE1")![0]!.reason = "manual"
    assert.equal(out.metaSnapshot.get("abc001SE1")![0]!.reason, "prepayment", "meta snapshot is a copy")
  })

  it("an all-auto draft applies no rows", () => {
    const out = commitManualBillingDraft(months({ monthlyAmounts: auto(4000), totalAmount: 12000 }), new Map())
    assert.equal(out.pendingRows.length, 0)
  })
})

describe("B2a M4: line reset brings media AND fee timing back to auto", () => {
  it("resets a prebilled media-and-fee line from the current auto template", () => {
    const target = months({
      monthlyAmounts: { "October 2026": 12000, "November 2026": 0, "December 2026": 0 },
      totalAmount: 12000,
      feeMonthlyAmounts: { "October 2026": 1200, "November 2026": 0, "December 2026": 0 },
      totalFeeAmount: 1200,
      billingMode: "manual",
      feeBillingMode: "manual",
      preBill: true,
      preBillSnapshot: auto(4000),
    })
    const template = months({
      monthlyAmounts: auto(4000),
      totalAmount: 12000,
      feeMonthlyAmounts: auto(400),
      totalFeeAmount: 1200,
    })
    const out = resetLineToAutoTemplate(target, template, "search", LINE, fmt)
    assert.ok(out)
    for (const m of out!) {
      const li = (m.lineItems as Record<string, BillingLineItem[]>).search![0]!
      assert.equal(li.monthlyAmounts[m.monthYear], 4000, `media ${m.monthYear}`)
      assert.equal(li.feeMonthlyAmounts![m.monthYear], 400, `fee ${m.monthYear}`)
      assert.equal(m.mediaCosts.search, "$4,000.00")
    }
    const li = lineIn(out!)
    assert.equal(li.billingMode, "auto")
    assert.equal(li.feeBillingMode, "auto", "fee lane back to auto")
    assert.equal(li.preBill, false)
    assert.equal(li.preBillSnapshot, undefined)
  })

  it("returns null when the line is not on the template", () => {
    const target = months({ monthlyAmounts: auto(1), billingMode: "manual" })
    const template = months({ id: "billing-search::other001SE1", monthlyAmounts: auto(4000) })
    assert.equal(resetLineToAutoTemplate(target, template, "search", LINE, fmt), null)
  })
})

describe("B2a Q7: Save and download all", () => {
  it("saves first unless a published plan is unchanged", () => {
    assert.equal(saveAndDownloadAllMode({ isPublished: false, hasChanges: false }), "save_then_zip")
    assert.equal(saveAndDownloadAllMode({ isPublished: false, hasChanges: true }), "save_then_zip")
    assert.equal(saveAndDownloadAllMode({ isPublished: true, hasChanges: true }), "save_then_zip")
    assert.equal(saveAndDownloadAllMode({ isPublished: true, hasChanges: false }), "zip_stored")
  })
})

/** Body of `function name(` or `const name = …` up to the next top-level handler. */
function body(src: string, start: string): string {
  const a = src.indexOf(start)
  assert.ok(a >= 0, `missing ${start}`)
  const rest = src.slice(a + start.length)
  const ends = ["\n  function ", "\n  const ", "\n  async function "]
    .map((e) => rest.indexOf(e))
    .filter((i) => i >= 0)
  return rest.slice(0, Math.min(...ends))
}

describe("B2a wiring: create runs edit's manual billing steps", () => {
  const create = readFileSync(join(ROOT, "app/mediaplans/create/page.tsx"), "utf8")
  const edit = readFileSync(join(ROOT, "app/mediaplans/mba/[mba_number]/edit/page.tsx"), "utf8")

  it("M1: create Apply commits the draft to the pending rows", () => {
    const apply = body(create, "function handleManualBillingApply(")
    assert.match(apply, /commitManualBillingDraft\(/)
    assert.match(apply, /setDraftBillingOverrideRows\(committed\.pendingRows\)/)
    assert.match(body(edit, "async function handleManualBillingSave("), /commitManualBillingDraft\(/)
  })

  it("M7: create Prebill and un-Prebill change the draft only; Cancel restores the last Apply", () => {
    assert.doesNotMatch(body(create, "function applyManualBillingPrebillScope("), /setDraftBillingOverrideRows/)
    assert.doesNotMatch(
      body(create, "function handleManualBillingLineItemPreBillToggle("),
      /setDraftBillingOverrideRows/,
    )
    const modal = create.slice(create.indexOf("<MbaBillingModal"), create.indexOf("versionLabel=", create.indexOf("<MbaBillingModal")))
    assert.match(modal, /appliedManualBillingRef\.current/)
    assert.match(modal, /setManualBillingMonths\(restored\)/)
  })

  it("M5: create full reset drops the pending rows", () => {
    const reset = body(create, "const handleResetBillingScheduleToAuto = useCallback(")
    assert.match(reset, /setDraftBillingOverrideRows\(\[\]\)/)
  })

  it("M4: both pages reset a line through the shared helper from current auto", () => {
    const c = body(create, "function handleManualBillingLineItemResetToAuto(")
    assert.match(c, /resetLineToAutoTemplate\(/)
    assert.doesNotMatch(c, /manualBillingAutoLineItemSnapshotRef/)
    assert.match(body(edit, "const handleManualBillingLineItemResetToAuto = useCallback("), /resetLineToAutoTemplate\(/)
  })

  it("Q7: edit Save and download all uses the shared rule", () => {
    assert.match(body(edit, "const handleSaveAndDownloadAll = async ("), /saveAndDownloadAllMode\(/)
  })
})
