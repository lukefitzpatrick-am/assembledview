import assert from "node:assert/strict"
import test from "node:test"

import { PartnerIngestError } from "../errors"
import { parserForSource } from "../parsers"
import { parsePartnerFileMatrix } from "../parsers/parseChannelFactory"
import { parseVistarMatrix } from "../parsers/parseVistar"

test("channel-factory dispatches to the Channel Factory parser", () => {
  assert.equal(parserForSource("channel-factory"), parsePartnerFileMatrix)
})

test("vistar dispatches to the Vistar exchange parser", () => {
  assert.equal(parserForSource("vistar"), parseVistarMatrix)
})

test("an unknown source slug throws PartnerIngestError", () => {
  assert.throws(
    () => parserForSource("broadsign"),
    (err: unknown) =>
      err instanceof PartnerIngestError && /no parser for source/.test(err.message)
  )
})
