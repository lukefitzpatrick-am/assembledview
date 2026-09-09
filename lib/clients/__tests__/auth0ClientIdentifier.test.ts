import assert from "node:assert/strict"
import { test } from "node:test"

import { resolveAuth0ClientIdentifier } from "@/lib/clients/auth0ClientIdentifier"
import { GOLF_CLIENT_ROWS } from "./golfClientRows.fixture"

test("resolveAuth0ClientIdentifier prefers clients.slug over mbaidentifier", () => {
  const golf = GOLF_CLIENT_ROWS[0]
  assert.equal(golf.slug, "golf-australia")
  assert.equal(golf.mbaidentifier, "golf")
  assert.equal(resolveAuth0ClientIdentifier(golf), "golf-australia")
})

test("resolveAuth0ClientIdentifier ignores mbaidentifier when slug is missing", () => {
  assert.equal(
    resolveAuth0ClientIdentifier({
      mbaidentifier: "golf",
      mp_client_name: "Golf Australia",
    }),
    "golf-australia",
  )
})

test("resolveAuth0ClientIdentifier does not treat mbaidentifier as a slug", () => {
  assert.equal(
    resolveAuth0ClientIdentifier({
      mbaidentifier: "golf",
    }),
    null,
  )
})
