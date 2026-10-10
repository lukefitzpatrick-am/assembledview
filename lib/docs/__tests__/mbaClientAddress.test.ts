import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { formatMbaClientAddressLines } from "../mbaClientAddress.js"

describe("formatMbaClientAddressLines", () => {
  it("prints no line when every part is null", () => {
    assert.deepEqual(
      formatMbaClientAddressLines({
        streetaddress: null,
        suburb: null,
        state: null,
        postcode: null,
      }),
      []
    )
  })

  it("prints a lone state", () => {
    assert.deepEqual(formatMbaClientAddressLines({ state: "VIC" }), ["VIC"])
  })

  it("keeps today's full address", () => {
    assert.deepEqual(
      formatMbaClientAddressLines({
        streetaddress: "1 Test St",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
      }),
      ["1 Test St", "Melbourne, VIC 3000"]
    )
  })

  it("omits a zero postcode and the add-client default state when nothing else is set", () => {
    assert.deepEqual(
      formatMbaClientAddressLines({
        streetaddress: null,
        suburb: "",
        state: "NSW",
        postcode: "0",
      }),
      []
    )
  })
})
