import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { createMediaPlanKpiHost } from "../kpiHost.js"
import type { CampaignKpiSaveResult } from "@/lib/kpi/saveCampaignKpis"
import type { ResolvedKPIRow } from "@/lib/kpi/types"

function row(over: Partial<ResolvedKPIRow> = {}): ResolvedKPIRow {
  return {
    mp_client_name: "Client",
    mba_number: "MBA1",
    version_number: 1,
    campaign_name: "Camp",
    media_type: "search",
    publisher: "Google",
    bid_strategy: "clicks",
    ctr: 0.01,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
    lineItemId: "MBA1SE1",
    lineItemLabel: "Line 1",
    spend: 100,
    deliverables: 1000,
    buyType: "cpc",
    source: "manual",
    isManuallyEdited: true,
    calculatedClicks: 10,
    calculatedViews: null,
    calculatedReach: null,
    ...over,
  }
}

test("createMediaPlanKpiHost.onSave only setRows when persist is omitted", async () => {
  const captured: ResolvedKPIRow[][] = []
  const host = createMediaPlanKpiHost({
    rows: [row()],
    setRows: (next) => {
      captured.push(next)
    },
    onResetSavedLayer: () => {},
  })
  const updated = [row({ ctr: 0.02 })]
  await host.onSave(updated)
  assert.equal(captured.length, 1)
  assert.equal(captured[0][0]?.ctr, 0.02)
  assert.equal(host.isSaving, false)
  assert.equal(
    host.saveNote,
    "KPIs are held with the plan and written when you save it.",
  )
})

test("createMediaPlanKpiHost.onSave awaits persist after setRows and exposes isSaving", async () => {
  const order: string[] = []
  let saving = false
  const persistCalls: ResolvedKPIRow[][] = []
  let release!: (result: CampaignKpiSaveResult) => void
  const persistGate = new Promise<CampaignKpiSaveResult>((resolve) => {
    release = resolve
  })

  const host = createMediaPlanKpiHost({
    rows: [row()],
    setRows: () => {
      order.push("setRows")
    },
    onResetSavedLayer: () => {},
    persist: async (rows) => {
      persistCalls.push(rows)
      order.push("persist-start")
      return persistGate
    },
    isSaving: saving,
    setIsSaving: (next) => {
      saving = next
      order.push(next ? "saving-true" : "saving-false")
    },
  })

  assert.equal(host.saveNote, undefined)
  const updated = [row({ ctr: 0.03 })]
  const pending = host.onSave(updated)
  await Promise.resolve()
  assert.deepEqual(order, ["setRows", "saving-true", "persist-start"])
  assert.equal(saving, true)
  assert.equal(persistCalls.length, 1)
  assert.equal(persistCalls[0][0]?.ctr, 0.03)

  release({ status: "success" })
  await pending
  assert.equal(saving, false)
  assert.ok(order.includes("saving-false"))
})

test("KPIEditModal awaits host.onSave and renders saveNote under Save KPIs", () => {
  const modalSrc = readFileSync(
    join(process.cwd(), "components/kpis/KPIEditModal.tsx"),
    "utf8",
  )
  assert.match(modalSrc, /await onSave\(editedRows\)/)
  assert.match(modalSrc, /saveNote/)
  assert.match(
    modalSrc,
    /KPIs are held with the plan and written when you save it\.|host\.saveNote|saveNote \?/,
  )
})

test("KPISection awaits host.onSave before closing the modal", () => {
  const sectionSrc = readFileSync(
    join(process.cwd(), "components/kpis/KPISection.tsx"),
    "utf8",
  )
  assert.match(sectionSrc, /await host\.onSave\(updatedRows\)/)
})
