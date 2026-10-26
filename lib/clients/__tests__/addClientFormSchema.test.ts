import assert from "node:assert/strict"
import test from "node:test"

import {
  ADD_CLIENT_DEFAULTS,
  buildAddClientPayload,
  clientAddSchema,
} from "../addClientFormSchema"
import { LEGACY_PLATFORM_ID_FIELDS } from "../editClientFormSchema"

function filled() {
  return { ...ADD_CLIENT_DEFAULTS, clientname_input: "Acme Co", mbaidentifier: "acme" }
}

test("add schema has no legacy platform id fields", () => {
  const keys = Object.keys(clientAddSchema.shape)
  for (const field of LEGACY_PLATFORM_ID_FIELDS) {
    assert.equal(keys.includes(field), false, field)
  }
  assert.equal(keys.includes("id"), false)
  assert.equal(keys.includes("client_brain"), false)
  for (const field of LEGACY_PLATFORM_ID_FIELDS) {
    assert.equal(field in ADD_CLIENT_DEFAULTS, false, field)
  }
})

test("the defaults with a name and MBA identifier pass", () => {
  const parsed = clientAddSchema.safeParse(filled())
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues))
})

test("name and MBA identifier stay required", () => {
  const parsed = clientAddSchema.safeParse(ADD_CLIENT_DEFAULTS)
  assert.equal(parsed.success, false)
  const paths = parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."))
  assert.ok(paths.includes("clientname_input"))
  assert.ok(paths.includes("mbaidentifier"))
})

test("optional fields accept null, like the Edit form", () => {
  const parsed = clientAddSchema.safeParse({
    ...filled(),
    abn: null,
    clientcategory: null,
    state_dropdown: null,
    postcode: null,
    payment_days: null,
    keyemail: null,
    monthlyretainer: null,
    feesocial: null,
    television_checkbox: null,
    brand_colour: null,
  })
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues))
  if (parsed.success) {
    assert.equal(parsed.data.abn, "")
    assert.equal(parsed.data.postcode, undefined)
    assert.equal(parsed.data.payment_days, undefined)
  }
})

test("ABN: spaces and punctuation stripped, exactly 11 digits, digits saved", () => {
  const ok = clientAddSchema.safeParse({ ...filled(), abn: "34 010 601 911" })
  assert.equal(ok.success, true)
  if (ok.success) assert.equal(ok.data.abn, "34010601911")
  const dashed = clientAddSchema.safeParse({ ...filled(), abn: "51-824-753.556" })
  assert.equal(dashed.success, true)
  if (dashed.success) assert.equal(dashed.data.abn, "51824753556")
  const short = clientAddSchema.safeParse({ ...filled(), abn: "9515863300" })
  assert.equal(short.success, false)
  const letters = clientAddSchema.safeParse({ ...filled(), abn: "ABC12345678" })
  assert.equal(letters.success, false)
})

test("ABN failing the check digit still saves (warning only)", () => {
  const parsed = clientAddSchema.safeParse({ ...filled(), abn: "51 824 753 557" })
  assert.equal(parsed.success, true)
  if (parsed.success) assert.equal(parsed.data.abn, "51824753557")
})

test("payload maps the name and never carries legacy id columns", () => {
  const parsed = clientAddSchema.parse(filled())
  const forced = buildAddClientPayload({ ...parsed, idmeta: "x", idgoogleads: "y" } as typeof parsed)
  assert.equal(forced.mp_client_name, "Acme Co")
  assert.equal(forced.client_name, "Acme Co")
  assert.equal("clientname_input" in forced, false)
  for (const field of LEGACY_PLATFORM_ID_FIELDS) {
    assert.equal(field in forced, false, field)
  }
})
