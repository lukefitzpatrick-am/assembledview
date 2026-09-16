import assert from "node:assert/strict"
import test from "node:test"

import { helpRosterOptions } from "../helpRoster.js"
import type { TeamMember } from "../types.js"

function member(
  email: string,
  name: string,
  active = true
): TeamMember {
  return {
    id: email.length,
    email,
    name,
    role_title: null,
    active,
    capacity_notes: null,
    working_style: null,
    default_client_ids: [],
    created_at: "",
    updated_at: "",
  }
}

test("helpRosterOptions excludes the caller and inactive rows", () => {
  const options = helpRosterOptions(
    [
      member("luke@assembledmedia.com.au", "Luke"),
      member("Jane@AssembledMedia.com.au", "Jane"),
      member("pat@assembledmedia.com.au", "Pat", false),
    ],
    "Luke@AssembledMedia.com.au"
  )
  assert.deepEqual(
    options.map((m) => m.email),
    ["Jane@AssembledMedia.com.au"]
  )
})

test("helpRosterOptions keeps everyone when meEmail is empty", () => {
  const options = helpRosterOptions(
    [member("a@x.com", "A"), member("b@x.com", "B", false)],
    null
  )
  assert.deepEqual(
    options.map((m) => m.email),
    ["a@x.com"]
  )
})
