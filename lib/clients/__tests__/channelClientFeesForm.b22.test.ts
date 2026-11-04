/**
 * B22: the 12 channel client fees on the client forms and the write path
 * (decisions B22 Q2, Q3 and Q8).
 *
 * - Clearable: a cleared box is null, never 0 (Influencers keeps inheriting).
 * - Admin only, and only with the switch channel_client_fees on. Off, the PUT
 *   and POST bodies are what they were before B22.
 * - New clients: the 12 default blank; the 8 old fees keep 20.
 * - writeClients: the 12 are writable and an explicit null clears them; every
 *   other column still drops null.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import {
  CHANNEL_FEE_FORM_FIELDS,
  EDIT_CLIENT_FIELD_LABELS,
  buildEditClientDefaults,
  buildEditClientPayload,
  channelFeeInheritPlaceholder,
  clientEditSchema,
} from "@/lib/clients/editClientFormSchema"
import { ADD_CLIENT_DEFAULTS, buildAddClientPayload, clientAddSchema } from "@/lib/clients/addClientFormSchema"
import { normalizeClientWritePayload } from "@/lib/data/writeClients"
import { CHANNEL_CLIENT_FEE_FIELDS, LEGACY_CLIENT_FEE_FIELDS } from "@/lib/finance/clientFeeChannels"

const NULL_12 = Object.fromEntries(CHANNEL_CLIENT_FEE_FIELDS.map((f) => [f, null]))

/** A Humanforce-shaped row as GET /api/clients returns it after the mirror. */
function row(extra: Record<string, unknown> = {}): Record<string, unknown> & { id: number } {
  return {
    id: 58,
    mp_client_name: "Humanforce",
    mbaidentifier: "HUMFOR",
    payment_days: 30,
    feesearch: 15,
    feesocial: 15,
    feeprogdisplay: 15,
    feeprogvideo: 15,
    feeprogbvod: 15,
    feeprogaudio: 15,
    feeprogooh: 15,
    feecontentcreator: 15,
    adservvideo: 0.89,
    adservimp: 0.12,
    adservdisplay: 0.12,
    adservaudio: 0.4,
    ...NULL_12,
    ...extra,
  }
}

function parse(values: Record<string, unknown>) {
  const r = clientEditSchema.safeParse(values)
  assert.ok(r.success, JSON.stringify(r.success ? null : r.error.issues))
  return r.data
}

const opts = (isAdmin: boolean, channelFees: boolean) => ({ isAdmin, channelFees, initialClientBrain: "", now: () => 1 })

test("form list: the 12 in clients column order, with labels", () => {
  assert.deepEqual(
    [...CHANNEL_FEE_FORM_FIELDS],
    ["feetelevision", "feeradio", "feenewspapers", "feemagazines", "feeooh", "feecinema", "feedigidisplay", "feedigiaudio", "feedigivideo", "feebvod", "feeintegration", "feeinfluencers"],
  )
  assert.equal(EDIT_CLIENT_FIELD_LABELS.feeooh, "Fee: OOH")
  assert.equal(EDIT_CLIENT_FIELD_LABELS.feeinfluencers, "Fee: Influencers")
  assert.equal(EDIT_CLIENT_FIELD_LABELS.feesocial, "Fee: Social Media")
})

test("schema: null and blank stay null, untouched stays out, range checked", () => {
  const d = buildEditClientDefaults(row())
  for (const f of CHANNEL_CLIENT_FEE_FIELDS) assert.equal((d as Record<string, unknown>)[f], undefined, f)
  const parsed = parse({ ...d, feeooh: 10, feeradio: null, feecinema: "", feebvod: "7.5" }) as Record<string, unknown>
  assert.equal(parsed.feeooh, 10)
  assert.equal(parsed.feeradio, null)
  assert.equal(parsed.feecinema, null)
  assert.equal(parsed.feebvod, 7.5)
  assert.equal("feetelevision" in parsed && parsed.feetelevision !== undefined, false)
  assert.equal(clientEditSchema.safeParse({ ...d, feeooh: 101 }).success, false)
  assert.equal(clientEditSchema.safeParse({ ...d, feeooh: -1 }).success, false)
  // The 8 old fees keep their rule: null is "not set" (undefined).
  const legacy = parse({ ...d, feesearch: null }) as Record<string, unknown>
  assert.equal(legacy.feesearch, undefined)
})

test("edit payload: admin with the switch on carries set and cleared values, never 0 for a cleared box", () => {
  const values = parse({ ...buildEditClientDefaults(row({ feeinfluencers: 12, feeooh: 10 })), feeinfluencers: null, feedigiaudio: 10 })
  const body = buildEditClientPayload(values, opts(true, true))
  assert.equal(body.feeooh, 10)
  assert.equal(body.feedigiaudio, 10)
  assert.equal(body.feeinfluencers, null)
  assert.equal("feetelevision" in body && body.feetelevision !== undefined, false)
  const json = JSON.parse(JSON.stringify(body)) as Record<string, unknown>
  assert.equal(json.feeinfluencers, null)
  assert.equal("feetelevision" in json, false)
  for (const f of LEGACY_CLIENT_FEE_FIELDS) assert.equal(json[f], 15, f)
})

test("edit payload: switch off or not admin is the pre-B22 body", () => {
  const withRates = row({ feeooh: 10, feeinfluencers: 12 })
  const preB22Row = Object.fromEntries(Object.entries(withRates).filter(([k]) => !(CHANNEL_CLIENT_FEE_FIELDS as readonly string[]).includes(k))) as typeof withRates
  const preB22 = JSON.stringify(buildEditClientPayload(parse(buildEditClientDefaults(preB22Row)), opts(true, false)))
  for (const [isAdmin, channelFees] of [[true, false], [false, true], [false, false]] as const) {
    const body = buildEditClientPayload(parse({ ...buildEditClientDefaults(withRates), feeradio: null }), opts(isAdmin, channelFees))
    for (const f of CHANNEL_CLIENT_FEE_FIELDS) assert.equal(f in body, false, `${f} ${isAdmin} ${channelFees}`)
    if (isAdmin) assert.equal(JSON.stringify(body), preB22)
  }
  // Callers that don't pass the switch get the old body.
  const legacyCall = buildEditClientPayload(parse(buildEditClientDefaults(withRates)), { isAdmin: true, initialClientBrain: "" })
  for (const f of CHANNEL_CLIENT_FEE_FIELDS) assert.equal(f in legacyCall, false, f)
})

test("add: the 12 default blank, the 8 old fees 20; POST carries the 12 only for an admin with the switch on", () => {
  for (const f of CHANNEL_CLIENT_FEE_FIELDS) assert.equal(f in ADD_CLIENT_DEFAULTS, false, f)
  for (const f of LEGACY_CLIENT_FEE_FIELDS) assert.equal((ADD_CLIENT_DEFAULTS as Record<string, unknown>)[f], 20, f)
  const base = { ...ADD_CLIENT_DEFAULTS, clientname_input: "New Co", mbaidentifier: "newco" }
  const parsedBlank = clientAddSchema.parse(base)
  const blankBody = JSON.parse(JSON.stringify(buildAddClientPayload(parsedBlank, { isAdmin: true, channelFees: true })))
  for (const f of CHANNEL_CLIENT_FEE_FIELDS) assert.equal(f in blankBody, false, f)
  const parsed = clientAddSchema.parse({ ...base, feeooh: 10 })
  assert.equal(buildAddClientPayload(parsed, { isAdmin: true, channelFees: true }).feeooh, 10)
  assert.equal("feeooh" in buildAddClientPayload(parsed, { isAdmin: true, channelFees: false }), false)
  assert.equal("feeooh" in buildAddClientPayload(parsed), false)
  assert.equal(JSON.stringify(buildAddClientPayload(parsed)), JSON.stringify(buildAddClientPayload(parsedBlank)))
})

test("writeClients: the 12 are writable; explicit null clears only the 12", () => {
  const out = normalizeClientWritePayload(
    { feeooh: 10, feeradio: null, feeinfluencers: 0, feecinema: "", feesearch: null, website: null },
    { requireIdentity: false },
  )
  assert.deepEqual(out, { feeooh: 10, feeradio: null, feeinfluencers: 0 })
  for (const f of CHANNEL_CLIENT_FEE_FIELDS) {
    assert.deepEqual(normalizeClientWritePayload({ [f]: null }, { requireIdentity: false }), { [f]: null }, f)
    assert.deepEqual(normalizeClientWritePayload({ [f]: 10 }, { requireIdentity: false }), { [f]: 10 }, f)
  }
  for (const f of LEGACY_CLIENT_FEE_FIELDS) {
    assert.deepEqual(normalizeClientWritePayload({ [f]: null }, { requireIdentity: false }), {}, f)
  }
})

test("Influencers placeholder names the Content Creator rate", () => {
  assert.equal(channelFeeInheritPlaceholder(15), "Uses Content Creator (15.00%)")
  assert.equal(channelFeeInheritPlaceholder("17.5"), "Uses Content Creator (17.50%)")
  assert.equal(channelFeeInheritPlaceholder(undefined), "Uses Content Creator")
  assert.equal(channelFeeInheritPlaceholder(""), "Uses Content Creator")
})

const editForm = readFileSync(join(process.cwd(), "components/EditClientForm.tsx"), "utf8")
const addForm = readFileSync(join(process.cwd(), "components/AddClientForm.tsx"), "utf8")

test("source: both forms gate the 12 on admin and the switch, and pass the switch to the payload", () => {
  for (const [label, src, call] of [
    ["edit", editForm, "buildEditClientPayload(data, { isAdmin, initialClientBrain, channelFees: channelFeesOn })"],
    ["add", addForm, "buildAddClientPayload(data, { isAdmin, channelFees: channelFeesOn })"],
  ] as const) {
    assert.equal((src.match(/clientFeatureOn\("channel_client_fees"\)/g) ?? []).length, 1, label)
    assert.ok(src.includes("{isAdmin && channelFeesOn ? ("), label)
    assert.ok(src.includes('clientFeeFormRows("0113").map('), label)
    assert.ok(src.includes(call), label)
  }
  // Edit: a cleared box is null; the 8 old boxes keep their 0 (TypedNumberInput, B22fix R1).
  const group = editForm.slice(editForm.indexOf('clientFeeFormRows("0113")'))
  assert.match(group.slice(0, 2000), /<TypedNumberInput\s+\{\.\.\.field\}\s+format=\{formatPercentage\}\s+empty=\{null\}/)
  // Add: blank is undefined (never sent), not 0.
  const addGroup = addForm.slice(addForm.indexOf('clientFeeFormRows("0113")'))
  assert.match(addGroup.slice(0, 2000), /numberOrUndefined\(e\.target\.value, e\.target\.valueAsNumber\)/)
})
