/**
 * PC7 — estimate autosave payload size for a PENFOLD016-class campaign.
 * Synthetic: ~180 lines × 20 channels with modest burst attrs (upper bound).
 */
import { estimateDraftPayloadBytes } from "../lib/mediaplan/drafts/localStore"
import { buildPlanDraftSnapshot } from "../lib/mediaplan/drafts/buildSnapshot"

const CHANNELS = [
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "digiDisplay",
  "digiAudio",
  "digiVideo",
  "bvod",
  "integration",
  "production",
  "search",
  "socialMedia",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "influencers",
] as const

function fakeLine(i: number, channel: string) {
  return {
    line_item_id: `PENFOLD016${channel.slice(0, 3).toUpperCase()}${i}`,
    publisher: `Publisher ${i % 40}`,
    platform: "dv360",
    market: "AU",
    buy_type: "CPM",
    rate: 12.5 + (i % 7),
    entered_amount: 5000 + i * 10,
    fee_pct: 10,
    bursts: [
      {
        startDate: "2026-01-01",
        endDate: "2026-03-31",
        budget: 2500,
        mediaAmount: "2250.00",
        feeAmount: "250.00",
        deliverables: 100000 + i,
      },
      {
        startDate: "2026-04-01",
        endDate: "2026-06-30",
        budget: 2500,
        mediaAmount: "2250.00",
        feeAmount: "250.00",
        deliverables: 100000 + i,
      },
    ],
  }
}

const linesPerChannel = 9 // ~180 lines total
const channels: Record<string, unknown[]> = {}
for (const ch of CHANNELS) {
  channels[ch] = Array.from({ length: linesPerChannel }, (_, i) => fakeLine(i + 1, ch))
}

const formValues: Record<string, unknown> = {
  mp_client_name: "Penfold",
  mp_campaignname: "PENFOLD016-class",
  mp_campaignbudget: 2_400_000,
  mp_campaignstatus: "Approved",
  mp_brand: "Penfold",
  mp_clientcontact: "ops@example.com",
  mp_ponumber: "PO-016",
  mba_number: "PENFOLD016",
}
for (const ch of CHANNELS) {
  formValues[`mp_${ch.toLowerCase()}`] = true
}

const state = buildPlanDraftSnapshot({
  mbaNumber: "PENFOLD016",
  masterId: 16016,
  baseVersionId: 9999,
  formValues,
  channels,
  tipBudgetCents: 2_400_000_00,
})

const bytes = estimateDraftPayloadBytes(state)
const kb = (bytes / 1024).toFixed(1)
const mb = (bytes / (1024 * 1024)).toFixed(2)
console.log(
  JSON.stringify(
    {
      mba: "PENFOLD016-class (synthetic)",
      lineCount: state.meta.lineCount,
      channels: CHANNELS.length,
      linesPerChannel,
      payloadBytes: bytes,
      payloadKB: Number(kb),
      payloadMB: Number(mb),
    },
    null,
    2
  )
)
