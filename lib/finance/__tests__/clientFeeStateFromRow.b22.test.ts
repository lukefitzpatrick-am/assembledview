/**
 * B22: clientFeeStateFromRow is the one place a client row becomes editor fee
 * state (edit applyClientFees and the create client select).
 *
 * - Table test of the helper (switch off and on, null, 0, numeric strings).
 * - Money identity: with all 12 new columns null, the fee loading, the
 *   campaign financials and the stamped line fees are the same as before B22,
 *   with the switch off and on, for Krusty, Glendale (glenda008) and a
 *   Humanforce-shaped row. All 20 channels, plain, budget-includes-fees and
 *   client-pays lines.
 * - Snapshot shape: the fee loading built on edit equals the one built on
 *   create, and equals the pre-B22 edit page, so mba_fee_snapshots.fees keeps
 *   its keys (feeinfluencers included).
 * - Source pins: create sets all 20; edit applies every field. (S4 moved the
 *   switch read and the helper call into app/mediaplans/_form/clientFees.ts,
 *   tested by behaviour in clientFeeChannels.rateOn.s4.)
 */
import "@/lib/testing/bothZones"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import {
  CHANNEL_CLIENT_FEE_FIELDS,
  CLIENT_FEE_FIELDS,
  CLIENT_FEE_MEDIA_TYPES,
  LEGACY_CLIENT_FEE_FIELDS,
  clientFeeStateFromRow,
  type ClientFeeState,
} from "@/lib/finance/clientFeeChannels"
import {
  buildEditorLineItemInputs,
  buildFeeLoadingFromEditorFees,
  type EditorFeeState,
} from "@/lib/finance/buildEditorLineItemInputs"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import { stampClientFeePctOnLineItems } from "@/lib/finance/stampClientFeePctOnLineItems"
import { sumPersistedLineItemFeeAmounts } from "@/lib/billing/assertPersistedLineFeesMatchBilling"

/** Live fee columns (Supabase, read only, 4 Nov 2026), as mapClientRowFromPostgres returns them. */
const LIVE_LEGACY = {
  krusty: { feesearch: 20, feesocial: 20, feeprogdisplay: 20, feeprogvideo: 20, feeprogbvod: 20, feeprogaudio: 20, feeprogooh: 20, feecontentcreator: 20 },
  glendale: { feesearch: 20, feesocial: 20, feeprogdisplay: 20, feeprogvideo: 20, feeprogbvod: 20, feeprogaudio: 20, feeprogooh: 20, feecontentcreator: 20 },
  humanforce: { feesearch: 15, feesocial: 15, feeprogdisplay: 15, feeprogvideo: 15, feeprogbvod: 15, feeprogaudio: 15, feeprogooh: 15, feecontentcreator: 15 },
} as const

const NULL_12 = Object.fromEntries(CHANNEL_CLIENT_FEE_FIELDS.map((f) => [f, null]))

/** Before the B22 mirror: the row had none of the 12 keys. */
function preMirrorRow(name: keyof typeof LIVE_LEGACY): Record<string, unknown> {
  return { id: 1, mp_client_name: name, adservvideo: 0, adservimp: 0, adservdisplay: 0, adservaudio: 0, ...LIVE_LEGACY[name] }
}

/** After the mirror: the 12 keys are present, all null (every live client on 4 Nov 2026). */
function postMirrorRow(name: keyof typeof LIVE_LEGACY): Record<string, unknown> {
  return { ...preMirrorRow(name), ...NULL_12 }
}

/** The edit page's applyClientFees before B22, on a fresh page (all state null). */
function oldEditState(row: Record<string, unknown>): EditorFeeState {
  const state: Record<string, unknown> = Object.fromEntries(CLIENT_FEE_FIELDS.map((f) => [f, null]))
  const setIfDefined = (field: string, value: unknown) => {
    if (value !== undefined) state[field] = value ?? null
  }
  for (const field of CLIENT_FEE_FIELDS) {
    if (field !== "feeinfluencers") setIfDefined(field, row[field])
  }
  if (row.feeinfluencers !== undefined) state.feeinfluencers = row.feeinfluencers ?? null
  else if (row.feecontentcreator !== undefined) state.feeinfluencers = row.feecontentcreator ?? null
  return state as EditorFeeState
}

/** The create page before B22 (TV, radio, newspapers, magazines and OOH never set). */
function oldCreateState(row: Record<string, unknown>): EditorFeeState {
  const state: Record<string, unknown> = Object.fromEntries(CLIENT_FEE_FIELDS.map((f) => [f, null]))
  for (const field of ["feesearch", "feesocial", "feecinema", "feedigiaudio", "feedigidisplay", "feedigivideo", "feebvod", "feeprogdisplay", "feeprogvideo", "feeprogbvod", "feeprogaudio", "feeprogooh", "feecontentcreator"]) {
    state[field] = row[field]
  }
  state.feeintegration = row.feeintegration ?? null
  state.feeinfluencers = row.feeinfluencers ?? row.feecontentcreator ?? null
  return state as EditorFeeState
}

/** Edit page now: setIfDefined over the helper output, on a fresh page. */
function newEditState(row: Record<string, unknown>, channelFees: boolean): EditorFeeState {
  const state: Record<string, unknown> = Object.fromEntries(CLIENT_FEE_FIELDS.map((f) => [f, null]))
  const fees = clientFeeStateFromRow(row, { channelFees })
  for (const field of CLIENT_FEE_FIELDS) {
    const value = fees[field]
    if (value !== undefined) state[field] = value ?? null
  }
  return state as EditorFeeState
}

/** Create page now: every field `?? null`. */
function newCreateState(row: Record<string, unknown>, channelFees: boolean): EditorFeeState {
  const fees = clientFeeStateFromRow(row, { channelFees })
  return Object.fromEntries(CLIENT_FEE_FIELDS.map((f) => [f, fees[f] ?? null])) as EditorFeeState
}

function line(kind: "plain" | "includesFees" | "clientPays", budget = 10_000) {
  return {
    buy_type: "cpm",
    budgetIncludesFees: kind === "includesFees",
    clientPaysForMedia: kind === "clientPays",
    bursts: [
      { budget, buyAmount: 10, startDate: "2026-11-04", endDate: "2026-11-30" },
      { budget: budget / 2, buyAmount: 10, startDate: "2027-02-01", endDate: "2027-02-27" },
    ],
  }
}

const CONFIGS = CLIENT_FEE_MEDIA_TYPES.map((billingKey) => ({
  billingKey,
  lineItems: [line("plain"), line("includesFees", 7_500), line("clientPays", 4_000)],
  containerBursts: [],
}))

function money(state: EditorFeeState) {
  const feeLoading = buildFeeLoadingFromEditorFees(state)
  const financials = computeCampaignFinancials(buildEditorLineItemInputs(CONFIGS), { feeLoading }, {
    campaignStart: new Date("2026-11-04"),
    campaignEnd: new Date("2027-02-27"),
    getRateForMediaType: () => 0,
    adservaudio: 0,
  })
  const stamped = CONFIGS.flatMap((c) => stampClientFeePctOnLineItems(c.lineItems, c.billingKey, feeLoading))
  return {
    feeLoading,
    totals: financials.mbaScopeTotals,
    perLine: financials.perLine,
    billing: financials.billingSchedule,
    stampedPct: stamped.map((l) => l.feePct),
    stampedFee: sumPersistedLineItemFeeAmounts(stamped),
  }
}

test("helper: switch off ignores the 12; Influencers is Content Creator", () => {
  const row = { ...LIVE_LEGACY.humanforce, ...NULL_12, feeooh: 10, feedigiaudio: "10", feeinfluencers: 12 }
  const off = clientFeeStateFromRow(row, { channelFees: false })
  for (const f of CHANNEL_CLIENT_FEE_FIELDS) {
    if (f !== "feeinfluencers") assert.equal(f in off, false, f)
  }
  assert.equal(off.feeinfluencers, 15)
  for (const f of LEGACY_CLIENT_FEE_FIELDS) assert.equal(off[f], 15, f)
})

test("helper: switch on reads the 12; numeric strings become numbers", () => {
  const row = { ...LIVE_LEGACY.humanforce, ...NULL_12, feeooh: 10, feedigiaudio: "10", feecinema: "abc" }
  const on = clientFeeStateFromRow(row, { channelFees: true })
  assert.equal(on.feeooh, 10)
  assert.equal(on.feedigiaudio, 10)
  assert.equal(on.feecinema, null)
  assert.equal(on.feetelevision, null)
  assert.equal(on.feeinfluencers, 15)
  assert.equal(clientFeeStateFromRow({ feesearch: "17.5" }, { channelFees: false }).feesearch, 17.5)
})

test("helper: Influencers null, 0 and 12 with Content Creator 15", () => {
  const base = { feecontentcreator: 15 }
  const cases: [unknown, boolean, number | null][] = [
    [undefined, true, 15],
    [null, true, 15],
    [0, true, 0],
    [12, true, 12],
    ["12", true, 12],
    [null, false, 15],
    [0, false, 15],
    [12, false, 15],
  ]
  for (const [value, channelFees, expected] of cases) {
    const row = value === undefined ? base : { ...base, feeinfluencers: value }
    assert.equal(clientFeeStateFromRow(row, { channelFees }).feeinfluencers, expected, `${String(value)} ${channelFees}`)
  }
  assert.equal(clientFeeStateFromRow({ feeinfluencers: 9 }, { channelFees: true }).feeinfluencers, 9)
  assert.equal(clientFeeStateFromRow({ feecontentcreator: null }, { channelFees: true }).feeinfluencers, null)
})

test("helper: keys the row doesn't have stay out; null row is empty", () => {
  assert.deepEqual(clientFeeStateFromRow(null, { channelFees: true }), {})
  assert.deepEqual(clientFeeStateFromRow({ mp_client_name: "x" }, { channelFees: true }), {})
  const st: ClientFeeState = clientFeeStateFromRow({ feesearch: 20 }, { channelFees: true })
  assert.deepEqual(st, { feesearch: 20 })
})

for (const name of Object.keys(LIVE_LEGACY) as (keyof typeof LIVE_LEGACY)[]) {
  test(`${name}: money identical to before B22 with the 12 null, switch off and on`, () => {
    const before = money(oldEditState(preMirrorRow(name)))
    for (const channelFees of [false, true]) {
      assert.deepEqual(money(newEditState(postMirrorRow(name), channelFees)), before, `edit ${channelFees}`)
      assert.deepEqual(money(newCreateState(postMirrorRow(name), channelFees)), before, `create ${channelFees}`)
      assert.deepEqual(money(newEditState(preMirrorRow(name), channelFees)), before, `edit pre-mirror ${channelFees}`)
    }
    // Create before B22 billed the same too (every new field was empty).
    assert.deepEqual(money(oldCreateState(preMirrorRow(name))), before)
  })

  test(`${name}: published fee snapshot keys unchanged, edit equals create`, () => {
    const before = buildFeeLoadingFromEditorFees(oldEditState(preMirrorRow(name)))
    assert.equal(before.feeinfluencers, LIVE_LEGACY[name].feecontentcreator)
    for (const channelFees of [false, true]) {
      const edit = buildFeeLoadingFromEditorFees(newEditState(postMirrorRow(name), channelFees))
      const create = buildFeeLoadingFromEditorFees(newCreateState(postMirrorRow(name), channelFees))
      assert.deepEqual(edit, before)
      assert.deepEqual(create, edit)
      assert.deepEqual(JSON.stringify(edit), JSON.stringify(before))
    }
  })
}

test("Humanforce with OOH 10%: only OOH changes, and only with the switch on", () => {
  const row = { ...postMirrorRow("humanforce"), feeooh: 10 }
  const before = money(oldEditState(preMirrorRow("humanforce")))
  assert.deepEqual(money(newEditState(row, false)), before)
  const on = money(newEditState(row, true))
  assert.equal(on.feeLoading.feeooh, 10)
  for (const l of on.perLine) {
    const old = before.perLine.find((p) => p.lineItemId === l.lineItemId)!
    if (l.mediaType === "ooh") assert.ok(l.fee >= old.fee, l.lineItemId)
    else assert.equal(l.fee, old.fee, l.lineItemId)
  }
  assert.ok(on.totals.fee > before.totals.fee)
  // Create now gives OOH its fee as well (it never set feeooh before B22).
  assert.deepEqual(money(newCreateState(row, true)), on)
})

const editPage = readFileSync(join(process.cwd(), "app/mediaplans/mba/[mba_number]/edit/page.tsx"), "utf8")
const createPage = readFileSync(join(process.cwd(), "app/mediaplans/create/page.tsx"), "utf8")

test("source: create sets all 20 fee states from the helper", () => {
  const setters: Record<string, string> = {
    feetelevision: "setFeeTelevision",
    feeradio: "setFeeRadio",
    feenewspapers: "setFeeNewspapers",
    feemagazines: "setFeeMagazines",
    feeooh: "setFeeOoh",
    feecinema: "setFeeCinema",
    feedigidisplay: "setFeeDigiDisplay",
    feedigiaudio: "setFeeDigiAudio",
    feedigivideo: "setFeeDigiVideo",
    feebvod: "setFeeBVOD",
    feeintegration: "setFeeIntegration",
    feesearch: "setFeeSearch",
    feesocial: "setFeeSocial",
    feeprogdisplay: "setFeeProgDisplay",
    feeprogvideo: "setFeeProgVideo",
    feeprogbvod: "setFeeProgBvod",
    feeprogaudio: "setFeeProgAudio",
    feeprogooh: "setFeeProgOoh",
    feeinfluencers: "setFeeInfluencers",
    feecontentcreator: "setFeeContentCreator",
  }
  assert.deepEqual(Object.keys(setters).sort(), [...CLIENT_FEE_FIELDS].sort())
  for (const [field, setter] of Object.entries(setters)) {
    assert.ok(createPage.includes(`${setter}(clientFees.${field} ?? null);`), field)
    assert.ok(createPage.includes(`${setter}(null);`), `${field} reset`)
  }
})

test("source: edit applies every field the helper returns", () => {
  const body = editPage.slice(editPage.indexOf("const applyClientFees = useCallback"), editPage.indexOf("// Ad serving", editPage.indexOf("const applyClientFees = useCallback")))
  for (const field of CLIENT_FEE_FIELDS) {
    assert.match(body, new RegExp(`setIfDefined\\(fees\\.${field}, setFee`), field)
  }
  assert.doesNotMatch(body, /clientData\.fee/)
})
