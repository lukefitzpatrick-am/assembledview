/**
 * AV-1 / IG-10 — loading ingest lines into a channel the plan does not have
 * enables the form flag, hydrates the container, and names that in the note.
 * Partial MBA loads union the new billing-stable ids so they resolve approved.
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  applyIngestLineItemsLoad,
  formatIngestLoadNote,
  INGEST_CHANNEL_FLAG,
  nextPartialMbaSelectionAfterIngestLoad,
} from "../applyIngestLineItemsLoad.js"
import {
  buildEditorLineItemInputs,
  editorBillingStableLineItemId,
  resolveApproval,
} from "@/lib/finance/buildEditorLineItemInputs"
import type { SeedLineFeesMediaConfig } from "@/lib/billing/seedLineFees"

const OOH_ROWS = Array.from({ length: 95 }, (_, i) => ({
  id: `ooh-${i + 1}`,
  publisher: "JCDecaux",
}))
const RADIO_ROWS = Array.from({ length: 3 }, (_, i) => ({ id: `radio-${i + 1}` }))

function harness(enabled: { ooh: boolean; radio: boolean }) {
  let oohHydration: Record<string, unknown>[] = []
  let radioHydration: Record<string, unknown>[] = []
  let oohMedia: Record<string, unknown>[] = []
  let radioMedia: Record<string, unknown>[] = []
  let oohOn = enabled.ooh
  let radioOn = enabled.radio
  const flagWrites: Array<{ flag: string; value: boolean }> = []
  let dirty = false
  const scrolled: string[] = []
  let selected: Record<string, string[]> = { radio: ["billing-radio::keep"] }
  return {
    get oohOn() {
      return oohOn
    },
    get radioOn() {
      return radioOn
    },
    flagWrites,
    get oohHydration() {
      return oohHydration
    },
    get oohMedia() {
      return oohMedia
    },
    get radioHydration() {
      return radioHydration
    },
    get radioMedia() {
      return radioMedia
    },
    get dirty() {
      return dirty
    },
    scrolled,
    get selected() {
      return selected
    },
    apply(
      channel: "radio" | "ooh",
      items: Record<string, unknown>[],
      replace = true,
      opts?: { isPartialMBA?: boolean },
    ) {
      const channelEnabled = channel === "ooh" ? oohOn : radioOn
      return applyIngestLineItemsLoad({
        channel,
        items,
        replace,
        channelEnabled,
        enableChannel: () => {
          const flag = INGEST_CHANNEL_FLAG[channel]
          flagWrites.push({ flag, value: true })
          if (channel === "ooh") oohOn = true
          else radioOn = true
        },
        setHydrationItems: (updater) => {
          if (channel === "ooh") oohHydration = updater(oohHydration)
          else radioHydration = updater(radioHydration)
        },
        setMediaItems: (updater) => {
          if (channel === "ooh") oohMedia = updater(oohMedia)
          else radioMedia = updater(radioMedia)
        },
        markDirty: () => {
          dirty = true
        },
        scrollToSection: (sectionId) => {
          scrolled.push(sectionId)
        },
        isPartialMBA: opts?.isPartialMBA,
        setPartialMBASelectedLineItemIds: (next) => {
          selected = typeof next === "function" ? next(selected) : next
        },
      })
    },
  }
}

test("formatIngestLoadNote names publisher and all-in scope", () => {
  assert.equal(
    formatIngestLoadNote({
      count: 95,
      label: "OOH",
      publisherName: "JCDecaux",
    }),
    "95 lines loaded from JCDecaux, all in scope",
  )
  assert.equal(
    formatIngestLoadNote({ count: 1, label: "Radio", publisherName: "SCA" }),
    "1 line loaded from SCA, all in scope",
  )
  assert.equal(
    formatIngestLoadNote({ count: 3, label: "Radio" }),
    "3 lines loaded from Radio, all in scope",
  )
})

test("mp_ooh false + load OOH enables the flag, hydrates 95 rows, and marks dirty", () => {
  const h = harness({ ooh: false, radio: true })
  const note = h.apply("ooh", OOH_ROWS)
  assert.deepEqual(h.flagWrites, [{ flag: "mp_ooh", value: true }])
  assert.equal(h.oohOn, true)
  assert.equal(h.oohHydration.length, 95)
  assert.equal(h.oohMedia.length, 95)
  assert.equal(h.dirty, true)
  assert.deepEqual(h.scrolled, [`media-section-${INGEST_CHANNEL_FLAG.ooh}`])
  assert.equal(note, "95 lines loaded from JCDecaux, all in scope")
  assert.equal(h.selected.ooh, undefined)
})

test("mp_radio already true + load radio does not write the flag", () => {
  const h = harness({ ooh: false, radio: true })
  const note = h.apply("radio", RADIO_ROWS)
  assert.deepEqual(h.flagWrites, [])
  assert.equal(h.radioOn, true)
  assert.equal(h.radioMedia.length, 3)
  assert.equal(h.radioHydration.length, 3)
  assert.equal(h.dirty, true)
  assert.deepEqual(h.scrolled, [`media-section-${INGEST_CHANNEL_FLAG.radio}`])
  assert.equal(note.includes("turned Radio on"), false)
  assert.equal(note, "3 lines loaded from Radio, all in scope")
})

test("Partial MBA load unions ingest ids so every loaded line resolves approved", () => {
  const h = harness({ ooh: false, radio: true })
  h.apply("ooh", OOH_ROWS, true, { isPartialMBA: true })
  const oohIds = h.selected.ooh ?? []
  assert.equal(oohIds.length, 95)
  assert.equal(h.selected.radio?.[0], "keep")
  for (const [i, item] of h.oohMedia.entries()) {
    const id = editorBillingStableLineItemId("ooh", item, i)
    assert.equal(
      resolveApproval("ooh", id, {
        isPartialMBA: true,
        partialMBASelectedLineItemIds: h.selected,
      }),
      "approved",
    )
  }
  const configs: SeedLineFeesMediaConfig[] = [
    { billingKey: "ooh", lineItems: h.oohMedia, containerBursts: [] },
  ]
  const inputs = buildEditorLineItemInputs(configs, {
    isPartialMBA: true,
    partialMBASelectedLineItemIds: h.selected,
  })
  assert.equal(inputs.length, 95)
  assert.equal(inputs.every((line) => line.approval === "approved"), true)
})

test("nextPartialMbaSelectionAfterIngestLoad fills an emptied channel", () => {
  const items = [{ id: "n1" }, { id: "n2" }]
  const next = nextPartialMbaSelectionAfterIngestLoad({
    selected: { ooh: [] },
    channel: "ooh",
    nextItems: items,
  })
  assert.deepEqual(next.ooh, ["n1", "n2"])
  assert.equal(
    resolveApproval("ooh", editorBillingStableLineItemId("ooh", items[0], 0), {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: next,
    }),
    "approved"
  )
})
