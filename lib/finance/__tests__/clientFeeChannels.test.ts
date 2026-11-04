/**
 * B22: CLIENT_FEE_CHANNELS is the one list of the 20 client fee columns.
 * Pins the list against the live clients columns and the hardcoded copies it
 * replaced (same fields, same order, same labels), so the refactor changes
 * no behaviour.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  CHANNEL_CLIENT_FEE_FIELDS,
  CLIENT_FEE_CHANNELS,
  CLIENT_FEE_FIELDS,
  CLIENT_FEE_FIELD_BY_MEDIA,
  CLIENT_FEE_MEDIA_TYPES,
  LEGACY_CLIENT_FEE_FIELDS,
  clientFeeFormRows,
} from "@/lib/finance/clientFeeChannels"
import { resolveFeePctFromFeeLoading } from "@/lib/finance/computeCampaignFinancials"
import { buildFeeLoadingFromEditorFees } from "@/lib/finance/buildEditorLineItemInputs"
import { feeChannelsFromLoading, feeLoadingFromSnapshot } from "@/lib/delivery/directDigitalFeeChannels"
import { summariseClientDetails } from "@/lib/ava/tools/summaries"
import {
  EDIT_CLIENT_FIELD_LABELS,
  LEGACY_FEE_FORM_FIELDS,
  clientEditSchema,
} from "@/lib/clients/editClientFormSchema"
import { ADD_CLIENT_DEFAULTS } from "@/lib/clients/addClientFormSchema"
import { normalizeClientWritePayload } from "@/lib/data/writeClients"
import { getTableColumns } from "drizzle-orm"
import { clients } from "@/db/schema/ported"

/** Live clients fee columns by ordinal_position (Supabase, read only, 4 Nov 2026). */
const LIVE_FEE_COLUMNS_BY_ORDINAL = [
  "feesocial", // 31
  "feesearch",
  "feeprogdisplay",
  "feeprogvideo",
  "feeprogbvod",
  "feeprogaudio",
  "feeprogooh",
  "feecontentcreator", // 38
  "feetelevision", // 76 (0113)
  "feeradio",
  "feenewspapers",
  "feemagazines",
  "feeooh",
  "feecinema",
  "feedigidisplay",
  "feedigiaudio",
  "feedigivideo",
  "feebvod",
  "feeintegration",
  "feeinfluencers", // 87
]

/** FEE_FIELD_BY_MEDIA as it was hardcoded in computeCampaignFinancials.ts before B22. */
const OLD_FEE_FIELD_BY_MEDIA = {
  television: "feetelevision",
  radio: "feeradio",
  newspaper: "feenewspapers",
  magazines: "feemagazines",
  ooh: "feeooh",
  cinema: "feecinema",
  digiDisplay: "feedigidisplay",
  digiAudio: "feedigiaudio",
  digiVideo: "feedigivideo",
  bvod: "feebvod",
  integration: "feeintegration",
  search: "feesearch",
  socialMedia: "feesocial",
  progDisplay: "feeprogdisplay",
  progVideo: "feeprogvideo",
  progBvod: "feeprogbvod",
  progAudio: "feeprogaudio",
  progOoh: "feeprogooh",
  influencers: "feeinfluencers",
  production: "feecontentcreator",
}

/** Ava FEE_KEYS as hardcoded before B22. */
const OLD_AVA_FEE_KEYS = [
  "feesearch",
  "feesocial",
  "feeprogdisplay",
  "feeprogvideo",
  "feeprogbvod",
  "feeprogaudio",
  "feeprogooh",
  "feecontentcreator",
  "feetelevision",
  "feeradio",
  "feenewspapers",
  "feemagazines",
  "feeooh",
  "feecinema",
  "feedigidisplay",
  "feedigiaudio",
  "feedigivideo",
  "feebvod",
  "feeintegration",
  "feeinfluencers",
]

/** The client form's old fee list (EditClientForm) and its schema labels. */
const OLD_FORM_FEES = [
  ["feesocial", "Social Media"],
  ["feesearch", "Search"],
  ["feeprogdisplay", "Prog Display"],
  ["feeprogvideo", "Prog Video"],
  ["feeprogbvod", "Prog BVOD"],
  ["feeprogaudio", "Prog Audio"],
  ["feeprogooh", "Prog OOH"],
  ["feecontentcreator", "Content Creator"],
] as const

test("20 rows, unique fields and media types, the 8 legacy and 12 from 0113", () => {
  assert.equal(CLIENT_FEE_CHANNELS.length, 20)
  assert.equal(new Set(CLIENT_FEE_FIELDS).size, 20)
  assert.equal(new Set(CLIENT_FEE_MEDIA_TYPES).size, 20)
  assert.equal(LEGACY_CLIENT_FEE_FIELDS.length, 8)
  assert.equal(CHANNEL_CLIENT_FEE_FIELDS.length, 12)
  assert.deepEqual(
    [...CHANNEL_CLIENT_FEE_FIELDS].sort(),
    [
      "feebvod",
      "feecinema",
      "feedigiaudio",
      "feedigidisplay",
      "feedigivideo",
      "feeinfluencers",
      "feeintegration",
      "feemagazines",
      "feenewspapers",
      "feeooh",
      "feeradio",
      "feetelevision",
    ],
  )
})

test("form order is the live clients column order", () => {
  const formOrder = [...clientFeeFormRows("legacy"), ...clientFeeFormRows("0113")].map((r) => r.field)
  assert.deepEqual(formOrder, LIVE_FEE_COLUMNS_BY_ORDINAL)
  assert.deepEqual(
    CLIENT_FEE_CHANNELS.map((r) => r.formOrder).sort((a, b) => a - b),
    Array.from({ length: 20 }, (_, i) => i + 1),
  )
})

test("FEE_FIELD_BY_MEDIA and the delivery lists are the old literals, same order", () => {
  assert.deepEqual(Object.entries(CLIENT_FEE_FIELD_BY_MEDIA), Object.entries(OLD_FEE_FIELD_BY_MEDIA))
  assert.deepEqual([...CLIENT_FEE_MEDIA_TYPES], Object.keys(OLD_FEE_FIELD_BY_MEDIA))
  assert.deepEqual([...CLIENT_FEE_FIELDS], Object.values(OLD_FEE_FIELD_BY_MEDIA))
  const all = Object.fromEntries(OLD_AVA_FEE_KEYS.map((k, i) => [k, i + 1]))
  assert.deepEqual(feeLoadingFromSnapshot({ ...all, feeunknown: 5 }), all)
  const channels = feeChannelsFromLoading({ feeooh: 7, feecontentcreator: 15 })
  assert.equal(channels.ooh, 7)
  assert.equal(channels.influencers, 15)
  assert.equal(channels.production, 0)
})

test("rules: Influencers inherits Content Creator, production never bills, integration has no fallback", () => {
  const influencers = CLIENT_FEE_CHANNELS.find((r) => r.mediaType === "influencers")!
  assert.equal(influencers.field, "feeinfluencers")
  assert.equal("inheritsFrom" in influencers ? influencers.inheritsFrom : undefined, "feecontentcreator")
  assert.deepEqual(
    CLIENT_FEE_CHANNELS.filter((r) => "inheritsFrom" in r).map((r) => r.field),
    ["feeinfluencers"],
  )
  assert.deepEqual(
    CLIENT_FEE_CHANNELS.filter((r) => !r.feeBearing).map((r) => r.mediaType),
    ["production"],
  )
  assert.equal(resolveFeePctFromFeeLoading("influencers", { feecontentcreator: 15 }), 15)
  assert.equal(resolveFeePctFromFeeLoading("influencers", { feeinfluencers: 0, feecontentcreator: 15 }), 0)
  assert.equal(resolveFeePctFromFeeLoading("production", { feecontentcreator: 15 }), 0)
  assert.equal(resolveFeePctFromFeeLoading("integration", { feecontentcreator: 15 }), 0)
})

test("buildFeeLoadingFromEditorFees: every field, list order, nulls skipped", () => {
  const state = Object.fromEntries(CLIENT_FEE_FIELDS.map((f, i) => [f, i + 1]))
  assert.deepEqual(Object.keys(buildFeeLoadingFromEditorFees(state)), Object.values(OLD_FEE_FIELD_BY_MEDIA))
  assert.deepEqual(buildFeeLoadingFromEditorFees({ feeooh: null, feesearch: 20, feeradio: undefined }), { feesearch: 20 })
})

test("Ava client details list the fees in the old order", () => {
  const raw: Record<string, unknown> = { id: 1, mp_client_name: "Krusty Krab" }
  for (const k of [...OLD_AVA_FEE_KEYS].reverse()) raw[k] = 10
  const out = summariseClientDetails(raw) as { fees?: Record<string, unknown> }
  assert.deepEqual(Object.keys(out.fees ?? {}), OLD_AVA_FEE_KEYS)
})

test("client forms: the 8 legacy fields, labels and add defaults are unchanged", () => {
  assert.deepEqual([...LEGACY_FEE_FORM_FIELDS], OLD_FORM_FEES.map(([f]) => f))
  assert.deepEqual(
    clientFeeFormRows("legacy").map((r) => [r.field, r.label]),
    OLD_FORM_FEES.map(([f, l]) => [f, l]),
  )
  for (const [field, label] of OLD_FORM_FEES) {
    assert.equal(EDIT_CLIENT_FIELD_LABELS[field], `Fee: ${label}`)
    assert.equal((ADD_CLIENT_DEFAULTS as Record<string, unknown>)[field], 20)
  }
  const shapeKeys = Object.keys(clientEditSchema.shape)
  const feeKeys = shapeKeys.filter((k) => k.startsWith("fee"))
  // The 8 legacy fees in the old order, then the 12 from 0113 (B22, form order).
  assert.deepEqual(feeKeys, [...OLD_FORM_FEES.map(([f]) => f), ...clientFeeFormRows("0113").map((r) => r.field)])
  // Same place in the shape: right after is_test_client, before adservvideo.
  const at = shapeKeys.indexOf("feesocial")
  assert.equal(shapeKeys[at - 1], "is_test_client")
  assert.equal(shapeKeys[at + 20], "adservvideo")
})

test("write path keeps all 20 fees with the switch on, the 8 old ones with it off (B22fix R2)", () => {
  const body: Record<string, unknown> = { mp_client_name: "Krusty Krab", mbaidentifier: "krusty" }
  for (const field of CLIENT_FEE_FIELDS) body[field] = 12
  const out = normalizeClientWritePayload(body, { channelFees: true })
  for (const field of CLIENT_FEE_FIELDS) assert.equal(out[field], 12, field)
  const off = normalizeClientWritePayload(body)
  for (const field of CLIENT_FEE_FIELDS) {
    assert.equal(off[field], (LEGACY_CLIENT_FEE_FIELDS as readonly string[]).includes(field) ? 12 : undefined, field)
  }
})

test("every fee field is a numeric column on the clients mirror, same name (0113 mirror)", () => {
  const columns = getTableColumns(clients) as Record<string, { name: string; columnType: string; notNull: boolean }>
  for (const field of CLIENT_FEE_FIELDS) {
    const col = columns[field]
    assert.ok(col, field)
    assert.equal(col.name, field)
    assert.equal(col.columnType, "PgNumeric", field)
    assert.equal(col.notNull, false, field)
  }
})
