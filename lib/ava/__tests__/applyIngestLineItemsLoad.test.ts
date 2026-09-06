/**
 * AV-1 — loading ingest lines into a channel the plan does not have
 * enables the form flag, hydrates the container, and names that in the note.
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  applyIngestLineItemsLoad,
  formatIngestLoadNote,
  INGEST_CHANNEL_FLAG,
} from "../applyIngestLineItemsLoad.js"

const OOH_ROWS = Array.from({ length: 106 }, (_, i) => ({ id: `ooh-${i + 1}` }))
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
    apply(
      channel: "radio" | "ooh",
      items: Record<string, unknown>[],
      replace = true,
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
      })
    },
  }
}

test("formatIngestLoadNote names the channel and whether it was switched on", () => {
  assert.equal(
    formatIngestLoadNote({ count: 106, label: "OOH", turnedOn: true }),
    "Loaded 106 OOH line items into the form and turned OOH on for this plan. Nothing is saved.",
  )
  assert.equal(
    formatIngestLoadNote({ count: 106, label: "OOH", turnedOn: false }),
    "Loaded 106 OOH line items into the form. Nothing is saved.",
  )
  assert.equal(
    formatIngestLoadNote({ count: 1, label: "Radio", turnedOn: false }),
    "Loaded 1 Radio line item into the form. Nothing is saved.",
  )
})

test("mp_ooh false + load OOH enables the flag, hydrates 106 rows, and marks dirty", () => {
  const h = harness({ ooh: false, radio: true })
  const note = h.apply("ooh", OOH_ROWS)
  assert.deepEqual(h.flagWrites, [{ flag: "mp_ooh", value: true }])
  assert.equal(h.oohOn, true)
  assert.equal(h.oohHydration.length, 106)
  assert.equal(h.oohMedia.length, 106)
  assert.equal(h.dirty, true)
  assert.deepEqual(h.scrolled, [`media-section-${INGEST_CHANNEL_FLAG.ooh}`])
  assert.match(note, /turned OOH on for this plan/)
  assert.match(note, /Nothing is saved/)
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
  assert.match(note, /Loaded 3 Radio line items into the form\. Nothing is saved\./)
})
