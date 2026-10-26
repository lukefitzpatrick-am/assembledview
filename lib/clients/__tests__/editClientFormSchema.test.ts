import assert from "node:assert/strict"
import test from "node:test"
import {
  LEGACY_PLATFORM_ID_FIELDS,
  buildEditClientDefaults,
  buildEditClientPayload,
  clientEditSchema,
  describeInvalidFields,
} from "../editClientFormSchema"

/** Hema (clients.id 15) as the API returns it: numeric strings coerced, 15 null id* columns. */
function hemaRow(): Record<string, unknown> & { id: number } {
  const row: Record<string, unknown> & { id: number } = {
    id: 15,
    mp_client_name: "Hema",
    mbaidentifier: "hema",
    clientcategory: "Caravans",
    abn: "34010601911",
    legalbusinessname: "Hema Maps Pty Ltd",
    streetaddress: "3 Wyman Place",
    suburb: "Braeside",
    state_dropdown: "VIC",
    postcode: 3195,
    keyfirstname: "Dominic",
    keylastname: "O'Brien",
    keyphone: 416154429,
    keyemail: "dobrien@hemagroup.com.au",
    billingfirstname: "Dominic",
    billinglastname: "O'Brien",
    billingphone: 416154429,
    billingemail: "dobrien@hemagroup.com.au",
    monthlyretainer: 0,
    organicsocial: 0,
    television_checkbox: true,
    radio_checkbox: true,
    newspapers_checkbox: true,
    magazines_checkbox: true,
    ooh_checkbox: true,
    cinema_checkbox: true,
    digitaldisplay_checkbox: true,
    digitalaudio_checkbox: true,
    digitalvideo_checkbox: true,
    bvod_checkbox: true,
    feesocial: 20,
    feesearch: 20,
    feeprogdisplay: 20,
    feeprogvideo: 20,
    feeprogbvod: 20,
    feeprogaudio: 20,
    feeprogooh: 20,
    feecontentcreator: 20,
    adservvideo: 0.89,
    adservimp: 0.12,
    adservdisplay: 0.12,
    adservaudio: 0.4,
    payment_days: 30,
    payment_terms: "Date of Invoice",
    brand_colour: "#D6642D",
    client_logo: null,
    website: "https://hemamaps.com/",
    facebook_url: "https://www.facebook.com/hemamaps/",
    instagram_url: "https://www.instagram.com/hemamaps/",
    linkedin_url: "https://au.linkedin.com/company/hema-maps",
    tiktok_url: null,
    client_brain: "brain",
    retainer_end_month: null,
    slug: "hema",
    sharepoint_site_url: "https://assembledmedia.sharepoint.com/sites/cli-hema",
    m365_is_anchor: true,
  }
  for (const field of LEGACY_PLATFORM_ID_FIELDS) row[field] = null
  return row
}

test("Hema-shaped client with nulls passes validation", () => {
  const parsed = clientEditSchema.safeParse(buildEditClientDefaults(hemaRow()))
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues))
})

test("raw row with nulls everywhere optional also passes (schema accepts null itself)", () => {
  const row: Record<string, unknown> = { id: 58, clientname_input: "Humanforce", mbaidentifier: "hf" }
  for (const key of Object.keys(clientEditSchema.shape)) {
    if (!(key in row)) row[key] = null
  }
  const parsed = clientEditSchema.safeParse(row)
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues))
  for (const [key, value] of Object.entries(parsed.data ?? {})) {
    assert.notEqual(value, null, `${key} should not come out as null`)
  }
})

test("legacy id* fields are not in the schema, defaults or payload", () => {
  const shape = clientEditSchema.shape as Record<string, unknown>
  const defaults = buildEditClientDefaults({ ...hemaRow(), idmeta: "123", idgoogleads: "999" }) as Record<
    string,
    unknown
  >
  const parsed = clientEditSchema.parse(defaults)
  const payload = buildEditClientPayload(parsed, { isAdmin: true, initialClientBrain: "brain" })
  for (const field of LEGACY_PLATFORM_ID_FIELDS) {
    assert.equal(field in shape, false, `${field} in schema`)
    assert.equal(field in defaults, false, `${field} in defaults`)
    assert.equal(field in payload, false, `${field} in payload`)
  }
  // Even if a caller passes them in, the payload builder strips them.
  const forced = buildEditClientPayload({ ...parsed, idmeta: "x" } as typeof parsed, {
    isAdmin: true,
    initialClientBrain: "brain",
  })
  assert.equal("idmeta" in forced, false)
})

test("unchanged Hema save: same values, no nulls, no extra columns", () => {
  const parsed = clientEditSchema.parse(buildEditClientDefaults(hemaRow()))
  const payload = buildEditClientPayload(parsed, { isAdmin: true, initialClientBrain: "brain" })
  const body = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
  for (const [key, value] of Object.entries(body)) {
    assert.notEqual(value, null, `${key} is null`)
  }
  assert.equal(body.mp_client_name, "Hema")
  assert.equal(body.postcode, 3195)
  assert.equal(body.payment_days, 30)
  assert.equal(body.feesocial, 20)
  assert.equal(body.adservvideo, 0.89)
  assert.equal(body.tiktok_url, "")
  assert.equal("client_brain_updated_at" in body, false)
  for (const key of ["client_logo", "retainer_end_month", "slug", "sharepoint_site_url", "m365_is_anchor", "clientname_input"]) {
    assert.equal(key in body, false, `${key} should not be sent`)
  }
})

test("null numbers stay unset instead of becoming 0 or ''", () => {
  const row = { ...hemaRow(), postcode: null, monthlyretainer: null, feesocial: null, adservaudio: null }
  const parsed = clientEditSchema.parse(buildEditClientDefaults(row))
  const body = JSON.parse(JSON.stringify(buildEditClientPayload(parsed, { isAdmin: true, initialClientBrain: "brain" })))
  for (const key of ["postcode", "monthlyretainer", "feesocial", "adservaudio"]) {
    assert.equal(key in body, false, `${key} should be omitted`)
  }
})

test("postcode 0 and '0' are treated as unset", () => {
  assert.equal(buildEditClientDefaults({ ...hemaRow(), postcode: 0 }).postcode, undefined)
  assert.equal(clientEditSchema.parse({ ...buildEditClientDefaults(hemaRow()), postcode: 0 }).postcode, undefined)
})

test("non-admin payload drops brain and link fields", () => {
  const parsed = clientEditSchema.parse(buildEditClientDefaults(hemaRow()))
  const payload = buildEditClientPayload(parsed, { isAdmin: false, initialClientBrain: "brain" })
  for (const key of ["website", "facebook_url", "instagram_url", "linkedin_url", "tiktok_url", "client_brain"]) {
    assert.equal(key in payload, false)
  }
})

test("brain change stamps client_brain_updated_at", () => {
  const parsed = clientEditSchema.parse({ ...buildEditClientDefaults(hemaRow()), client_brain: "new" })
  const payload = buildEditClientPayload(parsed, { isAdmin: true, initialClientBrain: "brain", now: () => 42 })
  assert.equal(payload.client_brain_updated_at, 42)
})

test("required fields stay required and invalid fields are named", () => {
  const parsed = clientEditSchema.safeParse({ ...buildEditClientDefaults(hemaRow()), mbaidentifier: "", abn: "0" })
  assert.equal(parsed.success, false)
  const errors: Record<string, { message?: string }> = {}
  for (const issue of parsed.error?.issues ?? []) errors[String(issue.path[0])] = { message: issue.message }
  const problems = describeInvalidFields(errors)
  assert.ok(problems.some((p) => p.startsWith("MBA Identifier: ")), problems.join(" | "))
  assert.ok(problems.some((p) => p.startsWith("ABN: ")), problems.join(" | "))
})
